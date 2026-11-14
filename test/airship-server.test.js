import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';
import { openStore } from '../lib/store.js';
import { grantShipParts } from '../lib/airships.js';
import { shipStats, journeyDurationMs } from '../shared/airships.js';

const password = 'Klassenhelden!2026';
const ok = response => { assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body; };
const rejected = response => assert.ok(response.status >= 400 && response.status < 500, JSON.stringify(response));
const economy = user => ({ xp: user.xp, totalXp: user.totalXp, inventory: user.inventory, skills: user.skills,
  equipment: user.equipment, cosmetics: user.cosmetics, stats: user.stats });

async function fixture(t, options = {}) {
  let clock = Date.UTC(2026, 10, 14, 12);
  const app = createApp({ dbPath: ':memory:', now: () => clock, ...options });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await app.close(); } };
  t.after(close);
  const client = () => {
    let cookie = '';
    return {
      async request(path, body) {
        const response = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST',
          headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        return { status: response.status, body: await response.json() };
      },
      async login(email = 'lina@demo.schule') { return ok(await this.request('/api/auth/login', { email, password })).user; },
      async state() { return ok(await this.request('/api/state')); },
    };
  };
  const level = (value, coins = 10000, id = 'demo-lina') => app.db.prepare('UPDATE users SET total_xp = ?, coins = ? WHERE id = ?')
    .run((value - 1) * 100, coins, id);
  return { ...app, origin, client, close, level, advance: milliseconds => { clock += milliseconds; } };
}

test('airships enforce student access and player levels 5 and 10 with server-owned prices', async t => {
  const f = await fixture(t), student = f.client(), teacher = f.client(), anonymous = f.client();
  await student.login(); await teacher.login('lehrer@demo.schule');
  assert.equal((await teacher.state()).airships, null);
  assert.equal((await anonymous.request('/api/airships/buy', { shipId: 'windling' })).status, 401);
  assert.equal((await teacher.request('/api/airships/buy', { shipId: 'windling' })).status, 403);
  f.level(4);
  rejected(await student.request('/api/airships/buy', { shipId: 'windling', level: 5 }));
  f.level(5, 1000);
  const before = (await student.state()).user;
  const first = ok(await student.request('/api/airships/buy', { shipId: 'windling', price: 0, coins: 999999,
    modifications: { sails: 'sails-zephyria' }, stats: { speed: 999999 } }));
  assert.equal(first.user.wallet.total, 750);
  assert.deepEqual(economy(first.user), economy(before));
  assert.equal(first.airships.activeShipId, 'windling');
  assert.deepEqual(first.airships.owned[0].modifications, { sails: null, hull: null, flag: null });
  assert.deepEqual(first.airships.owned[0].stats, shipStats('windling'));
  assert.equal(ok(await student.request('/api/airships/buy', { shipId: 'himmelsfalter' })).user.wallet.total, 0);
  assert.equal((await student.state()).airships.activeShipId, 'windling');
  f.level(9);
  rejected(await student.request('/api/airships/buy', { shipId: 'aetherarche' }));
  f.level(10, 3000);
  assert.equal(ok(await student.request('/api/airships/buy', { shipId: 'aetherarche' })).user.wallet.total, 0);
  assert.equal((await student.state()).airships.owned.length, 3);
});

test('concurrent purchases spend exactly once and insufficient money never grants ownership', async t => {
  const f = await fixture(t), student = f.client(); await student.login(); f.level(5, 250);
  const result = await Promise.all([student.request('/api/airships/buy', { shipId: 'windling' }), student.request('/api/airships/buy', { shipId: 'windling' })]);
  assert.equal(result.filter(response => response.status === 200).length, 1);
  rejected(result.find(response => response.status !== 200));
  const before = await student.state();
  rejected(await student.request('/api/airships/buy', { shipId: 'himmelsfalter', price: 0 }));
  rejected(await student.request('/api/airships/buy', { shipId: '__proto__' }));
  const after = await student.state();
  assert.equal(after.user.wallet.total, 0);
  assert.equal(after.airships.owned.length, 1);
  assert.deepEqual(after.airships, before.airships);
});

