import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server.js';
import { ITEMS } from '../lib/items.js';

async function fixture(t) {
  const app = createApp({ dbPath: ':memory:' });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  let cookie = '';
  async function request(path, body) {
    const response = await fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, body: await response.json() };
  }
  async function login() {
    const result = await request('/api/auth/login', {
      email: 'lina@demo.schule', password: 'Klassenhelden!2026',
    });
    assert.equal(result.status, 200);
  }
  return { ...app, origin, request, login };
}

test('3D modules, their relative Three.js dependency and MIT license are served locally', async t => {
  const { origin } = await fixture(t);
  const read = async path => {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    return { headers: response.headers, source: await response.text() };
  };
  const hero = await read('/hero3d.js');
  assert.match(hero.headers.get('content-type'), /javascript/);
  assert.match(hero.source, /['"]\.\/vendor\/three\.module\.min\.js['"]/);
  const renderer = await read('/vendor/three.module.min.js');
  assert.match(renderer.headers.get('content-type'), /javascript/);
  assert.match(renderer.source, /['"]\.\/three\.core\.min\.js['"]/);
  const core = await read('/vendor/three.core.min.js');
  assert.match(core.headers.get('content-type'), /javascript/);
  assert.ok(core.source.length > 100_000, 'The actual Three.js core must be present.');
  const license = await read('/vendor/THREE-LICENSE.txt');
  assert.match(license.headers.get('content-type'), /text\/plain/);
  assert.match(license.source, /Permission is hereby granted/);
  assert.equal((await fetch(origin + '/vendor/not-a-public-file.txt')).status, 404);
});

test('3D equipment visuals reflect owned compatible catalogue items and ignore submitted visual data', async t => {
  const { db, request, login } = await fixture(t);
  await login();
  const weapon = ITEMS.find(item => item.type === 'weapon' && item.rarity === 'rare');
  const helmet = ITEMS.find(item => item.type === 'helmet' && item.rarity === 'common');
  const inventory = {
    potion: 2,
    items: [
      { id: 'sword', templateId: weapon.id, type: 'shield', rarity: 'legendary' },
      { id: 'helmet', templateId: helmet.id },
    ],
  };
  db.prepare('UPDATE users SET inventory = ?, equipment = ? WHERE id = ?')
    .run(JSON.stringify(inventory), JSON.stringify({ helmet: 'sword', ring: 'not-owned' }), 'demo-lina');
  let user = (await request('/api/state')).body.user;
  assert.equal(user.equipmentVisuals.helmet, null, 'Wrong-slot database entries must not become renderable gear.');
  assert.equal(user.equipmentVisuals.ring, null, 'Unowned references must not become renderable gear.');
  assert.equal((await request('/api/equipment', { slot: 'helmet', itemId: null })).status, 200);
  const equipped = await request('/api/equipment', {
    slot: 'hand1', itemId: 'sword',
    equipmentVisuals: { hand1: { type: 'shield', rarity: 'legendary', templateId: 'fake' } },
  });
  assert.equal(equipped.status, 200);
  user = equipped.body.user;
  assert.equal(user.equipmentVisuals.hand1.templateId, weapon.id);
  assert.equal(user.equipmentVisuals.hand1.type, 'weapon');
  assert.equal(user.equipmentVisuals.hand1.rarity, 'rare');
  assert.equal((await request('/api/equipment', { slot: 'helmet', itemId: 'helmet' })).status, 200);
  user = (await request('/api/state')).body.user;
  assert.equal(user.equipmentVisuals.helmet.templateId, helmet.id);
  assert.deepEqual(Object.keys(user.equipmentVisuals).sort(), ['helmet', 'chest', 'hand1', 'hand2', 'necklace', 'ring'].sort());
});

test('a battle retains its 3D equipment snapshot after the item is unequipped and recycled', async t => {
  const { db, request, login } = await fixture(t);
  await login();
  const weapon = ITEMS.find(item => item.type === 'weapon' && item.rarity === 'common');
  db.prepare('UPDATE users SET inventory = ?, equipment = ? WHERE id = ?').run(JSON.stringify({
    potion: 2, items: [
      { id: 'battle-sword', templateId: weapon.id },
      { id: 'spare-sword', templateId: weapon.id },
    ],
  }), '{}', 'demo-lina');
  assert.equal((await request('/api/equipment', { slot: 'hand1', itemId: 'battle-sword' })).status, 200);
  const created = await request('/api/battles', {
    opponentId: 'training-bot', equipmentVisuals: { hand1: { type: 'shield', templateId: 'fake' } },
  });
  assert.equal(created.status, 200);
  const battle = created.body.battle;
  const snapshot = structuredClone(battle.state.fighters.find(fighter => fighter.id === 'demo-lina').equipmentVisuals);
  assert.equal(snapshot.hand1.templateId, weapon.id);
  assert.equal(snapshot.hand1.type, 'weapon');
  assert.equal((await request('/api/equipment', { slot: 'hand1', itemId: null })).status, 200);
  assert.equal((await request('/api/inventory/recycle', { itemId: 'battle-sword' })).status, 200);
  let state = (await request('/api/state')).body;
  assert.equal(state.user.equipmentVisuals.hand1, null);
  assert.ok(!state.user.inventory.items.some(item => item.id === 'battle-sword'));
  let fighter = state.battles.find(value => value.id === battle.id).state.fighters.find(value => value.id === 'demo-lina');
  assert.deepEqual(fighter.equipmentVisuals, snapshot);
  assert.equal((await request(`/api/battles/${battle.id}/actions`, { action: 'attack' })).status, 200);
  state = (await request('/api/state')).body;
  fighter = state.battles.find(value => value.id === battle.id).state.fighters.find(value => value.id === 'demo-lina');
  assert.deepEqual(fighter.equipmentVisuals, snapshot);
});
