import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server.js';
import { openStore, hashPassword, userView } from '../lib/store.js';
import { ITEMS } from '../lib/items.js';

const password = 'Klassenhelden!2026';
const template = (type, rarity = 'common') => ITEMS.find(item => item.type === type && item.rarity === rarity);
const entry = (id, type, rarity) => ({ id, templateId: template(type, rarity).id });
const rejected = response => assert.ok(response.status >= 400 && response.status < 500, JSON.stringify(response));

async function fixture(t, options = {}) {
  const app = createApp({ dbPath: ':memory:', ...options });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  function client() {
    let cookie = '';
    return {
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
        const result = await this.request('/api/auth/login', { email, password });
        assert.equal(result.status, 200, JSON.stringify(result.body));
        return result.body.user;
      },
      async state() {
        const result = await this.request('/api/state');
        assert.equal(result.status, 200, JSON.stringify(result.body));
        return result.body;
      },
    };
  }
  function inventory(userId, changes) {
    const row = app.db.prepare('SELECT inventory FROM users WHERE id = ?').get(userId);
    const value = { ...JSON.parse(row.inventory), ...changes };
    app.db.prepare('UPDATE users SET inventory = ? WHERE id = ?').run(JSON.stringify(value), userId);
  }
  return { ...app, origin, client, inventory };
}

test('only teachers grant chests and all three potion sizes; grants cannot choose loot rarity', async t => {
  const { client } = await fixture(t);
  const student = client();
  const teacher = client();
  await student.login();
  await teacher.login('lehrer@demo.schule');
  const before = (await student.state()).user.inventory;
  assert.equal((await student.request('/api/rewards', { studentId: 'demo-lina', xp: 0, item: 'chest', reason: 'Selbst belohnen' })).status, 403);
  assert.equal((await teacher.request('/api/chests/open', {})).status, 403);
  for (const item of ['chest', 'potionSmall', 'potion', 'potionLarge']) {
    const response = await teacher.request('/api/rewards', { studentId: 'demo-lina', xp: 0, item, reason: 'Hilfreiche Mitarbeit', rarity: 'legendary' });
    assert.equal(response.status, 200, JSON.stringify(response.body));
  }
  const after = await student.state();
  assert.equal(after.user.inventory.chests, before.chests + 1);
  for (const key of ['potionSmall', 'potion', 'potionLarge']) assert.equal(after.user.inventory[key], before[key] + 1);
  assert.deepEqual(after.catalogue.rarities.map(r => r.weight), [60, 28, 10, 2]);
  assert.equal(after.catalogue.slots.length, 6);
  assert.equal(after.catalogue.potions.length, 3);
  assert.ok(after.rewards.some(reward => reward.item === 'chest'));
});

test('opening a chest creates one or two server-selected unique equipment instances and spends one chest', async t => {
  const draws = [1, 0, 1, 0, 99, 1, 0];
  const { client, inventory } = await fixture(t, { lootRandomInt: max => {
    const value = draws.shift();
    assert.ok(value >= 0 && value < max);
    return value;
  } });
  const student = client();
  await student.login();
  inventory('demo-lina', { chests: 1, items: [] });
  const before = (await student.state()).user;
  const result = await student.request('/api/chests/open', { rarity: 'legendary', amount: 200, xp: 9999 });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(draws.length, 0);
  assert.equal(result.body.drops.length, 2);
  assert.deepEqual(result.body.drops.map(drop => drop.rarity), ['common', 'legendary']);
  assert.ok(result.body.drops.every(drop => drop.kind === 'equipment'));
  assert.equal(new Set(result.body.drops.map(drop => drop.id)).size, 2);
  const after = (await student.state()).user;
  assert.equal(after.inventory.chests, 0);
  assert.equal(after.inventory.items.length, 2);
  assert.equal(after.xp, before.xp);
  assert.equal(after.totalXp, before.totalXp);
  assert.equal((await student.request('/api/chests/open', {})).status >= 400, true);
  assert.deepEqual((await student.state()).user, after);
});

