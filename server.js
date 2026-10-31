import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { openStore, hashPassword, verifyPassword, userView, battleView } from './lib/store.js';
import { createBattleState, applyAction } from './lib/combat.js';

const root = dirname(fileURLToPath(import.meta.url));
const SESSION_AGE = 7 * 24 * 60 * 60 * 1000;
const sessionHash = value => createHash('sha256').update(value).digest('hex');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function requireThat(condition, status, message) {
  if (!condition) throw new HttpError(status, message);
}

function text(value, min, max, label) {
  requireThat(typeof value === 'string', 400, `${label} fehlt.`);
  const clean = value.trim();
  requireThat(clean.length >= min && clean.length <= max, 400,
    `${label} muss ${min} bis ${max} Zeichen lang sein.`);
  return clean;
}

async function readJson(req) {
  requireThat(req.headers['content-type']?.split(';')[0].trim() === 'application/json',
    415, 'Bitte JSON senden.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    requireThat(size <= 16_384, 413, 'Die Anfrage ist zu groß.');
    chunks.push(chunk);
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requireThat(result && typeof result === 'object' && !Array.isArray(result), 400, 'Ungültige Anfrage.');
    return result;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Ungültiges JSON.');
  }
}

export function createApp({ dbPath = join(root, '.data', 'klassenhelden.sqlite'), demo = true,
  secureCookies = false, now = () => Date.now() } = {}) {
  const db = openStore(dbPath, { demo });
  const attempts = new Map();
  const byId = id => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const readBattle = id => db.prepare('SELECT * FROM battles WHERE id = ?').get(id);
  const cookie = (token, maxAge) => `kh_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;

  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  function currentUser(req) {
    const token = req.headers.cookie?.split(';').map(p => p.trim()).find(p => p.startsWith('kh_session='))?.slice(11);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const row = db.prepare(`SELECT users.* FROM users JOIN sessions ON sessions.user_id = users.id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(sessionHash(token), now());
    return row || null;
  }

  function login(res, userId) {
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(sessionHash(token), userId, now() + SESSION_AGE);
    res.setHeader('Set-Cookie', cookie(token, SESSION_AGE / 1000));
  }

  function rateLimit(req) {
    const key = req.socket.remoteAddress || 'local';
    let slot = attempts.get(key);
    if (!slot || slot.expires <= now()) {
      slot = { count: 0, expires: now() + 15 * 60 * 1000 };
      attempts.set(key, slot);
    }
    requireThat(slot.count < 30, 429, 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.');
    slot.count++;
    if (attempts.size > 1000) for (const [ip, value] of attempts) if (value.expires <= now()) attempts.delete(ip);
  }

  function studentOnly(user) {
    requireThat(user.role === 'student', 403, 'Diese Aktion ist nur für Schülerkonten verfügbar.');
  }

  function saveBattle(id, state) {
    db.prepare('UPDATE battles SET state = ?, status = ? WHERE id = ?')
      .run(JSON.stringify(state), state.status, id);
  }

  async function api(req, res, path) {
    const method = req.method;
    let body = null;
    if (method !== 'GET') {
      requireThat(method === 'POST', 405, 'Diese Methode wird nicht unterstützt.');
      requireThat(req.headers['sec-fetch-site'] !== 'cross-site', 403, 'Fremde Webseiten dürfen keine Aktionen ausführen.');
      if (req.headers.origin) {
        let origin;
        try { origin = new URL(req.headers.origin); } catch { throw new HttpError(403, 'Ungültiger Ursprung.'); }
        requireThat(origin.host === req.headers.host, 403, 'Fremde Webseiten dürfen keine Aktionen ausführen.');
      }
      body = await readJson(req);
    }

    if (path === '/api/session' && method === 'GET') {
      const user = currentUser(req);
      return { user: user ? userView(user, { includeEmail: true }) : null, demoMode: demo };
    }

    if (path === '/api/auth/login' && method === 'POST') {
      rateLimit(req);
      const email = text(body.email, 3, 254, 'E-Mail-Adresse').toLowerCase();
      const password = text(body.password, 1, 200, 'Passwort');
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      // Run the KDF even for unknown accounts to avoid a fast account-existence signal.
      const fallbackHash = '00000000000000000000000000000000:' + '00'.repeat(64);
      const valid = verifyPassword(password, user?.password_hash || fallbackHash);
      requireThat(user && valid, 401, 'E-Mail-Adresse oder Passwort stimmt nicht.');
      login(res, user.id);
      return { user: userView(user, { includeEmail: true }) };
    }

    if (path === '/api/auth/register' && method === 'POST') {
      requireThat(demo, 403, 'Die öffentliche Registrierung ist deaktiviert.');
      rateLimit(req);
      const name = text(body.name, 2, 60, 'Name');
      const email = text(body.email, 3, 254, 'E-Mail-Adresse').toLowerCase();
      requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 400, 'Bitte eine gültige E-Mail-Adresse eingeben.');
      const password = text(body.password, 10, 200, 'Passwort');
      const character = text(body.characterName, 2, 30, 'Heldenname');
      requireThat(!db.prepare('SELECT 1 FROM users WHERE email = ?').get(email), 409, 'Diese E-Mail-Adresse wird bereits verwendet.');
      const id = randomUUID();
      // A submitted role, XP balance or inventory is deliberately never accepted.
      db.prepare(`INSERT INTO users (id, name, email, password_hash, role, character_name, created_at)
        VALUES (?, ?, ?, ?, 'student', ?, ?)`).run(id, name, email, hashPassword(password), character, new Date(now()).toISOString());
      login(res, id);
      return { user: userView(byId(id), { includeEmail: true }) };
    }

    const user = currentUser(req);
    requireThat(user, 401, 'Bitte zuerst anmelden.');

    if (path === '/api/auth/logout' && method === 'POST') {
      const token = req.headers.cookie?.split(';').map(p => p.trim()).find(p => p.startsWith('kh_session='))?.slice(11);
      if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sessionHash(token));
      res.setHeader('Set-Cookie', cookie('', 0));
      return { ok: true };
    }

    if (path === '/api/state' && method === 'GET') {
      const students = db.prepare("SELECT * FROM users WHERE school_id = ? AND role = 'student' ORDER BY name").all(user.school_id);
      const battles = user.role === 'student'
        ? db.prepare(`SELECT * FROM battles WHERE challenger_id = ? OR opponent_id = ?
            ORDER BY created_at DESC LIMIT 100`).all(user.id, user.id) : [];
      const rewards = db.prepare(`SELECT rewards.*, s.name AS student_name, t.name AS teacher_name
        FROM rewards JOIN users s ON s.id = rewards.student_id JOIN users t ON t.id = rewards.teacher_id
        WHERE s.school_id = ? AND (? = 'teacher' OR rewards.student_id = ?)
        ORDER BY rewards.created_at DESC LIMIT 100`).all(user.school_id, user.role, user.id);
      return {
        user: userView(user, { includeEmail: true }),
        students: students.map(s => userView(s, { includeEmail: user.role === 'teacher' || s.id === user.id })),
        battles: battles.map(battleView),
        rewards: rewards.map(r => ({ id: r.id, studentId: r.student_id, studentName: r.student_name,
          teacherName: r.teacher_name, xp: r.xp, item: r.item, reason: r.reason, createdAt: r.created_at })),
      };
    }

    if (path === '/api/character' && method === 'POST') {
      studentOnly(user);
      const character = text(body.characterName, 2, 30, 'Heldenname');
      requireThat(['fox', 'owl', 'dragon', 'cat'].includes(body.avatar), 400, 'Bitte einen verfügbaren Avatar wählen.');
      db.prepare('UPDATE users SET character_name = ?, avatar = ? WHERE id = ?').run(character, body.avatar, user.id);
      return { user: userView(byId(user.id), { includeEmail: true }) };
    }

    if (path === '/api/skills/upgrade' && method === 'POST') {
      studentOnly(user);
      requireThat(['strength', 'focus', 'endurance'].includes(body.skill), 400, 'Unbekannte Fähigkeit.');
      const skills = JSON.parse(user.skills);
      const cost = skills[body.skill] * 25;
      requireThat(skills[body.skill] < 10, 400, 'Diese Fähigkeit hat bereits Stufe 10 erreicht.');
      requireThat(user.xp >= cost, 400, `Dafür brauchst du ${cost} verfügbare XP.`);
      skills[body.skill]++;
      db.prepare('UPDATE users SET skills = ?, xp = xp - ? WHERE id = ?').run(JSON.stringify(skills), cost, user.id);
      return { user: userView(byId(user.id), { includeEmail: true }) };
    }

    if (path === '/api/rewards' && method === 'POST') {
      requireThat(user.role === 'teacher', 403, 'Nur Lehrkräfte dürfen Belohnungen vergeben.');
      requireThat(typeof body.studentId === 'string' && body.studentId.trim().length > 0 && body.studentId.length <= 100, 400, 'Bitte ein Schülerkonto auswählen.');
      const student = byId(body.studentId);
      requireThat(student?.role === 'student' && student.school_id === user.school_id, 404, 'Schülerkonto nicht gefunden.');
      requireThat(Number.isInteger(body.xp) && body.xp >= 0 && body.xp <= 100, 400, 'Bitte 0 bis 100 XP vergeben.');
      requireThat(body.item === null || body.item === 'potion', 400, 'Unbekannter Gegenstand.');
      requireThat(body.xp > 0 || body.item, 400, 'Bitte XP oder einen Gegenstand auswählen.');
      const reason = text(body.reason, 3, 160, 'Begründung');
      const inventory = JSON.parse(student.inventory);
      if (body.item) inventory[body.item]++;
      transaction(() => {
        db.prepare('UPDATE users SET xp = xp + ?, total_xp = total_xp + ?, inventory = ? WHERE id = ?')
          .run(body.xp, body.xp, JSON.stringify(inventory), student.id);
        db.prepare('INSERT INTO rewards (id, student_id, teacher_id, xp, item, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(randomUUID(), student.id, user.id, body.xp, body.item, reason, new Date(now()).toISOString());
      });
      return { ok: true };
    }

    if (path === '/api/battles' && method === 'POST') {
      studentOnly(user);
      requireThat(typeof body.opponentId === 'string' && body.opponentId.trim().length > 0 && body.opponentId.length <= 100, 400, 'Bitte einen Gegner auswählen.');
      const training = body.opponentId === 'training-bot';
      const opponent = training ? { id: 'training-bot', name: 'Trainingswächter', characterName: 'Trainingswächter',
        skills: { strength: 1, focus: 1, endurance: 1 } } : byId(body.opponentId);
      requireThat(opponent && (training || (opponent.role === 'student' && opponent.school_id === user.school_id)), 404, 'Gegner nicht gefunden.');
      requireThat(opponent.id !== user.id, 400, 'Du kannst dich nicht selbst herausfordern.');
      const ongoing = db.prepare(`SELECT * FROM battles WHERE status IN ('pending', 'active')
        AND (challenger_id = ? OR opponent_id = ?)`).all(user.id, user.id);
      requireThat(ongoing.length < 5, 409, 'Du hast bereits fünf offene Duelle. Beende zuerst eines davon.');
      requireThat(!ongoing.some(b => (b.challenger_id === user.id && b.opponent_id === opponent.id)
        || (b.challenger_id === opponent.id && b.opponent_id === user.id)), 409, 'Mit diesem Gegner hast du bereits ein offenes Duell.');
      const state = training ? createBattleState(userView(user), opponent) : null;
      const id = randomUUID();
      db.prepare('INSERT INTO battles (id, type, challenger_id, opponent_id, status, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, training ? 'training' : 'pvp', user.id, opponent.id, training ? 'active' : 'pending',
          state ? JSON.stringify(state) : null, new Date(now()).toISOString());
      return { battle: battleView(readBattle(id)) };
    }

    const battleRoute = path.match(/^\/api\/battles\/([^/]+)\/(respond|actions|cancel)$/);
    if (battleRoute && method === 'POST') {
      studentOnly(user);
      const [, id, operation] = battleRoute;
      const battle = readBattle(id);
      requireThat(battle && [battle.challenger_id, battle.opponent_id].includes(user.id), 404, 'Duell nicht gefunden.');
      if (operation === 'cancel') {
        requireThat(battle.status === 'pending' || battle.status === 'active', 409, 'Dieses Duell ist bereits beendet.');
        if (battle.status === 'pending') {
          requireThat(battle.challenger_id === user.id, 403, 'Nur der Herausforderer kann eine Einladung zurückziehen.');
          db.prepare("UPDATE battles SET status = 'declined' WHERE id = ?").run(id);
        } else {
          const state = JSON.parse(battle.state);
          state.status = 'finished';
          state.winnerId = state.fighters.find(f => f.id !== user.id).id;
          state.log.push(`${user.character_name} gibt das Duell auf.`);
          state.log = state.log.slice(-24);
          saveBattle(id, state);
        }
      } else if (operation === 'respond') {
        requireThat(battle.opponent_id === user.id, 403, 'Nur der herausgeforderte Spieler kann antworten.');
        requireThat(battle.status === 'pending', 409, 'Diese Einladung wurde bereits beantwortet.');
        requireThat(typeof body.accept === 'boolean', 400, 'Bitte annehmen oder ablehnen.');
        if (body.accept) {
          const state = createBattleState(userView(byId(battle.challenger_id)), userView(user));
          saveBattle(id, state);
        } else db.prepare("UPDATE battles SET status = 'declined' WHERE id = ?").run(id);
      } else {
        requireThat(battle.status === 'active', 409, 'Dieses Duell ist nicht aktiv.');
        const inventory = JSON.parse(user.inventory);
        let result;
        try { result = applyAction(JSON.parse(battle.state), user.id, body.action, inventory); }
        catch (error) { throw new HttpError(400, error.message); }
        let state = result.state;
        if (battle.type === 'training' && state.status === 'active' && state.turnId === 'training-bot') {
          const bot = state.fighters.find(f => f.id === 'training-bot');
          const action = (bot.focusCooldown || 0) === 0 ? 'focus' : 'attack';
          state = applyAction(state, 'training-bot', action).state;
        }
        transaction(() => {
          if (result.consumedItem) {
            inventory[result.consumedItem]--;
            db.prepare('UPDATE users SET inventory = ? WHERE id = ?').run(JSON.stringify(inventory), user.id);
          }
          saveBattle(id, state);
        });
      }
      return { battle: battleView(readBattle(id)) };
    }
    throw new HttpError(404, 'Diese Funktion wurde nicht gefunden.');
  }

  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        const result = await api(req, res, path);
        res.end(JSON.stringify(result));
        return;
      }
      requireThat(req.method === 'GET' || req.method === 'HEAD', 405, 'Diese Methode wird nicht unterstützt.');
      const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
      requireThat(Object.hasOwn(assets, path), 404, 'Seite nicht gefunden.');
      const [filename, mime] = assets[path];
      const content = await readFile(join(root, 'public', filename));
      res.setHeader('Content-Type', `${mime}; charset=utf-8`);
      res.setHeader('Cache-Control', 'no-cache');
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (!res.headersSent) {
        res.statusCode = error.status || 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: error.status ? error.message : 'Ein unerwarteter Fehler ist aufgetreten.' }));
      } else res.end();
      if (!error.status) console.error(error);
    }
  });
  return { server, db, close: () => new Promise((done, reject) => {
    server.close(error => { if (error) reject(error); else { db.close(); done(); } });
    server.closeIdleConnections();
  }) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const app = createApp({ dbPath: process.env.DATABASE_PATH || join(root, '.data', 'klassenhelden.sqlite'),
    demo: process.env.DEMO_MODE !== 'false', secureCookies: process.env.COOKIE_SECURE === 'true' });
  app.server.listen(port, process.env.HOST || '0.0.0.0', () => {
    console.log(`Klassenhelden läuft auf Port ${port}. ${process.env.DEMO_MODE === 'false' ? 'Demomodus deaktiviert.' : 'Demomodus mit Beispielkonten aktiv.'}`);
  });
  const shutdown = () => app.close().then(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
