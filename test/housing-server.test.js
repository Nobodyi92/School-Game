import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server.js';
import { HOME_LOCATIONS, initialHomeLayout } from '../shared/housing.js';

async function fixture(t, options = {}) {
  const app = createApp({ dbPath: ':memory:', ...options });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await app.close(); } }; t.after(close);
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  function client() {
    let cookie = '';
    return {
      async request(path, body) {
        const response = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST',
          headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        return { status: response.status, body: await response.json() };
      },
      async login(email = 'lina@demo.schule') { return this.request('/api/auth/login', { email, password: 'Klassenhelden!2026' }); },
    };
  }
  const student = client(); await student.login();
  const fund = (coins, id = 'demo-lina') => app.db.prepare('UPDATE users SET coins = ? WHERE id = ?').run(coins, id);
  const buy = locationId => student.request('/api/home/buy', { locationId });
  return { ...app, origin, close, client, student, fund, buy };
}
const ok = response => { assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body; };
const homeRequest = (locationId = 'lysara', version = 1, placements = initialHomeLayout()) => ({ locationId, version, placements });
const price = id => HOME_LOCATIONS.find(home => home.id === id).price;

test('house purchase uses the shared wallet and trusted prices, then moving between owned homes is free', async t => {
  const { db, student, fund, buy } = await fixture(t); fund(1000);
  const before = db.prepare("SELECT * FROM users WHERE id='demo-lina'").get();
  const initial = ok(await student.request('/api/home')).home;
  assert.equal(initial.house, null); assert.equal(initial.catalogue.locations.length, 7); assert.deepEqual(initial.ownedLocations, []);
  assert.equal((await student.request('/api/home', homeRequest('lysara', 0))).status, 403);
  const result = ok(await student.request('/api/home/buy', { locationId: 'lysara', price: 0, coins: 999999, userId: 'demo-ben', placements: [] }));
  assert.equal(result.user.wallet.total, 1000 - price('lysara'));
  assert.deepEqual(result.home.house.placements, initialHomeLayout()); assert.equal(result.home.house.version, 1);
  assert.deepEqual(result.home.ownedLocations, ['lysara']);
  assert.deepEqual({ ...db.prepare("SELECT * FROM users WHERE id='demo-lina'").get() }, { ...before, coins: 1000 - price('lysara') });
  const second = ok(await buy('silverwind'));
  assert.deepEqual(second.home.house, result.home.house, 'Buying a second home keeps the current layout and location');
  const changed = ok(await student.request('/api/home', homeRequest('silverwind'))).home;
  assert.equal(changed.house.locationId, 'silverwind'); assert.deepEqual(changed.house.placements, result.home.house.placements);
  ok(await student.request('/api/home', homeRequest('lysara', 2)));
  assert.equal(ok(await student.request('/api/state')).user.wallet.total, 1000 - price('lysara') - price('silverwind'));
  assert.equal((await buy('lysara')).status, 409);
  assert.equal(ok(await student.request('/api/home')).home.ownedLocations.length, 2);
  assert.equal(ok(await student.request('/api/state')).home.house.locationId, 'lysara');
});

