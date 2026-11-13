import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';

const password = 'Klassenhelden!2026';

async function fixture(t, options = {}) {
  const app = createApp({ dbPath: ':memory:', ...options });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  function client() {
    let cookie = '';
    return {
      async request(path, body, extraHeaders = {}) {
        const response = await fetch(origin + path, {
          method: body === undefined ? 'GET' : 'POST',
          headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return { status: response.status, body: await response.json(), headers: response.headers };
      },
      async login(email) {
        const response = await this.request('/api/auth/login', { email, password });
        assert.equal(response.status, 200, JSON.stringify(response.body));
        return response;
      },
    };
  }
  return { ...app, origin, client };
}

test('session authentication, cookies, failed login and logout work over HTTP', async t => {
  const { client } = await fixture(t);
  const student = client();
  assert.equal((await student.request('/api/session')).body.user, null);
  assert.equal((await student.request('/api/state')).status, 401);
  assert.equal((await student.request('/api/auth/login', { email: 'lina@demo.schule', password: 'wrong' })).status, 401);
  const login = await student.login('lina@demo.schule');
  assert.equal(login.body.user.role, 'student');
  assert.equal(login.body.user.id, 'demo-lina');
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.headers.get('set-cookie'), /SameSite=Strict/);
  assert.equal((await student.request('/api/session')).body.user.id, 'demo-lina');
  assert.equal((await student.request('/api/auth/logout', {})).status, 200);
  assert.equal((await student.request('/api/state')).status, 401);
});

test('registration cannot grant teacher privileges, XP or inventory', async t => {
  const { client } = await fixture(t);
  const newcomer = client();
  const registration = { name: 'Maya Beispiel', email: 'maya@example.test', password,
    characterName: 'Wolkenfeder', role: 'teacher', xp: 9999, inventory: { potion: 999 } };
  const created = await newcomer.request('/api/auth/register', registration);
  assert.equal(created.status, 200);
  assert.equal(created.body.user.role, 'student');
  assert.equal(created.body.user.xp, 0);
  assert.equal(created.body.user.totalXp, 0);
  assert.equal(created.body.user.inventory.potion, 0);
  assert.equal((await newcomer.request('/api/rewards', {
    studentId: created.body.user.id, xp: 100, item: 'potion', reason: 'Selbst vergeben',
  })).status, 403);
  assert.equal((await newcomer.request('/api/auth/register', registration)).status, 409);
});

test('teacher rewards persist XP, inventory and a reason; skills spend available XP only', async t => {
  const { client } = await fixture(t);
  const student = client();
  const teacher = client();
  await student.login('lina@demo.schule');
  await teacher.login('lehrer@demo.schule');
  const before = (await student.request('/api/state')).body.user;
  const upgraded = await student.request('/api/skills/upgrade', { skill: 'strength' });
  assert.equal(upgraded.status, 200);
  assert.equal(upgraded.body.user.skills.strength, before.skills.strength + 1);
  assert.equal(upgraded.body.user.xp, before.xp - before.skillProgress.strength.cost);
  assert.equal(upgraded.body.user.totalXp, before.totalXp);
  assert.equal((await teacher.request('/api/rewards', {
    studentId: 'demo-lina', xp: 60, item: 'potion', reason: 'Hilfreiche Mitarbeit im Unterricht',
  })).status, 200);
  const after = (await student.request('/api/state')).body;
  assert.equal(after.user.xp, upgraded.body.user.xp + 60);
  assert.equal(after.user.totalXp, before.totalXp + 60);
  assert.equal(after.user.inventory.potion, before.inventory.potion + 1);
  assert.ok(after.rewards.some(r => r.reason === 'Hilfreiche Mitarbeit im Unterricht' && r.xp === 60 && r.item === 'potion'));
  assert.equal((await teacher.request('/api/skills/upgrade', { skill: 'strength' })).status, 403);
});

test('invalid rewards and unaffordable upgrades leave stored balances unchanged', async t => {
  const { client } = await fixture(t);
  const teacher = client();
  const student = client();
  await teacher.login('lehrer@demo.schule');
  await student.login('ben@demo.schule');
  const before = (await student.request('/api/state')).body.user;
  for (const invalid of [
    { xp: -1, item: null }, { xp: 101, item: null }, { xp: 1.5, item: null },
    { xp: 0, item: null }, { xp: 30, item: 'sword' },
  ]) {
    assert.equal((await teacher.request('/api/rewards', {
      studentId: 'demo-ben', reason: 'Testbelohnung', ...invalid,
    })).status, 400);
  }
  assert.deepEqual((await student.request('/api/state')).body.user, before);
  assert.equal((await student.request('/api/skills/upgrade', { skill: 'strength' })).status, 200);
  const afterSpend = (await student.request('/api/state')).body.user;
  assert.equal((await student.request('/api/skills/upgrade', { skill: 'strength' })).status, 400);
  assert.deepEqual((await student.request('/api/state')).body.user, afterSpend);
  assert.equal((await student.request('/api/skills/upgrade', { skill: '__proto__' })).status, 400);
});

test('missing or non-string user IDs return validation errors, never server errors', async t => {
  const { client } = await fixture(t);
  const teacher = client();
  const lina = client();
  await teacher.login('lehrer@demo.schule');
  await lina.login('lina@demo.schule');
  for (const id of [undefined, null, {}, [], 42, '', '   ', 'a'.repeat(101)]) {
    const reward = await teacher.request('/api/rewards', {
      studentId: id, xp: 20, item: null, reason: 'Hilfreiche Mitarbeit',
    });
    assert.equal(reward.status, 400, JSON.stringify({ id, response: reward.body }));
    const challenge = await lina.request('/api/battles', { opponentId: id });
    assert.equal(challenge.status, 400, JSON.stringify({ id, response: challenge.body }));
  }
});

test('school boundaries hide peers and prevent cross-school challenges and rewards', async t => {
  const { client, db } = await fixture(t);
  db.prepare('UPDATE users SET school_id = ? WHERE id = ?').run('other-campus', 'demo-ben');
  const teacher = client();
  const lina = client();
  await teacher.login('lehrer@demo.schule');
  await lina.login('lina@demo.schule');
  assert.equal((await lina.request('/api/state')).body.students.some(s => s.id === 'demo-ben'), false);
  assert.equal((await teacher.request('/api/state')).body.students.some(s => s.id === 'demo-ben'), false);
  assert.equal((await lina.request('/api/battles', { opponentId: 'demo-ben' })).status, 404);
  assert.equal((await teacher.request('/api/rewards', {
    studentId: 'demo-ben', xp: 100, item: 'potion', reason: 'Fremde Klasse',
  })).status, 404);
  const ben = db.prepare('SELECT xp, inventory FROM users WHERE id = ?').get('demo-ben');
  assert.equal(ben.xp, 75);
  assert.equal(JSON.parse(ben.inventory).potion, 1);
});

test('PvP requires opponent acceptance and enforces alternating authorized turns', async t => {
  const { client } = await fixture(t);
  const lina = client();
  const ben = client();
  const third = client();
  await lina.login('lina@demo.schule');
  await ben.login('ben@demo.schule');
  await third.request('/api/auth/register', { name: 'Maya Muster', email: 'maya@example.test', password, characterName: 'Luftdrache' });
  const challenge = await lina.request('/api/battles', { opponentId: 'demo-ben' });
  assert.equal(challenge.status, 200);
  const battle = challenge.body.battle;
  const respond = `/api/battles/${battle.id}/respond`;
  const actions = `/api/battles/${battle.id}/actions`;
  assert.equal(battle.status, 'pending');
  assert.equal(battle.state, null);
  assert.equal((await lina.request(respond, { accept: true })).status, 403);
  assert.equal((await third.request(respond, { accept: true })).status, 404);
  assert.equal((await lina.request(actions, { action: 'attack' })).status, 409);
  assert.equal((await third.request('/api/state')).body.battles.length, 0);
  assert.equal((await ben.request(respond, { accept: true })).body.battle.status, 'active');
  assert.equal((await ben.request(respond, { accept: true })).status, 409);
  assert.equal((await ben.request(actions, { action: 'attack' })).status, 400);
  assert.equal((await third.request(actions, { action: 'attack' })).status, 404);
  const first = await lina.request(actions, { action: 'attack' });
  assert.equal(first.status, 200);
  assert.equal(first.body.battle.state.turnId, 'demo-ben');
  assert.equal((await lina.request(actions, { action: 'attack' })).status, 400);
  assert.equal((await ben.request(actions, { action: 'guard' })).body.battle.state.turnId, 'demo-lina');
});

test('declining a challenge closes it and permits a new invitation', async t => {
  const { client } = await fixture(t);
  const lina = client();
  const ben = client();
  await lina.login('lina@demo.schule');
  await ben.login('ben@demo.schule');
  const battle = (await lina.request('/api/battles', { opponentId: 'demo-ben' })).body.battle;
  assert.equal((await lina.request('/api/battles', { opponentId: 'demo-ben' })).status, 409);
  assert.equal((await ben.request('/api/battles', { opponentId: 'demo-lina' })).status, 409);
  const result = await ben.request(`/api/battles/${battle.id}/respond`, { accept: false });
  assert.equal(result.body.battle.status, 'declined');
  assert.equal((await lina.request('/api/battles', { opponentId: 'demo-ben' })).status, 200);
});

test('only a challenger can withdraw a pending invitation and free its open slot', async t => {
  const { client } = await fixture(t);
  const lina = client();
  const ben = client();
  const third = client();
  await lina.login('lina@demo.schule');
  await ben.login('ben@demo.schule');
  await third.request('/api/auth/register', { name: 'Maya Muster', email: 'maya@example.test', password, characterName: 'Wolkenfeder' });
  const battle = (await lina.request('/api/battles', { opponentId: 'demo-ben' })).body.battle;
  const cancel = `/api/battles/${battle.id}/cancel`;
  assert.equal((await ben.request(cancel, {})).status, 403);
  assert.equal((await third.request(cancel, {})).status, 404);
  const withdrawn = await lina.request(cancel, {});
  assert.equal(withdrawn.status, 200);
  assert.equal(withdrawn.body.battle.status, 'declined');
  assert.equal((await lina.request(cancel, {})).status, 409);
  assert.equal((await ben.request(`/api/battles/${battle.id}/respond`, { accept: true })).status, 409);
  assert.equal((await lina.request('/api/battles', { opponentId: 'demo-ben' })).status, 200);
});

test('either active participant can surrender without earning XP or blocking new battles', async t => {
  const { client } = await fixture(t);
  const lina = client();
  const ben = client();
  const third = client();
  await lina.login('lina@demo.schule');
  await ben.login('ben@demo.schule');
  await third.request('/api/auth/register', { name: 'Maya Muster', email: 'maya@example.test', password, characterName: 'Wolkenfeder' });
  const linaBefore = (await lina.request('/api/state')).body.user;
  const benBefore = (await ben.request('/api/state')).body.user;
  // Both roles in the duel can surrender, including the opponent before their first turn.
  for (const surrenderer of [ben, lina]) {
    const battle = (await lina.request('/api/battles', { opponentId: 'demo-ben' })).body.battle;
    await ben.request(`/api/battles/${battle.id}/respond`, { accept: true });
    const cancel = `/api/battles/${battle.id}/cancel`;
    assert.equal((await third.request(cancel, {})).status, 404);
    const result = await surrenderer.request(cancel, {});
    assert.equal(result.status, 200);
    assert.equal(result.body.battle.status, 'finished');
    assert.equal(result.body.battle.state.status, 'finished');
    assert.equal(result.body.battle.state.winnerId, surrenderer === ben ? 'demo-lina' : 'demo-ben');
    assert.match(result.body.battle.state.log.at(-1), /gibt das Duell auf/);
    assert.equal((await surrenderer.request(cancel, {})).status, 409);
    assert.equal((await lina.request(`/api/battles/${battle.id}/actions`, { action: 'attack' })).status, 409);
  }
  const training = (await lina.request('/api/battles', { opponentId: 'training-bot' })).body.battle;
  const surrendered = await lina.request(`/api/battles/${training.id}/cancel`, {});
  assert.equal(surrendered.body.battle.state.winnerId, 'training-bot');
  assert.equal((await lina.request('/api/battles', { opponentId: 'training-bot' })).status, 200);
  for (const [player, before] of [[lina, linaBefore], [ben, benBefore]]) {
    const after = (await player.request('/api/state')).body.user;
    assert.equal(after.xp, before.xp);
    assert.equal(after.totalXp, before.totalXp);
  }
});

test('simultaneous requests cannot take two turns or spend one potion in two battles', async t => {
  const { client, db } = await fixture(t);
  const lina = client();
  const ben = client();
  await lina.login('lina@demo.schule');
  await ben.login('ben@demo.schule');
  const pvp = (await lina.request('/api/battles', { opponentId: 'demo-ben' })).body.battle;
  await ben.request(`/api/battles/${pvp.id}/respond`, { accept: true });
  const pvpActions = `/api/battles/${pvp.id}/actions`;
  const doubleAttack = await Promise.all([
    lina.request(pvpActions, { action: 'attack' }),
    lina.request(pvpActions, { action: 'attack' }),
  ]);
  assert.deepEqual(doubleAttack.map(r => r.status).sort(), [200, 400]);
  const afterAttack = (await lina.request('/api/state')).body.battles.find(b => b.id === pvp.id);
  assert.equal(afterAttack.state.turns, 1);
  assert.equal(afterAttack.state.turnId, 'demo-ben');
  assert.equal((await ben.request(pvpActions, { action: 'attack' })).status, 200);

  const training = (await lina.request('/api/battles', { opponentId: 'training-bot' })).body.battle;
  const trainingActions = `/api/battles/${training.id}/actions`;
  assert.equal((await lina.request(trainingActions, { action: 'attack' })).status, 200);
  db.prepare('UPDATE users SET inventory = ? WHERE id = ?').run('{"potion":1}', 'demo-lina');
  const competingPotions = await Promise.all([
    lina.request(pvpActions, { action: 'potion' }),
    lina.request(trainingActions, { action: 'potion' }),
  ]);
  assert.deepEqual(competingPotions.map(r => r.status).sort(), [200, 400]);
  const after = (await lina.request('/api/state')).body;
  assert.equal(after.user.inventory.potion, 0);
  const pvpTurns = after.battles.find(b => b.id === pvp.id).state.turns;
  const trainingTurns = after.battles.find(b => b.id === training.id).state.turns;
  // One valid PvP action adds one turn; one valid training action also lets the bot act.
  assert.ok((pvpTurns === 3 && trainingTurns === 2) || (pvpTurns === 2 && trainingTurns === 4));
});

test('training auto-plays the bot, consumes a real potion, and never awards XP', async t => {
  const { client } = await fixture(t);
  const lina = client();
  await lina.login('lina@demo.schule');
  const before = (await lina.request('/api/state')).body.user;
  let battle = (await lina.request('/api/battles', { opponentId: 'training-bot' })).body.battle;
  assert.equal(battle.type, 'training');
  assert.equal((await lina.request('/api/battles', { opponentId: 'training-bot' })).status, 409);
  const actions = `/api/battles/${battle.id}/actions`;
  assert.equal((await lina.request(actions, { action: 'potion' })).status, 400);
  assert.equal((await lina.request('/api/state')).body.user.inventory.potion, before.inventory.potion);
  battle = (await lina.request(actions, { action: 'attack' })).body.battle;
  assert.equal(battle.state.turnId, before.id);
  assert.equal(battle.state.turns, 2);
  assert.ok(battle.state.fighters.find(f => f.id === before.id).hp < battle.state.fighters[0].maxHp);
  battle = (await lina.request(actions, { action: 'potion' })).body.battle;
  assert.equal((await lina.request('/api/state')).body.user.inventory.potion, before.inventory.potion - 1);
  for (let i = 0; battle.status === 'active' && i < 40; i++) {
    const fighter = battle.state.fighters.find(f => f.id === before.id);
    const result = await lina.request(actions, { action: fighter.focusCooldown === 0 ? 'focus' : 'attack' });
    assert.equal(result.status, 200);
    battle = result.body.battle;
  }
  assert.equal(battle.status, 'finished');
  assert.ok(battle.state.winnerId);
  assert.equal((await lina.request(actions, { action: 'attack' })).status, 409);
  const after = (await lina.request('/api/state')).body.user;
  assert.equal(after.xp, before.xp);
  assert.equal(after.totalXp, before.totalXp);
});

test('character edits are validated and peer data excludes credentials and email', async t => {
  const { client } = await fixture(t);
  const lina = client();
  const teacher = client();
  await lina.login('lina@demo.schule');
  await teacher.login('lehrer@demo.schule');
  const changed = await lina.request('/api/character', { characterName: 'Sternenfeder', ancestry: 'aether-elf' });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.user.characterName, 'Sternenfeder');
  assert.equal(changed.body.user.avatar, 'aether-elf');
  assert.equal((await lina.request('/api/character', { characterName: 'X', ancestry: 'aether-elf' })).status, 400);
  assert.equal((await lina.request('/api/character', { characterName: 'Name', avatar: 'unknown' })).status, 400);
  const state = (await lina.request('/api/state')).body;
  assert.equal(state.students.find(s => s.id === 'demo-ben').email, undefined);
  assert.equal(state.user.password_hash, undefined);
  assert.equal(state.students.some(s => 'password_hash' in s), false);
  assert.equal(state.rewards.some(r => r.studentId !== 'demo-lina'), false);
  assert.equal((await teacher.request('/api/state')).body.students.find(s => s.id === 'demo-ben').email, 'ben@demo.schule');
});

