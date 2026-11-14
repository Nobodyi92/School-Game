import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';

const password = 'Klassenhelden!2026';
function seeded(seed) { return max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; }; }
async function start(options = {}) {
  const app = createApp({ dbPath: ':memory:', islandRandomInt: seeded(27), ...options });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  function client(initialCookie = '') {
    let cookie = initialCookie;
    return {
      get cookie() { return cookie; },
      async request(path, body) {
        const response = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST',
          headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        return { status: response.status, body: await response.json() };
      },
      async login(email = 'lina@demo.schule') {
        const result = await this.request('/api/auth/login', { email, password }); assert.equal(result.status, 200); return result.body.user;
      },
      async state() { const result = await this.request('/api/state'); assert.equal(result.status, 200); return result.body; },
    };
  }
  return { ...app, origin, client };
}
async function fixture(t, options = {}) {
  const app = await start(options); t.after(() => app.close()); return app;
}
function packet(island, extra = {}) { return { runId: island.id, version: island.state.version, ...extra }; }
async function progress(client, db, limit = 7) {
  for (let i = 0; i < 250; i++) {
    const current = (await client.state()).adventure.island;
    if (current.state.status !== 'active' || (current.state.cleared >= limit && ['route', 'boon'].includes(current.state.phase))) return current;
    const run = current.state;
    let path = '/api/island/choice', choice;
    if (run.phase === 'route') choice = ['camp', 'puzzle', 'treasure', 'event', 'combat', 'guardian'].flatMap(kind => run.choices.filter(c => c.kind === kind))[0].id;
    else if (run.phase === 'combat') {
      path = '/api/island/action';
      choice = run.player.hp < run.player.maxHp * .45 && !run.springUsed ? 'spring'
        : run.enemy.intent === 'heavy' && run.player.hp < run.player.maxHp * .6 ? 'guard'
          : run.player.focusCooldown === 0 ? 'focus' : 'attack';
    } else if (run.phase === 'boon') choice = ['vigor', 'edge', 'mirror', 'echo', 'renew'].find(id => run.offers.some(offer => offer.id === id));
    else if (run.phase === 'puzzle') choice = JSON.parse(db.prepare('SELECT state FROM island_runs WHERE id = ?').get(current.id).state).encounter.correctOption;
    else if (run.phase === 'camp') choice = run.player.hp < run.player.maxHp * .6 ? 'heal' : 'boon';
    else if (run.phase === 'treasure') choice = 'boon';
    else choice = run.encounter.id === 'bridge' ? 'safe' : run.encounter.id === 'trader' ? 'leave' : 'guide';
    const response = await client.request(path, packet(current, { [path.endsWith('action') ? 'action' : 'choice']: choice }));
    assert.equal(response.status, 200, JSON.stringify(response.body));
  }
  assert.fail('The island expedition did not finish within its expected move budget.');
}

test('island actions require student sessions and never expose another student expedition', async t => {
  const { client } = await fixture(t);
  const anonymous = client(), teacher = client(), lina = client(), ben = client();
  assert.equal((await anonymous.request('/api/island/start', {})).status, 401);
  await teacher.login('lehrer@demo.schule');
  for (const action of ['start', 'choice', 'action', 'bank', 'abandon']) assert.equal((await teacher.request(`/api/island/${action}`, {})).status, 403);
  await lina.login(); await ben.login('ben@demo.schule');
  const island = (await lina.request('/api/island/start', {})).body.island;
  assert.equal((await ben.state()).adventure.island, null);
  assert.equal((await ben.request('/api/island/abandon', packet(island))).status, 404);
  assert.equal((await lina.state()).adventure.island.id, island.id);
});

test('island starts ignore client progress, preserve the economy and reject overlapping runs', async t => {
  const { client } = await fixture(t); const player = client(); const before = await player.login();
  const result = await player.request('/api/island/start', { cleared: 7, fragments: 999, pendingRewards: ['trophy-island'], player: { hp: 999 } });
  assert.equal(result.status, 200); assert.equal(result.body.island.state.cleared, 0); assert.equal(result.body.island.state.fragments, 0);
  assert.equal(result.body.island.state.routeDeck, undefined);
  assert.deepEqual(result.body.island.state.pendingRewards, []);
  assert.equal(result.body.island.state.player.hp, before.stats.maxHp);
  assert.equal((await player.request('/api/island/start', {})).status, 409);
  assert.deepEqual((await player.state()).user, before);
});

test('duplicate or competing path requests apply once and require the matching run ID and version', async t => {
  const { client } = await fixture(t); const player = client(); await player.login();
  const island = (await player.request('/api/island/start', {})).body.island;
  for (const malformed of [{}, { runId: island.id }, packet(island, { version: '0' }), packet(island, { version: -1 })])
    assert.equal((await player.request('/api/island/choice', malformed)).status, 400);
  const before = (await player.state()).adventure.island;
  assert.equal((await player.request('/api/island/choice', packet(island, { choice: 'free-legendary' }))).status, 400);
  assert.deepEqual((await player.state()).adventure.island, before);
  const results = await Promise.all(island.state.choices.map(option => player.request('/api/island/choice', packet(island, { choice: option.id }))));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await player.state()).adventure.island.state.version, 1);
});

