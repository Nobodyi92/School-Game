import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';
import { dailyChestDay } from '../lib/daily-chest.js';

const ok = result => { assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body; };
async function fixture(t, options = {}) {
  let clock = Date.parse('2026-11-15T12:00:00Z');
  const app = createApp({ dbPath: ':memory:', now: () => clock, ...options });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  let closed = false; const close = async () => { if (!closed) { closed = true; await app.close(); } }; t.after(close);
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
      async login(email = 'lina@demo.schule') { return ok(await this.request('/api/auth/login', { email, password: 'Klassenhelden!2026' })); },
      async state() { return ok(await this.request('/api/state')); },
      async claim(body = {}) { return this.request('/api/chests/daily', body); },
    };
  }
  return { ...app, close, origin, client, setTime: iso => { clock = Date.parse(iso); }, advance: ms => { clock += ms; } };
}

test('daily chest is opt-in, server-owned and adds one unopened chest without altering money, XP or school rewards', async t => {
  const f = await fixture(t), student = f.client(); await student.login();
  const before = (await student.state()).user;
  const rewardCount = f.db.prepare('SELECT count(*) AS n FROM rewards').get().n;
  assert.equal((await student.state()).dailyChest.available, true);
  assert.deepEqual((await student.state()).user, before);
  const result = ok(await student.claim({ amount: 99, day: '2099-01-01', userId: 'demo-ben', coins: 99999, xp: 100 }));
  assert.equal(result.dailyChest.available, false); assert.equal(result.dailyChest.day, '2026-11-15');
  assert.deepEqual(result.user, { ...before, inventory: { ...before.inventory, chests: before.inventory.chests + 1 } });
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM rewards').get().n, rewardCount);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM daily_chest_claims WHERE user_id='demo-ben'").get().n, 0);
});

test('separate sessions cannot claim the same daily chest twice and each student has an independent claim', async t => {
  const f = await fixture(t), first = f.client(), second = f.client(), ben = f.client();
  await first.login(); await second.login(); await ben.login('ben@demo.schule');
  const before = (await first.state()).user.inventory.chests;
  const results = await Promise.all([first.claim(), second.claim(), first.claim()]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409, 409]);
  assert.equal((await first.state()).user.inventory.chests, before + 1);
  await first.login(); assert.equal((await first.claim()).status, 409);
  ok(await ben.claim()); assert.equal(f.db.prepare('SELECT count(*) AS n FROM daily_chest_claims').get().n, 2);
});

test('daily chests require a student login and POST; merely checking availability never claims one', async t => {
  const f = await fixture(t), anonymous = f.client(), teacher = f.client(), student = f.client();
  assert.equal((await anonymous.claim()).status, 401); await teacher.login('lehrer@demo.schule');
  assert.equal((await teacher.claim()).status, 403); assert.equal((await teacher.state()).dailyChest, null);
  await student.login(); assert.equal((await student.request('/api/chests/daily')).status, 405);
  assert.equal((await student.state()).dailyChest.available, true);
});

test('the next chest unlocks at Berlin midnight rather than after 24 hours or on a client-submitted date', async t => {
  const f = await fixture(t), student = f.client(); f.setTime('2026-11-15T22:59:59Z'); await student.login();
  assert.equal(ok(await student.claim()).dailyChest.day, '2026-11-15');
  f.advance(1000); assert.equal((await student.state()).dailyChest.available, true);
  assert.equal(ok(await student.claim({ day: '2026-11-15' })).dailyChest.day, '2026-11-16');
  assert.equal((await student.claim({ day: '2026-11-17' })).status, 409);
});

test('summer time and both daylight-saving transitions still use one local calendar day', async t => {
  assert.equal(dailyChestDay('2026-06-01T22:00:00Z'), '2026-06-02');
  assert.equal(dailyChestDay('2026-11-01T22:00:00Z'), '2026-11-01');
  const f = await fixture(t), student = f.client(); f.setTime('2026-10-25T00:30:00Z'); await student.login();
  ok(await student.claim()); f.setTime('2026-10-25T01:30:00Z');
  assert.equal((await student.claim()).status, 409, 'The repeated 02:30 hour is not a second day');
  f.setTime('2026-03-29T00:30:00Z'); await student.login(); ok(await student.claim());
  f.setTime('2026-03-29T01:30:00Z'); assert.equal((await student.claim()).status, 409);
});

test('missed days do not accumulate extra free chests', async t => {
  const f = await fixture(t), student = f.client(); await student.login(); ok(await student.claim());
  f.advance(3 * 86400000); const before = (await student.state()).user.inventory.chests;
  ok(await student.claim({ amount: 3 })); assert.equal((await student.state()).user.inventory.chests, before + 1);
  assert.equal((await student.claim()).status, 409);
});

test('daily chests open with ordinary level-based money and loot, allowing a new player to save for a home without a teacher', async t => {
  const f = await fixture(t, { coinRandomInt: (min, max) => max - 1, lootRandomInt: () => 0 }), student = f.client();
  ok(await student.request('/api/auth/register', { name: 'Neue Heldin', email: 'daily@demo.schule', password: 'Klassenhelden!2026', characterName: 'Wolkenstern' }));
  for (let day = 0; day < 5; day++) {
    ok(await student.claim());
    const opened = ok(await student.request('/api/chests/open', { coins: 9999, level: 100 }));
    assert.equal(opened.coinsAwarded, 30); assert.equal(opened.drops.length, 1);
    assert.equal(opened.user.inventory.chests, 0); assert.equal(opened.user.wallet.total, (day + 1) * 30);
    assert.equal(opened.user.xp, 0); assert.equal(opened.user.totalXp, 0);
    if (day < 4) { assert.equal((await student.request('/api/home/buy', { locationId: 'aether-grove' })).status, 400); f.advance(86400000); }
  }
  const bought = ok(await student.request('/api/home/buy', { locationId: 'aether-grove', price: 0 }));
  assert.equal(bought.user.wallet.total, 0); assert.equal(bought.home.house.locationId, 'aether-grove');
  assert.equal((await student.state()).rewards.length, 0);
});

test('a failed claim rolls back its daily entitlement', async t => {
  const f = await fixture(t), student = f.client(); await student.login();
  const inventory = (await student.state()).user.inventory;
  f.db.prepare("UPDATE users SET inventory=? WHERE id='demo-lina'").run(JSON.stringify({ ...inventory, chests: Number.MAX_SAFE_INTEGER }));
  assert.equal((await student.claim()).status, 409); assert.equal((await student.state()).dailyChest.available, true);
  f.db.prepare("UPDATE users SET inventory=? WHERE id='demo-lina'").run(JSON.stringify(inventory));
  ok(await student.claim());
});

test('daily entitlement and unopened chest persist through server restarts', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'aetheria-daily-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'game.sqlite'), first = await fixture(t, { dbPath });
  const student = first.client(); await student.login(); const saved = ok(await student.claim()); await first.close();
  const second = await fixture(t, { dbPath }), restored = second.client(); await restored.login();
  assert.deepEqual((await restored.state()).dailyChest, saved.dailyChest);
  assert.deepEqual((await restored.state()).user.inventory, saved.user.inventory);
  assert.equal((await restored.claim()).status, 409);
});