test('insufficient funds, unknown locations and duplicate concurrent purchases cannot grant free houses or double-charge', async t => {
  const { db, student, fund, buy } = await fixture(t);
  for (const id of ['missing', 'aether-grove']) assert.equal((await buy(id)).status, 400);
  assert.equal(db.prepare('SELECT count(*) AS count FROM home_ownership').get().count, 0);
  assert.equal(ok(await student.request('/api/home')).home.house, null);
  fund(price('aether-grove') * 2);
  const results = await Promise.all([buy('aether-grove'), buy('aether-grove')]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(ok(await student.request('/api/state')).user.wallet.total, price('aether-grove'));
});

test('invalid layouts, unowned locations, locked trophies and stale saves do not change money or the saved house', async t => {
  const { db, student, fund, buy } = await fixture(t); fund(1000); ok(await buy('lysara'));
  const saved = ok(await student.request('/api/home')).home;
  const before = db.prepare("SELECT * FROM player_homes WHERE user_id='demo-lina'").get();
  for (const body of [homeRequest('missing'), homeRequest('nebelheim'), homeRequest('lysara', 0),
    homeRequest('lysara', 1, [{ id: 'x', itemId: 'display-trophy-golem', x: 0, z: 0, rotation: 0 }]),
    homeRequest('lysara', 1, [{ id: 'x', itemId: 'chair-oak', x: 99, z: 0, rotation: 0 }]),
    homeRequest('lysara', 1, [{ id: 'a', itemId: 'chair-oak', x: 0, z: 0, rotation: 0 }, { id: 'b', itemId: 'chair-oak', x: 0, z: 0, rotation: 0 }])]) {
    const response = await student.request('/api/home', body); assert.ok(response.status >= 400 && response.status < 500, JSON.stringify(response));
    assert.deepEqual(db.prepare("SELECT * FROM player_homes WHERE user_id='demo-lina'").get(), before);
  }
  assert.equal(ok(await student.request('/api/state')).user.wallet.total, 1000 - price('lysara'));
  assert.deepEqual(ok(await student.request('/api/home')).home, saved);
});

test('role checks, per-player ownership and concurrent save versions protect homes', async t => {
  const { db, student, client, fund, buy } = await fixture(t), teacher = client(), ben = client(), anonymous = client();
  await teacher.login('lehrer@demo.schule'); await ben.login('ben@demo.schule');
  assert.equal((await anonymous.request('/api/home/buy', { locationId: 'lysara' })).status, 401);
  for (const path of ['/api/home', '/api/home/buy']) {
    assert.equal((await teacher.request(path)).status, 403);
    assert.equal((await teacher.request(path, homeRequest())).status, 403);
  }
  assert.equal(ok(await teacher.request('/api/state')).home, null);
  fund(2000); ok(await buy('nebelheim')); ok(await buy('aethkern'));
  const results = await Promise.all([
    student.request('/api/home', { ...homeRequest('nebelheim'), userId: 'demo-ben' }), student.request('/api/home', homeRequest('aethkern')),
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal(ok(await ben.request('/api/home')).home.house, null);
  assert.equal((await ben.request('/api/home', homeRequest('nebelheim', 0))).status, 403);
  assert.equal(db.prepare('SELECT count(*) AS count FROM player_homes').get().count, 1);
});

test('secured adventure achievements unlock furniture and trophies independently of home purchases', async t => {
  const { db, student, fund, buy } = await fixture(t);
  assert.ok(!ok(await student.request('/api/home')).home.owned.some(item => item.itemId === 'display-trophy-golem'));
  db.prepare('INSERT INTO cosmetic_unlocks VALUES(?,?,?)').run('demo-lina', 'trophy-golem', new Date().toISOString());
  const unlocked = ok(await student.request('/api/home')).home;
  assert.equal(unlocked.house, null); assert.ok(unlocked.owned.some(item => item.itemId === 'lamp-crystal'));
  fund(1000); ok(await buy('zephyria'));
  const placement = { id: 'earned-trophy', itemId: 'display-trophy-golem', x: .13, z: -.23, rotation: 27 };
  const house = ok(await student.request('/api/home', homeRequest('zephyria', 1, [placement]))).home.house;
  assert.deepEqual(house.placements, [placement]);
});

test('house and ship purchases cannot overspend their shared wallet when submitted together', async t => {
  const { db, student, fund, buy } = await fixture(t); fund(price('zephyria'));
  db.prepare("UPDATE users SET total_xp=400 WHERE id='demo-lina'").run();
  const results = await Promise.all([buy('zephyria'), student.request('/api/airships/buy', { shipId: 'windling' })]);
  assert.equal(results.filter(r => r.status === 200).length, 1);
  const state = ok(await student.request('/api/state'));
  const spent = state.home.ownedLocations.length ? price('zephyria') : 250;
  assert.equal(state.user.wallet.total, price('zephyria') - spent);
  assert.equal(state.home.ownedLocations.length + state.airships.owned.length, 1);
});

test('paid home ownership, layout and wallet survive restarting the existing database', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'aetheria-home-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'game.sqlite'), first = await fixture(t, { dbPath });
  first.fund(1000); ok(await first.buy('aether-grove'));
  const layout = [{ id: 'chair', itemId: 'chair-oak', x: -1.234, z: .567, rotation: 43 }];
  ok(await first.student.request('/api/home', homeRequest('aether-grove', 1, layout)));
  const saved = ok(await first.student.request('/api/state'));
  await first.close(); const second = await fixture(t, { dbPath });
  const restored = ok(await second.student.request('/api/state'));
  assert.deepEqual(restored.home, saved.home); assert.deepEqual(restored.user, saved.user);
});

test('upgrading the free-home version preserves its existing home and furniture without a retroactive charge', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'aetheria-old-home-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'game.sqlite'), first = await fixture(t, { dbPath });
  const layout = [{ id: 'old-chair', itemId: 'chair-oak', x: -.17, z: 1.12, rotation: 32 }];
  first.db.prepare('INSERT INTO player_homes VALUES(?,?,?,?,?)').run('demo-lina', 'lysara', JSON.stringify(layout), 4, new Date().toISOString());
  const before = first.db.prepare("SELECT * FROM users WHERE id='demo-lina'").get();
  first.db.exec('DROP TABLE home_ownership; DROP TABLE daily_chest_claims;'); await first.close();
  const second = await fixture(t, { dbPath });
  const home = ok(await second.student.request('/api/home')).home;
  assert.deepEqual(home.ownedLocations, ['lysara']); assert.deepEqual(home.house.placements, layout); assert.equal(home.house.version, 4);
  assert.deepEqual(second.db.prepare("SELECT * FROM users WHERE id='demo-lina'").get(), before);
  ok(await second.student.request('/api/home', homeRequest('lysara', 4, layout)));
  assert.equal((await second.buy('nebelheim')).status, 400);
});

test('house and daily-chest assets are local while database internals stay private', async t => {
  const { origin } = await fixture(t);
  for (const path of ['/housing.js', '/housing3d.js', '/housing.css', '/shared/housing.js', '/daily-chest.js', '/daily-chest.css']) {
    const response = await fetch(origin + path); assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), path.endsWith('.css') ? /text\/css/ : /javascript/);
  }
  for (const path of ['/lib/housing.js', '/lib/daily-chest.js']) assert.equal((await fetch(origin + path)).status, 404);
});
