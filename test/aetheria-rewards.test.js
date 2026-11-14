import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';
import { openStore, userView } from '../lib/store.js';
import { COSMETICS, TOWER_REWARDS, ISLAND_REWARDS, RAID_REWARDS, expandAdventureRewards } from '../lib/cosmetics.js';

const proofPairs = [
  ['outfit-starlight', 'pet-aether-falcon'], ['trophy-tower-bronze', 'pet-clockwork-beetle'],
  ['trophy-tower-gold', 'pet-aether-phoenix'], ['pet-tide', 'pet-mist-cat'],
  ['outfit-pathfinder', 'pet-blossom-moth'], ['trophy-golem', 'pet-crystal-golem'],
];
const economy = user => ({ xp: user.xp, totalXp: user.totalXp, inventory: user.inventory,
  equipment: user.equipment, skills: user.skills, stats: user.stats });

async function fixture(t, dbPath = ':memory:', initialCookie = '') {
  const app = createApp({ dbPath });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  let closed = false, cookie = initialCookie;
  const close = async () => { if (!closed) { closed = true; await app.close(); } };
  t.after(close);
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const request = async (path, body) => {
    const response = await fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, body: await response.json() };
  };
  if (!cookie) assert.equal((await request('/api/auth/login', { email: 'lina@demo.schule', password: 'Klassenhelden!2026' })).status, 200);
  return { ...app, close, request, get cookie() { return cookie; }, state: async () => (await request('/api/state')).body };
}

test('every new companion has an achievable milestone and never carries combat or economy bonuses', () => {
  const allRewards = [...Object.values(TOWER_REWARDS).flat(), ...Object.values(ISLAND_REWARDS).flat(), ...RAID_REWARDS];
  assert.deepEqual(TOWER_REWARDS[4], ['outfit-starlight', 'pet-aether-falcon']);
  assert.deepEqual(TOWER_REWARDS[6], ['trophy-tower-bronze', 'pet-clockwork-beetle']);
  assert.ok(TOWER_REWARDS[10].includes('pet-aether-phoenix'));
  assert.deepEqual(ISLAND_REWARDS[3], ['pet-tide', 'pet-mist-cat']);
  assert.deepEqual(ISLAND_REWARDS[5], ['outfit-pathfinder', 'pet-blossom-moth']);
  assert.ok(RAID_REWARDS.includes('pet-crystal-golem'));
  for (const [proof, companion] of proofPairs) {
    assert.ok(allRewards.includes(companion));
    const item = COSMETICS.find(item => item.id === companion);
    assert.equal(item.type, 'companion');
    assert.equal('bonuses' in item, false);
    assert.equal('xp' in item, false);
    assert.deepEqual(expandAdventureRewards([proof, proof, 'client-fake']), [proof, companion]);
    assert.deepEqual(expandAdventureRewards([proof, companion]), [proof, companion]);
  }
});

test('previously secured achievements grant all six matching companions once while preserving accounts and selections', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'aetheria-companions-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'school.sqlite');
  let db = openStore(path);
  const timestamp = '2026-01-02T03:04:05.000Z';
  for (const [proof] of proofPairs) db.prepare('INSERT INTO cosmetic_unlocks VALUES (?,?,?)').run('demo-lina', proof, timestamp);
  db.prepare('INSERT INTO cosmetic_unlocks VALUES (?,?,?)').run('demo-lina', 'pet-firefly', timestamp);
  db.prepare('UPDATE users SET cosmetic_loadout = ? WHERE id = ?')
    .run(JSON.stringify({ companion: 'pet-firefly', outfit: 'outfit-starlight' }), 'demo-lina');
  const account = db.prepare('SELECT * FROM users WHERE id = ?').get('demo-lina');
  db.close();
  db = openStore(path, { demo: false });
  const earned = db.prepare('SELECT * FROM cosmetic_unlocks WHERE user_id = ? ORDER BY item_id').all('demo-lina');
  assert.equal(earned.length, 13);
  for (const [proof, companion] of proofPairs) {
    assert.ok(earned.some(row => row.item_id === proof));
    assert.equal(earned.find(row => row.item_id === companion).unlocked_at, timestamp);
  }
  const after = db.prepare('SELECT * FROM users WHERE id = ?').get('demo-lina');
  assert.deepEqual(after, account);
  assert.deepEqual(userView(after, { db }).cosmetics.selected, { companion: 'pet-firefly', outfit: 'outfit-starlight' });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM cosmetic_unlocks WHERE user_id = ?').get('demo-ben').count, 0);
  db.close();
  db = openStore(path, { demo: false });
  try {
    assert.deepEqual(db.prepare('SELECT * FROM cosmetic_unlocks WHERE user_id = ? ORDER BY item_id').all('demo-lina'), earned);
    assert.deepEqual(db.prepare('SELECT * FROM users WHERE id = ?').get('demo-lina'), account);
  } finally { db.close(); }
});

