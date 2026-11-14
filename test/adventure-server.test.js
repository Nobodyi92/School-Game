import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server.js';

const password = 'Klassenhelden!2026';
const rejected = result => assert.ok(result.status >= 400 && result.status < 500, JSON.stringify(result));
const ok = result => { assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body; };
const economy = user => ({ xp: user.xp, totalXp: user.totalXp, inventory: user.inventory,
  equipment: user.equipment, skills: user.skills, stats: user.stats });

async function fixture(t, options = {}) {
  const app = createApp({ dbPath: ':memory:', ...options });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await app.close(); } };
  t.after(close);
  function client(initialCookie = '') {
    let cookie = initialCookie;
    return {
      get cookie() { return cookie; },
      async request(path, body) {
        const response = await fetch(origin + path, {
          method: body === undefined ? 'GET' : 'POST',
          headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        return { status: response.status, body: await response.json() };
      },
      async login(email = 'lina@demo.schule') {
        return ok(await this.request('/api/auth/login', { email, password })).user;
      },
      async register(name = 'Maya Beispiel', email = 'maya@example.test') {
        return ok(await this.request('/api/auth/register', { name, email, password, characterName: 'Wolkenfeder' })).user;
      },
      async state() { return ok(await this.request('/api/state')); },
      async tower() { return (await this.state()).adventure.tower; },
      async raid(id) {
        const result = (await this.state()).adventure.raids.find(raid => raid.id === id);
        assert.ok(result, `Raid ${id} must be visible to its member`);
        return result;
      },
    };
  }
  const mutateTower = (userId, change) => {
    const row = app.db.prepare('SELECT state FROM tower_runs WHERE user_id = ?').get(userId);
    assert.ok(row);
    const state = JSON.parse(row.state);
    change(state);
    app.db.prepare('UPDATE tower_runs SET state = ? WHERE user_id = ?').run(JSON.stringify(state), userId);
    return state;
  };
  const mutateRaid = (id, change) => {
    const row = app.db.prepare('SELECT state FROM raids WHERE id = ?').get(id);
    assert.ok(row);
    const state = JSON.parse(row.state);
    change(state);
    app.db.prepare('UPDATE raids SET state = ? WHERE id = ?').run(JSON.stringify(state), id);
    return state;
  };
  return { ...app, client, origin, close, mutateTower, mutateRaid };
}

async function reachTowerChoice(student, dbFixture, floor) {
  for (let current = 1; current <= floor; current++) {
    const before = await student.tower();
    assert.equal(before.state.status, 'active');
    assert.equal(before.state.floor, current);
    dbFixture.mutateTower('demo-lina', state => { state.enemy.hp = 1; state.enemy.guarding = false; });
    ok(await student.request('/api/tower/action', { action: 'attack', turn: before.state.totalTurns, runId: before.id }));
    assert.equal((await student.tower()).state.status, current === 10 ? 'completed' : 'choice');
    if (current < floor) ok(await student.request('/api/tower/choice', { choice: 'power', floor: current, runId: before.id }));
  }
  return student.tower();
}

async function party(f) {
  const lina = f.client(), ben = f.client(), maya = f.client();
  const linaUser = await lina.login();
  const benUser = await ben.login('ben@demo.schule');
  const mayaUser = await maya.register();
  return { lina, ben, maya, ids: [linaUser.id, benUser.id, mayaUser.id] };
}

async function startRaid(lina, ben, maya) {
  const created = ok(await lina.request('/api/raids', {})).raid;
  assert.ok(created?.id, 'creating a raid returns its persisted view');
  ok(await ben.request(`/api/raids/${created.id}/join`, {}));
  ok(await maya.request(`/api/raids/${created.id}/join`, {}));
  ok(await lina.request(`/api/raids/${created.id}/start`, {}));
  return lina.raid(created.id);
}

test('adventure mutations require a student session and reject teacher accounts', async t => {
  const f = await fixture(t);
  const anonymous = f.client(), teacher = f.client(), lina = f.client();
  await teacher.login('lehrer@demo.schule');
  await lina.login();
  const raid = ok(await lina.request('/api/raids', {})).raid;
  for (const [path, body] of [
    ['/api/tower/start', {}], ['/api/tower/action', { action: 'attack', turn: 0 }],
    ['/api/tower/choice', { choice: 'bank', floor: 1 }], ['/api/tower/abandon', {}],
    ['/api/raids', {}], [`/api/raids/${raid.id}/join`, {}], [`/api/raids/${raid.id}/start`, {}],
    [`/api/raids/${raid.id}/action`, { action: 'runeSun', round: 1 }],
    [`/api/raids/${raid.id}/advance`, { round: 1 }], [`/api/raids/${raid.id}/cancel`, {}],
    ['/api/cosmetics/equip', { type: 'companion', id: null }],
  ]) {
    assert.equal((await anonymous.request(path, body)).status, 401, path);
    assert.equal((await teacher.request(path, body)).status, 403, path);
  }
});

test('tower progress requires current turns and banking a milestone unlocks cosmetics without XP or gear', async t => {
  const f = await fixture(t), student = f.client();
  await student.login();
  const before = economy((await student.state()).user);
  ok(await student.request('/api/tower/start', { pendingRewards: ['outfit-warden'], xp: 9999 }));
  assert.equal((await student.request('/api/tower/start', {})).status, 409);
  rejected(await student.request('/api/tower/action', { action: 'attack' }));
  rejected(await student.request('/api/tower/action', { action: 'invent-rewards', turn: 0, runId: (await student.tower()).id }));
  const tower = await reachTowerChoice(student, f, 2);
  assert.deepEqual(tower.state.pendingRewards, ['pet-firefly']);
  assert.equal((await student.state()).user.cosmetics.owned.includes('pet-firefly'), false);
  assert.equal((await student.request('/api/tower/action', { action: 'attack', turn: 0, runId: tower.id })).status, 409);
  assert.equal((await student.request('/api/tower/choice', { choice: 'bank', floor: 1, runId: tower.id })).status, 409);
  ok(await student.request('/api/tower/choice', { choice: 'bank', floor: 2, runId: tower.id, pendingRewards: ['trophy-golem'] }));
  assert.equal((await student.tower()).state.status, 'banked');
  const after = (await student.state()).user;
  assert.deepEqual(after.cosmetics.owned, ['pet-firefly']);
  assert.deepEqual(economy(after), before);
  rejected(await student.request('/api/tower/choice', { choice: 'bank', floor: 2, runId: tower.id }));
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM cosmetic_unlocks WHERE user_id = ?').get(after.id).count, 1);
});

test('losing or abandoning a tower run forfeits only unbanked finds and preserves account equipment', async t => {
  const f = await fixture(t), student = f.client();
  await student.login();
  const helm = (await student.state()).user.inventory.items.find(item => item.type === 'helmet');
  ok(await student.request('/api/equipment', { slot: 'helmet', itemId: helm.id }));
  const before = economy((await student.state()).user);
  ok(await student.request('/api/tower/start', {}));
  const firstRun = await reachTowerChoice(student, f, 2);
  ok(await student.request('/api/tower/choice', { choice: 'vigor', floor: 2, runId: firstRun.id }));
  const current = f.mutateTower('demo-lina', state => {
    state.player.hp = 1; state.player.guarding = false;
    state.enemy.hp = 1000; state.enemy.intent = 'heavy';
  });
  ok(await student.request('/api/tower/action', { action: 'attack', turn: current.totalTurns, runId: firstRun.id }));
  assert.equal((await student.tower()).state.status, 'lost');
  assert.deepEqual((await student.tower()).state.pendingRewards, []);
  assert.deepEqual((await student.state()).user.cosmetics.owned, []);
  assert.deepEqual(economy((await student.state()).user), before);
  ok(await student.request('/api/tower/start', {}));
  const secondRun = await reachTowerChoice(student, f, 2);
  ok(await student.request('/api/tower/abandon', { runId: secondRun.id }));
  assert.equal((await student.tower()).state.status, 'lost');
  assert.deepEqual((await student.state()).user.cosmetics.owned, []);
  assert.deepEqual(economy((await student.state()).user), before);
});

test('cosmetic equipment requires server-owned rewards of the matching type and never alters combat stats', async t => {
  const f = await fixture(t), student = f.client();
  const user = await student.login();
  const before = economy(user);
  rejected(await student.request('/api/cosmetics/equip', { type: 'companion', id: 'pet-rune', owned: ['pet-rune'] }));
  for (const item of ['pet-firefly', 'outfit-starlight', 'trophy-tower-bronze']) {
    f.db.prepare('INSERT INTO cosmetic_unlocks (user_id, item_id, unlocked_at) VALUES (?, ?, ?)').run(user.id, item, new Date().toISOString());
  }
  rejected(await student.request('/api/cosmetics/equip', { type: 'outfit', id: 'pet-firefly' }));
  rejected(await student.request('/api/cosmetics/equip', { type: 'trophy', id: 'trophy-tower-bronze' }));
  ok(await student.request('/api/cosmetics/equip', { type: 'companion', id: 'pet-firefly', bonus: 9999 }));
  ok(await student.request('/api/cosmetics/equip', { type: 'outfit', id: 'outfit-starlight' }));
  let after = (await student.state()).user;
  assert.deepEqual(after.cosmetics.selected, { companion: 'pet-firefly', outfit: 'outfit-starlight' });
  assert.deepEqual(economy(after), before);
  assert.equal(after.cosmetics.owned.length, 3);
  ok(await student.request('/api/cosmetics/equip', { type: 'companion', id: null }));
  after = (await student.state()).user;
  assert.equal(after.cosmetics.selected.companion, null);
  assert.equal(after.cosmetics.selected.outfit, 'outfit-starlight');
});

test('tower turn IDs stay monotonic across floors and old run requests cannot affect a new ascent', async t => {
  const f = await fixture(t), student = f.client();
  await student.login();
  const original = ok(await student.request('/api/tower/start', {})).tower;
  const finishedFloor = await reachTowerChoice(student, f, 1);
  assert.equal(finishedFloor.state.totalTurns, 1);
  ok(await student.request('/api/tower/choice', { choice: 'power', floor: 1, runId: original.id }));
  const nextFloor = await student.tower();
  assert.equal(nextFloor.state.floor, 2);
  assert.equal(nextFloor.state.turns, 0);
  assert.equal(nextFloor.state.totalTurns, 1);
  assert.equal((await student.request('/api/tower/action', { action: 'attack', turn: 0, runId: original.id })).status, 409);
  assert.deepEqual(await student.tower(), nextFloor);
  ok(await student.request('/api/tower/action', { action: 'attack', turn: 1, runId: original.id }));
  assert.equal((await student.tower()).state.totalTurns, 2);
  ok(await student.request('/api/tower/abandon', { runId: original.id }));
  const fresh = ok(await student.request('/api/tower/start', {})).tower;
  assert.notEqual(fresh.id, original.id);
  assert.equal(fresh.state.totalTurns, 0);
  for (const [path, body] of [
    ['/api/tower/abandon', { runId: original.id }],
    ['/api/tower/action', { action: 'attack', turn: 0, runId: original.id }],
    ['/api/tower/choice', { choice: 'bank', floor: 1, runId: original.id }],
  ]) assert.equal((await student.request(path, body)).status, 409, path);
  rejected(await student.request('/api/tower/abandon', {}));
  assert.deepEqual(await student.tower(), fresh);
});

test('golem lobbies require three different students, enforce leadership and exclude other schools', async t => {
  const f = await fixture(t), { lina, ben, maya } = await party(f);
  const outsider = f.client();
  const outsideUser = await outsider.register('Andere Klasse', 'other@example.test');
  f.db.prepare('UPDATE users SET school_id = ? WHERE id = ?').run('other-school', outsideUser.id);
  const raid = ok(await lina.request('/api/raids', {})).raid;
  rejected(await lina.request(`/api/raids/${raid.id}/start`, {}));
  ok(await ben.request(`/api/raids/${raid.id}/join`, {}));
  rejected(await lina.request(`/api/raids/${raid.id}/start`, {}));
  assert.equal((await ben.request(`/api/raids/${raid.id}/start`, {})).status, 403);
  assert.equal((await outsider.request(`/api/raids/${raid.id}/join`, {})).status, 404);
  assert.equal((await outsider.state()).adventure.raids.some(value => value.id === raid.id), false);
  assert.equal((await ben.request('/api/raids', {})).status, 409);
  ok(await maya.request(`/api/raids/${raid.id}/join`, {}));
  ok(await lina.request(`/api/raids/${raid.id}/start`, {}));
  const active = await lina.raid(raid.id);
  assert.equal(active.status, 'active');
  assert.equal(new Set(active.state.members.map(member => member.id)).size, 3);
  rejected(await outsider.request(`/api/raids/${raid.id}/action`, { action: 'attack', round: 1 }));
  assert.equal((await ben.request(`/api/raids/${raid.id}/leave`, {})).status, 409);
  assert.equal((await ben.request(`/api/raids/${raid.id}/cancel`, {})).status, 403);
  ok(await lina.request(`/api/raids/${raid.id}/cancel`, {}));
  assert.equal((await ben.raid(raid.id)).status, 'closed');
  ok(await ben.request('/api/raids', {}));
});

test('leaving a lobby transfers leadership and the last departure closes it', async t => {
  const f = await fixture(t), lina = f.client(), ben = f.client();
  await lina.login(); await ben.login('ben@demo.schule');
  const raid = ok(await lina.request('/api/raids', {})).raid;
  ok(await ben.request(`/api/raids/${raid.id}/join`, {}));
  ok(await lina.request(`/api/raids/${raid.id}/leave`, {}));
  assert.equal((await ben.raid(raid.id)).leaderId, 'demo-ben');
  assert.deepEqual((await ben.raid(raid.id)).state.members.map(member => member.id), ['demo-ben']);
  ok(await ben.request(`/api/raids/${raid.id}/leave`, {}));
  assert.equal(f.db.prepare('SELECT status FROM raids WHERE id = ?').get(raid.id).status, 'closed');
  ok(await lina.request('/api/raids', {}));
});

test('a golem round needs different sun and moon players and rejects repeated or stale submissions', async t => {
  const f = await fixture(t), { lina, ben, maya } = await party(f);
  const raid = await startRaid(lina, ben, maya), id = raid.id;
  const before = raid.state.boss.hp;
  ok(await lina.request(`/api/raids/${id}/action`, { action: 'attack', round: 1 }));
  rejected(await lina.request(`/api/raids/${id}/action`, { action: 'runeMoon', round: 1 }));
  ok(await ben.request(`/api/raids/${id}/action`, { action: 'runeSun', round: 1 }));
  ok(await maya.request(`/api/raids/${id}/action`, { action: 'runeSun', round: 1 }));
  const failedRunes = await lina.raid(id);
  assert.equal(failedRunes.state.round, 2);
  assert.equal(failedRunes.state.runeshield.broken, false);
  assert.equal(failedRunes.state.boss.hp, before - 1);
  assert.equal((await maya.request(`/api/raids/${id}/action`, { action: 'runeSun', round: 1 })).status, 409);
  assert.deepEqual((await maya.raid(id)).state.actions, {});
  ok(await lina.request(`/api/raids/${id}/action`, { action: 'runeSun', round: 2 }));
  ok(await ben.request(`/api/raids/${id}/action`, { action: 'runeMoon', round: 2 }));
  ok(await maya.request(`/api/raids/${id}/action`, { action: 'attack', round: 2 }));
  const broken = await lina.raid(id);
  assert.equal(broken.state.runeshield.broken, true);
  assert.ok(failedRunes.state.boss.hp - broken.state.boss.hp >= 50);
  assert.ok(broken.state.eventSeq > failedRunes.state.eventSeq);
});

test('concurrent final raid actions resolve and award unique cosmetics once without XP or gear', async t => {
  const f = await fixture(t), { lina, ben, maya, ids } = await party(f);
  const clients = [lina, ben, maya];
  const before = await Promise.all(clients.map(async client => economy((await client.state()).user)));
  for (let victory = 0; victory < 2; victory++) {
    const raid = await startRaid(lina, ben, maya), id = raid.id;
    f.mutateRaid(id, state => { state.boss.hp = 10; });
    ok(await lina.request(`/api/raids/${id}/action`, { action: 'runeSun', round: 1 }));
    ok(await ben.request(`/api/raids/${id}/action`, { action: 'runeMoon', round: 1 }));
    const requests = await Promise.all([
      maya.request(`/api/raids/${id}/action`, { action: 'attack', round: 1 }),
      maya.request(`/api/raids/${id}/action`, { action: 'attack', round: 1 }),
    ]);
    assert.equal(requests.filter(result => result.status === 200).length, 1);
    assert.equal(requests.find(result => result.status !== 200).status, 409);
    assert.equal((await lina.raid(id)).status, 'won');
    for (const [index, client] of clients.entries()) {
      const user = (await client.state()).user;
      assert.deepEqual([...user.cosmetics.owned].sort(), ['outfit-runekeeper', 'pet-crystal-golem', 'pet-rune', 'trophy-golem']);
      assert.deepEqual(economy(user), before[index]);
      assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM cosmetic_unlocks WHERE user_id = ?').get(ids[index]).count, 4);
    }
  }
});

test('a server-clock timeout resolves missing actions as guards without rewarding inactive accounts', async t => {
  let clock = 1_800_000_000_000;
  const f = await fixture(t, { now: () => clock }), { lina, ben, maya } = await party(f);
  const raid = await startRaid(lina, ben, maya), id = raid.id;
  f.mutateRaid(id, state => { state.boss.hp = 10; });
  ok(await lina.request(`/api/raids/${id}/action`, { action: 'runeSun', round: 1 }));
  ok(await ben.request(`/api/raids/${id}/action`, { action: 'runeMoon', round: 1 }));
  rejected(await lina.request(`/api/raids/${id}/advance`, { round: 1, now: clock + 999999 }));
  assert.equal((await lina.raid(id)).state.round, 1);
  clock = raid.state.roundDeadline + 1;
  ok(await lina.request(`/api/raids/${id}/advance`, { round: 1 }));
  assert.equal((await lina.raid(id)).status, 'won');
  assert.ok((await lina.state()).user.cosmetics.owned.includes('trophy-golem'));
  assert.ok((await ben.state()).user.cosmetics.owned.includes('trophy-golem'));
  assert.deepEqual((await maya.state()).user.cosmetics.owned, []);
  assert.equal((await maya.request(`/api/raids/${id}/advance`, { round: 1 })).status, 409);
});

test('tower state, queued group actions and selected cosmetics survive a SQLite restart', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'klassenhelden-adventure-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const dbPath = join(temp, 'persistent.sqlite');
  const first = await fixture(t, { dbPath });
  const { lina, ben, maya } = await party(first);
  const started = ok(await lina.request('/api/tower/start', {})).tower;
  ok(await lina.request('/api/tower/action', { action: 'focus', turn: 0, runId: started.id }));
  const tower = await lina.tower();
  first.db.prepare('INSERT INTO cosmetic_unlocks (user_id, item_id, unlocked_at) VALUES (?, ?, ?)')
    .run('demo-lina', 'pet-firefly', new Date().toISOString());
  ok(await lina.request('/api/cosmetics/equip', { type: 'companion', id: 'pet-firefly' }));
  const raid = await startRaid(lina, ben, maya);
  ok(await lina.request(`/api/raids/${raid.id}/action`, { action: 'runeSun', round: 1 }));
  const cookie = lina.cookie;
  await first.close();
  const second = await fixture(t, { dbPath });
  const restored = second.client(cookie);
  const state = await restored.state();
  assert.equal(state.user.id, 'demo-lina');
  assert.deepEqual(state.adventure.tower, tower);
  const persistedRaid = state.adventure.raids.find(value => value.id === raid.id);
  assert.equal(persistedRaid.status, 'active');
  assert.equal(persistedRaid.state.actions['demo-lina'], 'runeSun');
  assert.equal(persistedRaid.state.round, 1);
  assert.equal(state.user.cosmetics.selected.companion, 'pet-firefly');
  assert.ok(state.user.cosmetics.owned.includes('pet-firefly'));
});