test('chests grant level-based money alongside unchanged loot and cannot mint from an empty chest', async t => {
  const f = await fixture(t, { lootRandomInt: () => 0, coinRandomInt: (min, exclusive) => exclusive - 1 });
  const student = f.client(); await student.login(); f.level(5, 0);
  const inventory = JSON.parse(f.db.prepare('SELECT inventory FROM users WHERE id = ?').get('demo-lina').inventory);
  inventory.chests = 1;
  f.db.prepare('UPDATE users SET inventory = ? WHERE id = ?').run(JSON.stringify(inventory), 'demo-lina');
  const before = (await student.state()).user;
  const response = ok(await student.request('/api/chests/open', { coins: 999999, level: 100, rarity: 'legendary' }));
  assert.equal(response.coinsAwarded, 70);
  assert.equal(response.user.wallet.total, 70);
  assert.equal(response.user.totalXp, before.totalXp);
  assert.equal(response.user.xp, before.xp);
  assert.equal(response.drops.length, 1);
  assert.equal(response.drops[0].kind, 'potion');
  rejected(await student.request('/api/chests/open', { coins: 999999 }));
  assert.equal((await student.state()).user.wallet.total, 70);
});

test('designs require ownership and matching slots and change travel without character combat bonuses', async t => {
  const f = await fixture(t), student = f.client(), other = f.client();
  await student.login(); await other.login('ben@demo.schule'); f.level(5);
  ok(await student.request('/api/airships/buy', { shipId: 'windling' }));
  const before = (await student.state()).user;
  rejected(await student.request('/api/airships/equip', { shipId: 'windling', slot: 'sails', partId: 'sails-zephyria' }));
  grantShipParts(f.db, 'demo-lina', ['pet-firefly', 'trophy-golem'], 5, '2026-11-14T12:00:00.000Z');
  rejected(await student.request('/api/airships/equip', { shipId: 'windling', slot: 'sails', partId: 'flag-nebelheim' }));
  rejected(await student.request('/api/airships/equip', { shipId: 'windling', slot: '__proto__', partId: 'sails-zephyria' }));
  rejected(await other.request('/api/airships/select', { shipId: 'windling', userId: 'demo-lina' }));
  const response = ok(await student.request('/api/airships/equip', { shipId: 'windling', slot: 'sails', partId: 'sails-zephyria', bonuses: { speed: 99999 } }));
  assert.equal(response.airships.owned[0].stats.speed, 47);
  assert.deepEqual(economy(response.user), economy(before));
  assert.equal(response.user.wallet.total, before.wallet.total);
  assert.ok(journeyDurationMs(response.airships.owned[0].stats, 'nebelheim', 'aethkern') < journeyDurationMs(shipStats('windling'), 'nebelheim', 'aethkern'));
  assert.deepEqual((await other.state()).airships.ownedParts, []);
  const basic = ok(await student.request('/api/airships/equip', { shipId: 'windling', slot: 'sails', partId: null }));
  assert.deepEqual(basic.airships.owned[0].stats, shipStats('windling'));
});

test('travel follows only current berths, snapshots trusted stats and rejects duplicate departure', async t => {
  const f = await fixture(t), student = f.client(); await student.login(); f.level(5);
  const bought = ok(await student.request('/api/airships/buy', { shipId: 'windling' })).airships;
  for (const destinationId of ['zephyria', 'tower', '__proto__', 'nebelheim']) rejected(await student.request('/api/airships/travel', { destinationId, version: bought.version }));
  rejected(await student.request('/api/airships/travel', { destinationId: 'aethkern' }));
  const departures = await Promise.all([0, 1].map(() => student.request('/api/airships/travel', { destinationId: 'aethkern', version: bought.version, stats: { speed: 99999 }, durationMs: 1 })));
  assert.equal(departures.filter(response => response.status === 200).length, 1);
  rejected(departures.find(response => response.status !== 200));
  const airships = departures.find(response => response.status === 200).body.airships;
  const trip = airships.journey;
  assert.deepEqual(trip.statsSnapshot, shipStats('windling'));
  assert.equal(Date.parse(trip.arrivesAt) - Date.parse(trip.startedAt), journeyDurationMs(trip.statsSnapshot, 'nebelheim', 'aethkern'));
  rejected(await student.request('/api/airships/select', { shipId: 'windling' }));
  rejected(await student.request('/api/airships/equip', { shipId: 'windling', slot: 'sails', partId: null }));
  f.advance(250);
  assert.deepEqual((await student.state()).airships, airships, 'polling before arrival must not change fixed state');
  f.advance(Date.parse(trip.arrivesAt) - Date.parse(trip.startedAt));
  const arrived = (await student.state()).airships;
  assert.equal(arrived.journey, null); assert.equal(arrived.dockId, 'aethkern'); assert.equal(arrived.version, airships.version);
  assert.notEqual(f.db.prepare('SELECT journey FROM airship_state WHERE user_id = ?').get('demo-lina').journey, 'null', 'state view must not write arrival');
  const returning = ok(await student.request('/api/airships/travel', { destinationId: 'nebelheim', version: arrived.version })).airships;
  assert.equal(returning.journey.fromDockId, 'aethkern');
  assert.equal(returning.version, arrived.version + 1);
});