test('legacy unbanked tower rewards reveal and grant the matching new companion only when secured after restart', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'aetheria-legacy-rewards-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'school.sqlite');
  const first = await fixture(t, path);
  const before = (await first.state()).user;
  const created = await first.request('/api/tower/start', {});
  const tower = created.body.tower;
  tower.state.status = 'choice'; tower.state.floor = 4; tower.state.cleared = 4;
  tower.state.pendingRewards = ['pet-firefly', 'outfit-starlight'];
  first.db.prepare('UPDATE tower_runs SET state = ? WHERE user_id = ?').run(JSON.stringify(tower.state), before.id);
  const cookie = first.cookie;
  await first.close();
  const reopened = await fixture(t, path, cookie);
  const visible = await reopened.state();
  assert.deepEqual(visible.adventure.tower.state.pendingRewards, ['pet-firefly', 'outfit-starlight', 'pet-aether-falcon']);
  assert.deepEqual(visible.adventure.tower.state.player, tower.state.player);
  assert.deepEqual(JSON.parse(reopened.db.prepare('SELECT state FROM tower_runs WHERE user_id = ?').get(before.id).state).pendingRewards, tower.state.pendingRewards);
  assert.deepEqual(visible.user.cosmetics.owned, []);
  assert.equal((await reopened.request('/api/cosmetics/equip', { type: 'companion', id: 'pet-aether-falcon', owned: ['pet-aether-falcon'] })).status, 403);
  const banked = await reopened.request('/api/tower/choice', { choice: 'bank', floor: 4, runId: tower.id, pendingRewards: ['pet-aether-phoenix'] });
  assert.equal(banked.status, 200);
  assert.deepEqual(banked.body.unlocked, ['pet-firefly', 'outfit-starlight', 'pet-aether-falcon']);
  const after = (await reopened.state()).user;
  assert.deepEqual(economy(after), economy(before));
  assert.ok(!after.cosmetics.owned.includes('pet-aether-phoenix'));
  assert.equal((await reopened.request('/api/tower/choice', { choice: 'bank', floor: 4, runId: tower.id })).status, 409);
  assert.equal(reopened.db.prepare('SELECT COUNT(*) AS count FROM cosmetic_unlocks WHERE user_id = ? AND item_id = ?').get(before.id, 'pet-aether-falcon').count, 1);
  assert.equal((await reopened.request('/api/cosmetics/equip', { type: 'companion', id: 'pet-aether-falcon', bonuses: { attack: 999 }, xp: 999 })).status, 200);
  assert.deepEqual(economy((await reopened.state()).user), economy(before));
});

test('unsecured companions cannot be equipped or claimed by abandoning an old run', async t => {
  const f = await fixture(t);
  const before = (await f.state()).user;
  const result = await f.request('/api/tower/start', { pendingRewards: ['pet-aether-phoenix'] });
  const tower = result.body.tower;
  tower.state.floor = 5; tower.state.cleared = 4;
  tower.state.pendingRewards = ['pet-firefly', 'outfit-starlight'];
  f.db.prepare('UPDATE tower_runs SET state = ? WHERE user_id = ?').run(JSON.stringify(tower.state), before.id);
  for (const [, companion] of proofPairs) assert.equal((await f.request('/api/cosmetics/equip', { type: 'companion', id: companion })).status, 403);
  const abandoned = await f.request('/api/tower/abandon', { runId: tower.id, pendingRewards: ['pet-aether-falcon'] });
  assert.equal(abandoned.status, 200);
  assert.deepEqual(abandoned.body.tower.state.pendingRewards, []);
  const after = (await f.state()).user;
  assert.deepEqual(after.cosmetics.owned, []);
  assert.deepEqual(economy(after), economy(before));
});