test('concurrent chest opens cannot spend the final chest twice and potion drops stack correctly', async t => {
  const { client, inventory } = await fixture(t, { lootRandomInt: () => 0 });
  const student = client();
  await student.login();
  inventory('demo-lina', { chests: 1, potionSmall: 0 });
  const responses = await Promise.all([student.request('/api/chests/open', {}), student.request('/api/chests/open', {})]);
  assert.equal(responses.filter(result => result.status === 200).length, 1);
  rejected(responses.find(result => result.status !== 200));
  const success = responses.find(result => result.status === 200);
  assert.equal(success.body.drops.length, 1);
  assert.equal(success.body.drops[0].kind, 'potion');
  assert.equal(success.body.drops[0].potionId, 'potionSmall');
  const after = (await student.state()).user.inventory;
  assert.equal(after.chests, 0);
  assert.equal(after.potionSmall, 1);
});

test('equipment requires ownership and a matching slot; one instance cannot occupy both hands', async t => {
  const { client, inventory } = await fixture(t);
  const student = client();
  const teacher = client();
  await student.login();
  await teacher.login('lehrer@demo.schule');
  inventory('demo-lina', { items: [entry('sword', 'weapon'), entry('shield', 'shield'), entry('helm', 'helmet')] });
  const base = (await student.state()).user.stats;
  assert.equal((await teacher.request('/api/equipment', { slot: 'helmet', itemId: 'helm' })).status, 403);
  rejected(await student.request('/api/equipment', { slot: 'helmet', itemId: 'not-owned' }));
  rejected(await student.request('/api/equipment', { slot: 'helmet', itemId: 'sword' }));
  rejected(await student.request('/api/equipment', { slot: '__proto__', itemId: 'sword' }));
  assert.equal((await student.request('/api/equipment', { slot: 'hand1', itemId: 'sword', bonuses: { attack: 999 } })).status, 200);
  rejected(await student.request('/api/equipment', { slot: 'hand2', itemId: 'sword' }));
  assert.equal((await student.request('/api/equipment', { slot: 'hand2', itemId: 'shield' })).status, 200);
  assert.equal((await student.request('/api/equipment', { slot: 'helmet', itemId: 'helm' })).status, 200);
  let user = (await student.state()).user;
  assert.equal(user.equipment.hand1, 'sword');
  assert.equal(user.equipment.hand2, 'shield');
  assert.ok(user.stats.attackDamage > base.attackDamage && user.stats.attackDamage < base.attackDamage + 999);
  assert.ok(user.stats.maxHp > base.maxHp);
  assert.ok(user.stats.defense > base.defense);
  assert.equal((await student.request('/api/equipment', { slot: 'hand1', itemId: null })).status, 200);
  user = (await student.state()).user;
  assert.equal(user.equipment.hand1, null);
  assert.equal(user.stats.attackDamage, base.attackDamage);
});

test('duplicate recycling protects equipped and last copies and uses trusted low XP values', async t => {
  const { client, inventory } = await fixture(t);
  const student = client();
  await student.login();
  inventory('demo-lina', { items: [entry('helmet-a', 'helmet'), entry('helmet-b', 'helmet'), entry('helmet-rare', 'helmet', 'rare')] });
  const before = (await student.state()).user;
  assert.equal((await student.request('/api/equipment', { slot: 'helmet', itemId: 'helmet-a' })).status, 200);
  rejected(await student.request('/api/inventory/recycle', { itemId: 'helmet-a' }));
  rejected(await student.request('/api/inventory/recycle', { itemId: 'helmet-rare' }));
  const result = await student.request('/api/inventory/recycle', { itemId: 'helmet-b', xp: 10000, rarity: 'legendary' });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const after = (await student.state()).user;
  assert.equal(after.xp, before.xp + 2);
  assert.equal(after.totalXp, before.totalXp + 2);
  assert.deepEqual(after.inventory.items.map(item => item.id).sort(), ['helmet-a', 'helmet-rare']);
  rejected(await student.request('/api/inventory/recycle', { itemId: 'helmet-b' }));
  await student.request('/api/equipment', { slot: 'helmet', itemId: null });
  rejected(await student.request('/api/inventory/recycle', { itemId: 'helmet-a' }));
  assert.equal((await student.state()).user.xp, after.xp);
});