test('requests reject cross-site mutations, malformed JSON and unsupported content types', async t => {
  const { origin, client } = await fixture(t);
  const student = client();
  await student.login('lina@demo.schule');
  const body = { characterName: 'Fremde Änderung', ancestry: 'aether-elf' };
  assert.equal((await student.request('/api/character', body, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await student.request('/api/character', body, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await student.request('/api/character', body, { Origin: origin })).status, 200);
  const invalidJson = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(invalidJson.status, 400);
  await invalidJson.text();
  const invalidType = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(invalidType.status, 415);
  await invalidType.text();
  const invalidShape = await student.request('/api/character', []);
  assert.equal(invalidShape.status, 400);
});

test('session expiration is enforced without accepting stale cookies', async t => {
  let clock = 1_800_000_000_000;
  const { client } = await fixture(t, { now: () => clock });
  const student = client();
  await student.login('lina@demo.schule');
  assert.equal((await student.request('/api/state')).status, 200);
  clock += 8 * 24 * 60 * 60 * 1000;
  assert.equal((await student.request('/api/session')).body.user, null);
  assert.equal((await student.request('/api/state')).status, 401);
});

test('demo-disabled mode does not seed accounts and blocks public registration', async t => {
  const { client, db } = await fixture(t, { demo: false });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0);
  const student = client();
  assert.equal((await student.request('/api/session')).body.demoMode, false);
  assert.equal((await student.request('/api/auth/register', {
    name: 'Maya Muster', email: 'maya@example.test', password, characterName: 'Fuchs',
  })).status, 403);
  assert.equal((await student.request('/api/auth/login', { email: 'lehrer@demo.schule', password })).status, 401);
});

test('SQLite retains earned progress, character changes and battles after restart', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'klassenhelden-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const dbPath = join(temp, 'persistent.sqlite');
  const app = createApp({ dbPath });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  let cookie;
  try {
    const login = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'lina@demo.schule', password }) });
    cookie = login.headers.get('set-cookie').split(';')[0];
    await login.json();
    const teacherLogin = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'lehrer@demo.schule', password }) });
    const teacherCookie = teacherLogin.headers.get('set-cookie').split(';')[0];
    await teacherLogin.json();
    const reward = await fetch(origin + '/api/rewards', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: teacherCookie }, body: JSON.stringify({ studentId: 'demo-lina', xp: 40, item: 'potion', reason: 'Fortschritt bleibt nach dem Neustart erhalten' }) });
    assert.equal(reward.status, 200);
    await reward.json();
    const changed = await fetch(origin + '/api/character', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ characterName: 'Bleibender Held', ancestry: 'aether-druid' }) });
    assert.equal(changed.status, 200);
    await changed.json();
    const battle = await fetch(origin + '/api/battles', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ opponentId: 'training-bot' }) });
    assert.equal(battle.status, 200);
    await battle.json();
  } finally { await app.close(); }
  const reopened = await fixture(t, { dbPath });
  const response = await fetch(reopened.origin + '/api/state', { headers: { Cookie: cookie } });
  const state = await response.json();
  assert.equal(response.status, 200);
  assert.equal(state.user.characterName, 'Bleibender Held');
  assert.equal(state.user.avatar, 'aether-druid');
  assert.equal(state.battles.length, 1);
  assert.equal(state.battles[0].status, 'active');
  assert.equal(state.user.xp, 165);
  assert.equal(state.user.totalXp, 265);
  assert.equal(state.user.inventory.potion, 3);
  assert.ok(state.rewards.some(r => r.reason === 'Fortschritt bleibt nach dem Neustart erhalten'));
});
