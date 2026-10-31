import { randomUUID } from 'node:crypto';
import { createTower, applyTowerAction, applyTowerChoice, createRaid, submitRaidAction, TOWER_BOONS } from './adventures.js';
import { cosmeticCatalogue } from './cosmetics.js';

const ROUND_TIME = 120_000;
const RAID_REWARDS = ['pet-rune', 'outfit-runekeeper', 'trophy-golem'];

export function createAdventureApi({ db, viewUser, byId, transaction, now, requireThat, studentOnly }) {
  const timestamp = () => new Date(now()).toISOString();
  const readTower = id => db.prepare('SELECT * FROM tower_runs WHERE user_id = ?').get(id);
  const towerView = row => row ? { id: row.id, state: JSON.parse(row.state) } : null;
  const readRaid = id => db.prepare('SELECT * FROM raids WHERE id = ?').get(id);
  const raidView = row => ({ id: row.id, leaderId: row.leader_id, status: row.status,
    state: JSON.parse(row.state), createdAt: row.created_at });
  const saveTower = (userId, state) => db.prepare('UPDATE tower_runs SET state = ?, updated_at = ? WHERE user_id = ?')
    .run(JSON.stringify(state), timestamp(), userId);
  const saveRaid = (id, state) => db.prepare('UPDATE raids SET state = ?, status = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(state), state.status, timestamp(), id);

  function rule(fn) {
    try { return fn(); } catch (error) { requireThat(false, 400, error.message); }
  }

  function unlock(userId, ids) {
    const added = [];
    const valid = new Set(cosmeticCatalogue().map(item => item.id));
    const insert = db.prepare('INSERT OR IGNORE INTO cosmetic_unlocks (user_id, item_id, unlocked_at) VALUES (?, ?, ?)');
    for (const id of new Set(ids)) {
      if (valid.has(id) && insert.run(userId, id, timestamp()).changes > 0) added.push(id);
    }
    return added;
  }

  function openRaids(user) {
    return db.prepare("SELECT * FROM raids WHERE school_id = ? AND status IN ('lobby', 'active')").all(user.school_id);
  }

  function currentRaid(user) {
    return openRaids(user).find(row => JSON.parse(row.state).members.some(member => member.id === user.id));
  }

  function lobbyMember(user) {
    const view = viewUser(user);
    return { id: view.id, name: view.name, characterName: view.characterName, avatar: view.avatar,
      appearance: view.appearance, equipmentVisuals: view.equipmentVisuals, cosmetics: view.cosmetics,
      stats: view.stats, hp: view.stats.maxHp, maxHp: view.stats.maxHp, action: null };
  }

  function awardRaid(state) {
    if (state.status !== 'won') return;
    for (const member of state.members) {
      if (state.participated?.[member.id]) unlock(member.id, RAID_REWARDS);
    }
  }

  function stateFor(user) {
    const cosmetics = viewUser(user).cosmetics;
    const raids = user.role === 'student' ? db.prepare(`SELECT * FROM raids WHERE school_id = ?
      ORDER BY CASE WHEN status IN ('lobby', 'active') THEN 0 ELSE 1 END, created_at DESC LIMIT 40`)
      .all(user.school_id).map(raidView) : [];
    return { tower: user.role === 'student' ? towerView(readTower(user.id)) : null, raids,
      cosmetics: { ...cosmetics, catalogue: cosmeticCatalogue() }, towerBoons: structuredClone(TOWER_BOONS) };
  }

  function handle(path, method, body, user) {
    if (!/^\/api\/(tower(?:\/|$)|raids(?:\/|$)|cosmetics(?:\/|$))/.test(path)) return null;
    requireThat(method === 'POST', 405, 'Diese Abenteueraktion benötigt eine POST-Anfrage.');
    studentOnly(user);

    if (path === '/api/cosmetics/equip') {
      requireThat(['companion', 'outfit'].includes(body.type), 400, 'Bitte einen Begleiter oder ein Outfit wählen.');
      requireThat(body.id === null || typeof body.id === 'string', 400, 'Ungültige Auswahl.');
      const cosmetics = viewUser(byId(user.id)).cosmetics;
      if (body.id !== null) {
        const item = cosmeticCatalogue().find(item => item.id === body.id);
        requireThat(item && item.type === body.type, 400, 'Dieser Fund passt nicht zu dieser Auswahl.');
        requireThat(cosmetics.owned.includes(body.id), 403, 'Diesen Fund hast du noch nicht freigeschaltet.');
      }
      cosmetics.selected[body.type] = body.id;
      db.prepare('UPDATE users SET cosmetic_loadout = ? WHERE id = ?').run(JSON.stringify(cosmetics.selected), user.id);
      return { user: viewUser(byId(user.id), { includeEmail: true }) };
    }

    if (path === '/api/tower/start') return transaction(() => {
      const old = towerView(readTower(user.id));
      requireThat(!old || !['active', 'choice'].includes(old.state.status), 409, 'Dein Aufstieg läuft bereits. Spiele weiter oder verlasse den Turm.');
      const state = createTower(viewUser(byId(user.id)));
      db.prepare(`INSERT INTO tower_runs (user_id, id, state, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET id = excluded.id, state = excluded.state, updated_at = excluded.updated_at`)
        .run(user.id, randomUUID(), JSON.stringify(state), timestamp());
      return { tower: towerView(readTower(user.id)) };
    });

    if (['/api/tower/action', '/api/tower/choice', '/api/tower/abandon'].includes(path)) return transaction(() => {
      const run = towerView(readTower(user.id));
      requireThat(run, 404, 'Du hast noch keinen Turmaufstieg begonnen.');
      requireThat(typeof body.runId === 'string' && body.runId.length > 0, 400, 'Die Aufstiegskennung fehlt. Lade den aktuellen Stand.');
      requireThat(body.runId === run.id, 409, 'Dieser Spielzug gehört zu einem älteren Turmversuch.');
      requireThat(['active', 'choice'].includes(run.state.status), 409, 'Dieser Aufstieg ist bereits beendet.');
      let next;
      if (path.endsWith('/action')) {
        requireThat(Number.isSafeInteger(body.turn) && body.turn >= 0, 400, 'Die Zugnummer fehlt. Bitte lade den Spielstand neu.');
        requireThat(body.turn === run.state.totalTurns, 409, 'Dieser Spielzug wurde bereits verarbeitet. Lade den aktuellen Stand.');
        next = rule(() => applyTowerAction(run.state, body.action));
      } else if (path.endsWith('/choice')) {
        requireThat(Number.isSafeInteger(body.floor), 400, 'Die Etage fehlt. Bitte lade den Spielstand neu.');
        requireThat(body.floor === run.state.floor, 409, 'Diese Etage wurde bereits abgeschlossen.');
        next = rule(() => applyTowerChoice(run.state, body.choice));
      } else {
        next = structuredClone(run.state);
        next.status = 'lost'; next.pendingRewards = [];
        next.log.push('Du verlässt den Turm. Bereits dauerhaft gesicherte Funde bleiben erhalten.');
        next.log = next.log.slice(-30);
      }
      const unlocked = ['banked', 'completed'].includes(next.status) ? unlock(user.id, next.pendingRewards || []) : [];
      saveTower(user.id, next);
      return { tower: towerView(readTower(user.id)), unlocked };
    });

    if (path === '/api/raids') return transaction(() => {
      requireThat(!currentRaid(user), 409, 'Du bist bereits in einer offenen Golemgruppe.');
      const state = { status: 'lobby', members: [lobbyMember(byId(user.id))], round: 0,
        boss: { id: 'rune-golem', name: 'Runengolem', characterName: 'Runengolem', avatar: 'golem', kind: 'golem' },
        actions: {}, participated: {}, log: ['Die Gruppe sammelt sich vor dem Runentor.'], events: [], eventSeq: 0 };
      const id = randomUUID(), created = timestamp();
      db.prepare('INSERT INTO raids (id, school_id, leader_id, status, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, user.school_id, user.id, state.status, JSON.stringify(state), created, created);
      return { raid: raidView(readRaid(id)) };
    });

    const match = path.match(/^\/api\/raids\/([^/]+)\/(join|start|action|advance|leave|cancel)$/);
    requireThat(match, 404, 'Diese Abenteueraktion wurde nicht gefunden.');
    return transaction(() => {
      const [, id, operation] = match;
      const row = readRaid(id);
      requireThat(row && row.school_id === user.school_id, 404, 'Gruppe nicht gefunden.');
      let state = JSON.parse(row.state);
      const member = state.members.find(member => member.id === user.id);
      if (operation === 'join') {
        requireThat(row.status === 'lobby', 409, 'Dieser Kampf hat bereits begonnen oder ist beendet.');
        if (member) return { raid: raidView(row) };
        requireThat(!currentRaid(user), 409, 'Du bist bereits in einer anderen offenen Gruppe.');
        requireThat(state.members.length < 5, 409, 'Die Gruppe ist bereits voll.');
        state.members.push(lobbyMember(byId(user.id)));
        state.log.push(`${user.name} schließt sich der Gruppe an.`);
      } else {
        requireThat(member, 403, 'Du gehörst nicht zu dieser Gruppe.');
        if (operation === 'start') {
          requireThat(row.leader_id === user.id, 403, 'Nur die Gruppenleitung kann starten.');
          requireThat(row.status === 'lobby', 409, 'Dieser Kampf wurde bereits gestartet.');
          requireThat(state.members.length >= 3 && state.members.length <= 5, 400, 'Ihr braucht drei bis fünf verschiedene Schülerkonten.');
          const party = state.members.map(member => byId(member.id));
          requireThat(party.every(player => player?.role === 'student' && player.school_id === user.school_id), 400, 'Ein Gruppenmitglied ist nicht mehr verfügbar.');
          state = rule(() => createRaid(party.map(player => viewUser(player))));
          state.roundDeadline = now() + ROUND_TIME;
          state.participated = {};
        } else if (operation === 'cancel') {
          requireThat(row.leader_id === user.id, 403, 'Nur die Gruppenleitung kann die Gruppe beenden.');
          requireThat(['lobby', 'active'].includes(row.status), 409, 'Diese Gruppe ist bereits beendet.');
          state.status = 'closed'; state.log.push('Die Gruppenleitung beendet diesen Versuch. Es gehen keine Gegenstände verloren.');
        } else if (operation === 'leave') {
          requireThat(row.status === 'lobby', 409, 'Im laufenden Kampf könnt ihr weiterziehen oder die Gruppenleitung beendet den Versuch.');
          state.members = state.members.filter(member => member.id !== user.id);
          if (!state.members.length) state.status = 'closed';
          else if (row.leader_id === user.id) db.prepare('UPDATE raids SET leader_id = ? WHERE id = ?').run(state.members[0].id, id);
          state.log.push(`${user.name} verlässt die Gruppe.`);
        } else {
          requireThat(row.status === 'active', 409, 'Dieser Gruppenkampf ist nicht aktiv.');
          requireThat(Number.isSafeInteger(body.round), 400, 'Die Rundennummer fehlt. Lade den aktuellen Stand.');
          requireThat(body.round === state.round, 409, 'Diese Runde wurde bereits verarbeitet. Lade den aktuellen Stand.');
          const previousRound = state.round;
          if (operation === 'action') {
            state = rule(() => submitRaidAction(state, user.id, body.action));
            state.participated = { ...state.participated, [user.id]: true };
          } else {
            requireThat(now() >= state.roundDeadline, 409, 'Die Gruppe hat noch Zeit für ihre Züge.');
            const missing = state.members.filter(member => member.hp > 0 && !state.actions[member.id]).map(member => member.id);
            requireThat(missing.length > 0, 409, 'Alle Spielzüge sind bereits vorhanden.');
            for (const missingId of missing) {
              if (state.status !== 'active' || state.round !== previousRound) break;
              state = rule(() => submitRaidAction(state, missingId, 'guard'));
            }
          }
          if (state.round !== previousRound) state.roundDeadline = now() + ROUND_TIME;
          awardRaid(state);
        }
      }
      state.log = state.log.slice(-30);
      saveRaid(id, state);
      return { raid: raidView(readRaid(id)) };
    });
  }

  return { handle, stateFor };
}