test('concurrent recycling pays once and never deletes the final duplicate', async t => {
  const { client, inventory } = await fixture(t);
  const student = client();
  await student.login();
  inventory('demo-lina', { items: [entry('ring-a', 'ring', 'legendary'), entry('ring-b', 'ring', 'legendary')] });
  const before = (await student.state()).user;
  const responses = await Promise.all([
    student.request('/api/inventory/recycle', { itemId: 'ring-a' }),
    student.request('/api/inventory/recycle', { itemId: 'ring-a' }),
  ]);
  assert.equal(responses.filter(result => result.status === 200).length, 1);
  rejected(responses.find(result => result.status !== 200));
  const after = (await student.state()).user;
  assert.equal(after.xp, before.xp + 10);
  assert.equal(after.totalXp, before.totalXp + 10);
  assert.deepEqual(after.inventory.items.map(item => item.id), ['ring-b']);
});

test('appearance is persisted and validated without granting client-submitted combat bonuses', async t => {
  const { client } = await fixture(t);
  const student = client();
  await student.login();
  const before = (await student.state()).user;
  const appearance = { color: 'mint', outfit: 'knight', emblem: 'moon' };
  const result = await student.request('/api/character', {
    characterName: 'Runenfuchs', avatar: 'dragon', appearance, stats: { maxHp: 99999 }, xp: 99999,
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const after = (await student.state()).user;
  assert.deepEqual(after.appearance, appearance);
  assert.equal(after.characterName, 'Runenfuchs');
  assert.deepEqual(after.stats, before.stats);
  assert.equal(after.xp, before.xp);
  for (const invalid of [{ ...appearance, color: '<script>' }, { ...appearance, outfit: 'admin' }, { ...appearance, emblem: 'unknown' }, []]) {
    rejected(await student.request('/api/character', { characterName: 'Runenfuchs', avatar: 'dragon', appearance: invalid }));
  }
  assert.deepEqual((await student.state()).user.appearance, appearance);
});

test('battle snapshots retain equipped bonuses and appearance after later character changes', async t => {
  const { client, inventory } = await fixture(t);
  const student = client();
  await student.login();
  inventory('demo-lina', { items: [entry('weapon', 'weapon', 'epic'), entry('helmet', 'helmet', 'epic')] });
  await student.request('/api/equipment', { slot: 'hand1', itemId: 'weapon' });
  await student.request('/api/equipment', { slot: 'helmet', itemId: 'helmet' });
  const before = (await student.state()).user;
  const started = await student.request('/api/battles', { opponentId: 'training-bot' });
  assert.equal(started.status, 200);
  const battle = started.body.battle;
  const fighter = battle.state.fighters.find(value => value.id === before.id);
  assert.deepEqual(fighter.stats, before.stats);
  assert.equal(fighter.maxHp, before.stats.maxHp);
  await student.request('/api/equipment', { slot: 'hand1', itemId: null });
  await student.request('/api/equipment', { slot: 'helmet', itemId: null });
  await student.request('/api/character', { characterName: 'Anderer Held', avatar: 'cat', appearance: { color: 'rose', outfit: 'scholar', emblem: 'leaf' } });
  const next = await student.request(`/api/battles/${battle.id}/actions`, { action: 'attack' });
  assert.equal(next.status, 200, JSON.stringify(next.body));
  const current = next.body.battle.state;
  assert.deepEqual(current.fighters.find(value => value.id === before.id).stats, fighter.stats);
  assert.deepEqual(current.fighters.find(value => value.id === before.id).appearance, before.appearance);
  assert.equal(current.fighters.find(value => value.id === before.id).avatar, before.avatar);
  assert.equal(current.events.length, 2);
  assert.deepEqual(current.events.map(event => event.id), [1, 2]);
  assert.equal(current.events[0].damage, before.stats.attackDamage);
  assert.equal(current.events[0].actorId, before.id);
  assert.equal(current.events[1].actorId, 'training-bot');
});

test('small and large potions consume their matching stocks through the battle API', async t => {
  const { client, inventory } = await fixture(t);
  const student = client();
  await student.login();
  inventory('demo-lina', { potionSmall: 1, potionLarge: 1 });
  const before = (await student.state()).user.inventory;
  const started = await student.request('/api/battles', { opponentId: 'training-bot' });
  const actions = `/api/battles/${started.body.battle.id}/actions`;
  rejected(await student.request(actions, { action: 'potionLarge' }));
  await student.request(actions, { action: 'attack' });
  const small = await student.request(actions, { action: 'potionSmall' });
  assert.equal(small.status, 200, JSON.stringify(small.body));
  const firstEvent = small.body.battle.state.events.find(event => event.action === 'potionSmall');
  assert.ok(firstEvent.healing > 0 && firstEvent.healing <= 20);
  const large = await student.request(actions, { action: 'potionLarge' });
  assert.equal(large.status, 200, JSON.stringify(large.body));
  const largeEvent = large.body.battle.state.events.find(event => event.action === 'potionLarge');
  assert.ok(largeEvent.healing > 0 && largeEvent.healing <= 60);
  const after = (await student.state()).user.inventory;
  assert.equal(after.potionSmall, before.potionSmall - 1);
  assert.equal(after.potionLarge, before.potionLarge - 1);
  assert.equal(after.potion, before.potion);
  rejected(await student.request(actions, { action: 'potionLarge' }));
});

test('existing databases migrate without losing progress or fights and demo loot is granted only once', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'klassenhelden-legacy-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'old.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`CREATE TABLE users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL, role TEXT NOT NULL, school_id TEXT NOT NULL DEFAULT 'campus-demo',
    character_name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT 'fox',
    xp INTEGER NOT NULL DEFAULT 0, total_xp INTEGER NOT NULL DEFAULT 0,
    skills TEXT NOT NULL DEFAULT '{"strength":1,"focus":1,"endurance":1}',
    inventory TEXT NOT NULL DEFAULT '{"potion":0}', created_at TEXT NOT NULL);
    CREATE TABLE battles (id TEXT PRIMARY KEY, type TEXT NOT NULL, challenger_id TEXT NOT NULL,
      opponent_id TEXT NOT NULL, status TEXT NOT NULL, state TEXT, created_at TEXT NOT NULL);`);
  legacy.prepare(`INSERT INTO users (id,name,email,password_hash,role,character_name,xp,total_xp,skills,inventory,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run('legacy-student', 'Alter Spielstand', 'legacy@example.test', hashPassword(password),
      'student', 'Treuer Fuchs', 137, 237, JSON.stringify({ strength: 2, focus: 3, endurance: 1 }), '{"potion":4}', '2026-01-01');
  const oldBattle = { fighters: [{ id: 'legacy-student', hp: 37, maxHp: 92 }, { id: 'training-bot', hp: 40, maxHp: 92 }],
    turnId: 'legacy-student', status: 'active', round: 3, turns: 4, winnerId: null, log: ['Alter Kampf'] };
  legacy.prepare('INSERT INTO battles VALUES (?,?,?,?,?,?,?)').run('old-fight', 'training', 'legacy-student', 'training-bot', 'active', JSON.stringify(oldBattle), '2026-01-01');
  legacy.close();
  let db = openStore(path);
  try {
    const user = userView(db.prepare('SELECT * FROM users WHERE id = ?').get('legacy-student'));
    assert.equal(user.xp, 137);
    assert.equal(user.totalXp, 237);
    assert.equal(user.inventory.potion, 4);
    assert.deepEqual(user.skills, { strength: 2, focus: 3, endurance: 1 });
    assert.equal(Object.keys(user.equipment).length, 6);
    assert.deepEqual(JSON.parse(db.prepare('SELECT state FROM battles WHERE id = ?').get('old-fight').state), oldBattle);
    const demo = JSON.parse(db.prepare('SELECT inventory FROM users WHERE id = ?').get('demo-lina').inventory);
    assert.equal(demo.chests, 2);
    assert.ok(demo.items.length >= 4);
    demo.chests = 0;
    db.prepare('UPDATE users SET inventory = ? WHERE id = ?').run(JSON.stringify(demo), 'demo-lina');
    db.close();
    db = openStore(path);
    const reopened = JSON.parse(db.prepare('SELECT inventory FROM users WHERE id = ?').get('demo-lina').inventory);
    assert.equal(reopened.chests, 0);
    assert.deepEqual(reopened.items, demo.items);
    assert.equal(db.prepare('SELECT xp FROM users WHERE id = ?').get('legacy-student').xp, 137);
  } finally { db.close(); }
});