test('private puzzle answers and future routes remain server-side through the state API', async t => {
  const { client, db } = await fixture(t); const player = client(); await player.login();
  const island = (await player.request('/api/island/start', {})).body.island;
  const raw = JSON.parse(db.prepare('SELECT state FROM island_runs WHERE id = ?').get(island.id).state);
  raw.choices = [{ id: 'puzzle-path', kind: 'puzzle', title: 'Leuchtsteine', description: 'Ein Rätsel' }];
  db.prepare('UPDATE island_runs SET state = ? WHERE id = ?').run(JSON.stringify(raw), island.id);
  const response = await player.request('/api/island/choice', packet(island, { choice: 'puzzle-path' }));
  assert.equal(response.status, 200);
  assert.equal(response.body.island.state.encounter.correctOption, undefined);
  assert.equal(response.body.island.state.encounter.explanation, undefined);
  const stored = JSON.parse(db.prepare('SELECT state FROM island_runs WHERE id = ?').get(island.id).state);
  assert.ok(stored.encounter.correctOption);
  assert.ok(stored.routeDeck);
  assert.equal((await player.state()).adventure.island.state.routeDeck, undefined);
});

test('three cleared stations bank a unique companion without granting XP, potions or equipment', async t => {
  const { client, db } = await fixture(t); const player = client(); const before = await player.login();
  await player.request('/api/island/start', {});
  const island = await progress(player, db, 3);
  assert.equal(island.state.cleared, 3);
  assert.ok(island.state.pendingRewards.includes('pet-tide'));
  assert.ok(!(await player.state()).user.cosmetics.owned.includes('pet-tide'));
  assert.ok(!(await player.state()).user.cosmetics.owned.includes('pet-mist-cat'));
  const result = await player.request('/api/island/bank', packet(island));
  assert.equal(result.status, 200); assert.deepEqual(result.body.unlocked, ['pet-tide', 'pet-mist-cat']);
  const after = (await player.state()).user;
  assert.equal(after.xp, before.xp); assert.equal(after.totalXp, before.totalXp); assert.deepEqual(after.inventory, before.inventory);
  assert.equal((await player.request('/api/island/bank', packet(island))).status, 409);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM cosmetic_unlocks WHERE user_id = ? AND item_id = ?').get(after.id, 'pet-tide').count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM cosmetic_unlocks WHERE user_id = ? AND item_id = ?').get(after.id, 'pet-mist-cat').count, 1);
  assert.equal((await player.request('/api/cosmetics/equip', { type: 'companion', id: 'pet-mist-cat' })).status, 200);
  assert.equal((await player.state()).user.cosmetics.selected.companion, 'pet-mist-cat');
  assert.equal((await player.request('/api/cosmetics/equip', { type: 'companion', id: 'pet-tide' })).status, 200);
  assert.equal((await player.state()).user.cosmetics.selected.companion, 'pet-tide');
});

test('a complete expedition defeats the guardian and grants all three new cosmetics once', async t => {
  const { client, db } = await fixture(t); const player = client(); const before = await player.login();
  await player.request('/api/island/start', {}); const island = await progress(player, db);
  assert.equal(island.state.status, 'completed'); assert.equal(island.state.cleared, 7);
  assert.equal(island.state.enemy.hp, 0);
  const after = (await player.state()).user;
  for (const id of ['pet-tide', 'pet-mist-cat', 'outfit-pathfinder', 'pet-blossom-moth', 'trophy-island']) assert.ok(after.cosmetics.owned.includes(id));
  assert.equal(after.xp, before.xp); assert.deepEqual(after.inventory, before.inventory);
  assert.equal((await player.request('/api/cosmetics/equip', { type: 'outfit', id: 'outfit-pathfinder' })).status, 200);
  assert.equal((await player.request('/api/island/action', packet(island, { action: 'attack' }))).status, 400);
});

test('abandonment loses unbanked finds and old decisions cannot affect the next expedition', async t => {
  const { client, db } = await fixture(t); const player = client(); const before = await player.login();
  await player.request('/api/island/start', {}); const old = await progress(player, db, 3);
  const lost = await player.request('/api/island/abandon', packet(old));
  assert.equal(lost.status, 200); assert.equal(lost.body.island.state.status, 'lost'); assert.deepEqual(lost.body.island.state.pendingRewards, []);
  assert.deepEqual((await player.state()).user, before);
  const fresh = (await player.request('/api/island/start', {})).body.island;
  assert.notEqual(fresh.id, old.id);
  for (const action of ['choice', 'bank', 'abandon']) assert.equal((await player.request(`/api/island/${action}`, packet(old, { choice: 'edge' }))).status, 409);
  assert.deepEqual((await player.state()).adventure.island, fresh);
});

test('island progress, unanswered encounters and new cosmetic selections survive a restart', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'klassenhelden-island-'));
  const dbPath = join(temp, 'save.sqlite'); let first, second;
  try {
    first = await start({ dbPath }); const player = first.client(); await player.login();
    await player.request('/api/island/start', {}); const earned = await progress(player, first.db, 3);
    await player.request('/api/island/bank', packet(earned));
    await player.request('/api/cosmetics/equip', { type: 'companion', id: 'pet-tide' });
    const fresh = (await player.request('/api/island/start', {})).body.island;
    await player.request('/api/island/choice', packet(fresh, { choice: fresh.state.choices[0].id }));
    const before = await player.state(), cookie = player.cookie;
    await first.close(); first = null;
    second = await start({ dbPath });
    const after = await second.client(cookie).state();
    assert.deepEqual(after.adventure.island, before.adventure.island);
    assert.equal(after.user.cosmetics.selected.companion, 'pet-tide');
    assert.deepEqual(after.user.inventory, before.user.inventory);
    assert.equal(after.user.xp, before.user.xp);
    for (const path of ['/island.js', '/island.css']) assert.equal((await fetch(second.origin + path)).status, 200);
  } finally {
    if (first) await first.close();
    if (second) await second.close();
    await rm(temp, { recursive: true, force: true });
  }
});