test('secured tower rewards grant ship designs only from level 5, including replayed cosmetics', async t => {
  const f = await fixture(t), student = f.client(); await student.login(); f.level(4, 0);
  async function secure() {
    const run = ok(await student.request('/api/tower/start', {})).tower;
    const state = run.state;
    Object.assign(state, { floor: 2, cleared: 2, status: 'choice', pendingRewards: ['pet-firefly'] });
    f.db.prepare('UPDATE tower_runs SET state = ? WHERE user_id = ?').run(JSON.stringify(state), 'demo-lina');
    return ok(await student.request('/api/tower/choice', { choice: 'bank', floor: 2, runId: run.id }));
  }
  await secure();
  assert.ok((await student.state()).user.cosmetics.owned.includes('pet-firefly'));
  assert.deepEqual((await student.state()).airships.ownedParts, []);
  f.level(5, 0);
  assert.deepEqual((await student.state()).airships.ownedParts, [], 'old achievements must not grant parts automatically');
  const before = (await student.state()).user;
  await secure();
  const after = await student.state();
  assert.deepEqual(after.airships.ownedParts, ['flag-nebelheim', 'sails-silberwind']);
  assert.deepEqual(economy(after.user), economy(before));
  assert.equal(after.user.wallet.total, 0);
});

test('money, selected ship, equipped design and an active journey survive a server restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'aether-airships-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dbPath = join(directory, 'game.sqlite');
  const first = await fixture(t, { dbPath }), student = first.client(); await student.login(); first.level(5, 1000);
  ok(await student.request('/api/airships/buy', { shipId: 'windling' }));
  grantShipParts(first.db, 'demo-lina', ['pet-firefly'], 5, '2026-11-14T12:00:00.000Z');
  const equipped = ok(await student.request('/api/airships/equip', { shipId: 'windling', slot: 'sails', partId: 'sails-silberwind' }));
  const travelling = ok(await student.request('/api/airships/travel', { destinationId: 'sky-rest', version: equipped.airships.version }));
  await first.close();
  const second = await fixture(t, { dbPath }), returning = second.client(); await returning.login();
  const restored = await returning.state();
  assert.deepEqual(restored.airships, travelling.airships);
  assert.deepEqual(restored.user.wallet, travelling.user.wallet);
});

test('adding the airship schema preserves old accounts and starts their wallets empty', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'aether-migration-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'old.sqlite');
  let db = openStore(path);
  const before = db.prepare('SELECT xp, total_xp, inventory, equipment FROM users WHERE id = ?').get('demo-lina');
  db.exec('DROP TABLE airship_state; DROP TABLE airship_parts; DROP TABLE airship_ownership; ALTER TABLE users DROP COLUMN coins;');
  db.close();
  db = openStore(path);
  try {
    assert.equal(db.prepare('SELECT coins FROM users WHERE id = ?').get('demo-lina').coins, 0);
    assert.deepEqual(db.prepare('SELECT xp, total_xp, inventory, equipment FROM users WHERE id = ?').get('demo-lina'), before);
    assert.equal(db.prepare('SELECT count(*) AS count FROM airship_ownership').get().count, 0);
  } finally { db.close(); }
});
