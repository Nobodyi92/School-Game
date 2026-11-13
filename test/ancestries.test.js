import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ANCESTRIES, skillsFor, progressFor } from '../shared/ancestries.js';
import { createApp } from '../server.js';
import { openStore, userView } from '../lib/store.js';
import { getCombatStats, createBattleState, applyAction } from '../lib/combat.js';

const password = 'Klassenhelden!2026';
async function fixture(t) {
  const app = createApp({ dbPath: ':memory:' });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (path, body) => {
      const response = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return { status: response.status, body: await response.json() };
    };
  };
  const request = client();
  assert.equal((await request('/api/auth/login', { email: 'lina@demo.schule', password })).status, 200);
  return { ...app, origin, request, client };
}
const ok = response => { assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body; };
const learned = user => Object.fromEntries(Object.entries(user.skillProgress).map(([key, value]) => [key, value.trained]));
const economy = user => ({ xp: user.xp, totalXp: user.totalXp, inventory: user.inventory, equipment: user.equipment, cosmetics: user.cosmetics });

test('all six peoples have equal starting budgets and different real combat strengths', () => {
  const stats = Object.fromEntries(ANCESTRIES.map(people => {
    assert.equal(Object.values(people.skills).reduce((sum, value) => sum + value, 0), 6);
    return [people.id, getCombatStats({ skills: skillsFor(people.id) })];
  }));
  assert.equal(Object.keys(stats).length, 6);
  assert.equal(stats['aether-elf'].focusDamage, 36);
  assert.equal(stats['aether-dusk'].attackDamage, 26);
  assert.ok(stats['aether-druid'].focusDamage > stats['aether-engineer'].focusDamage);
  assert.ok(stats['aether-engineer'].attackDamage > stats['aether-druid'].attackDamage);
  assert.ok(stats['cloud-warden'].maxHp > stats['aether-dusk'].maxHp);
  assert.ok(stats['aether-druid'].guardHealing > stats['aether-elf'].guardHealing);
  for (const people of ANCESTRIES) {
    const player = { id: 'player', ancestry: people.id, skills: skillsFor(people.id) };
    for (const [action, stat] of [['attack', 'attackDamage'], ['focus', 'focusDamage']]) {
      const battle = createBattleState(player, { id: 'target', skills: { endurance: 10 } });
      const result = applyAction(battle, 'player', action).state;
      assert.equal(result.events.at(-1).damage, stats[people.id][stat]);
      assert.equal(result.fighters[0].ancestry, people.id);
    }
  }
});

test('registration chooses server-owned ancestry skills and rejects unavailable peoples', async t => {
  const { client, origin } = await fixture(t);
  for (const people of ANCESTRIES) {
    const request = client();
    const user = ok(await request('/api/auth/register', {
      name: 'Neuer Held', characterName: 'Himmelslicht', email: `${people.id}@example.test`, password,
      ancestry: people.id, skills: { strength: 10, focus: 10, endurance: 10 },
      skill_upgrades: { strength: 9 }, skillProgress: { focus: { trained: 9 } }, xp: 999, role: 'teacher',
    })).user;
    assert.equal(user.ancestry, people.id);
    assert.equal(user.avatar, people.id);
    assert.deepEqual(user.skills, people.skills);
    assert.deepEqual(learned(user), { strength: 0, focus: 0, endurance: 0 });
    assert.equal(user.xp, 0);
    assert.equal(user.role, 'student');
  }
  for (const ancestry of ['fox', 'golem', '__proto__', {}, null]) {
    // null means the optional choice is absent and receives the balanced default.
    const result = await client()('/api/auth/register', { name: 'Neuer Held', characterName: 'Windlicht',
      email: `invalid-${typeof ancestry}-${String(ancestry)}@example.test`, password, ancestry });
    if (ancestry === null) assert.equal(ok(result).user.ancestry, 'sky-nomad');
    else assert.equal(result.status, 400);
  }
  const response = await fetch(origin + '/ancestries.js');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(origin + '/shared/ancestries.js')).status, 404);
});

test('switching peoples preserves the economy and learned levels without changing upgrade prices', async t => {
  const { request } = await fixture(t);
  const before = ok(await request('/api/state')).user;
  const first = ok(await request('/api/skills/upgrade', { skill: 'focus' })).user;
  assert.equal(first.xp, before.xp - before.skillProgress.focus.cost);
  assert.equal(first.skillProgress.focus.trained, before.skillProgress.focus.trained + 1);
  for (const people of [...ANCESTRIES, ANCESTRIES[0]]) {
    const user = ok(await request('/api/character', { characterName: before.characterName, ancestry: people.id,
      xp: 9999, skills: { strength: 10 }, skill_upgrades: { strength: 9 } })).user;
    assert.deepEqual(economy(user), economy(first));
    assert.deepEqual(learned(user), learned(first));
    assert.deepEqual(user.skills, skillsFor(people.id, learned(first)));
    assert.equal(user.skillProgress.focus.cost, first.skillProgress.focus.cost);
  }
  assert.equal((await request('/api/character', { characterName: 'Tierheld', ancestry: 'fox' })).status, 400);
  const upgraded = ok(await request('/api/skills/upgrade', { skill: 'strength' })).user;
  assert.equal(upgraded.xp, first.xp - first.skillProgress.strength.cost);
  assert.equal(upgraded.totalXp, first.totalXp);
});

test('levels above a new ancestry cap are retained and restored without paying or minting XP', async t => {
  const { db, request } = await fixture(t);
  const training = { strength: 9, focus: 8, endurance: 1 };
  db.prepare('UPDATE users SET ancestry = ?, avatar = ?, skills = ?, skill_upgrades = ? WHERE id = ?')
    .run('aether-elf', 'aether-elf', JSON.stringify(skillsFor('aether-elf', training)), JSON.stringify(training), 'demo-lina');
  const before = ok(await request('/api/state')).user;
  const dusk = ok(await request('/api/character', { characterName: before.characterName, ancestry: 'aether-dusk' })).user;
  assert.equal(dusk.skills.strength, 10);
  assert.equal(dusk.skillProgress.strength.reserve, 3);
  assert.equal(dusk.skills.focus, 9);
  assert.equal(dusk.skillProgress.focus.reserve, 0);
  assert.equal((await request('/api/skills/upgrade', { skill: 'strength' })).status, 400);
  const back = ok(await request('/api/character', { characterName: before.characterName, ancestry: 'aether-elf' })).user;
  assert.deepEqual(back, before);
  assert.equal(progressFor('aether-druid', training).strength.cost, progressFor('aether-dusk', training).strength.cost);
});

test('duels, the tower, island and raid keep their ancestry and stats after a profile switch', async t => {
  const { request, client } = await fixture(t);
  const before = ok(await request('/api/state')).user;
  const battle = ok(await request('/api/battles', { opponentId: 'training-bot' })).battle;
  ok(await request('/api/tower/start', {}));
  ok(await request('/api/island/start', {}));
  const raid = ok(await request('/api/raids', {})).raid;
  const ben = client();
  ok(await ben('/api/auth/login', { email: 'ben@demo.schule', password }));
  ok(await ben(`/api/raids/${raid.id}/join`, {}));
  const third = client();
  ok(await third('/api/auth/register', { name: 'Dritter Held', email: 'third@example.test', password, characterName: 'Windlicht' }));
  ok(await third(`/api/raids/${raid.id}/join`, {}));
  ok(await request(`/api/raids/${raid.id}/start`, {}));
  ok(await request('/api/character', { characterName: 'Wüstenlicht', ancestry: 'aether-dusk' }));
  const state = ok(await request('/api/state'));
  const snapshots = [state.battles.find(value => value.id === battle.id).state.fighters.find(value => value.id === before.id),
    state.adventure.tower.state.player, state.adventure.island.state.player,
    state.adventure.raids.find(value => value.id === raid.id).state.members.find(value => value.id === before.id)];
  for (const snapshot of snapshots) {
    assert.equal(snapshot.ancestry, before.ancestry);
    assert.equal(snapshot.avatar, before.avatar);
    assert.deepEqual(snapshot.stats, before.stats);
    assert.deepEqual(snapshot.equipmentVisuals, before.equipmentVisuals);
    assert.deepEqual(snapshot.cosmetics, before.cosmetics);
  }
  assert.equal(state.user.ancestry, 'aether-dusk');
});

test('legacy animals migrate once with purchased levels, names, gear, cosmetics and encounter stats intact', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'aetheria-migration-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'game.sqlite');
  let db = openStore(path);
  const mappings = { fox: 'sky-nomad', owl: 'aether-elf', dragon: 'aether-druid', cat: 'aether-dusk' };
  const oldSkills = { strength: 5, focus: 10, endurance: 3 };
  for (const animal of Object.keys(mappings)) {
    db.prepare(`INSERT INTO users (id,name,email,password_hash,role,character_name,avatar,xp,total_xp,skills,inventory,equipment,appearance,created_at)
      VALUES (?,?,?,'unused','student',?,?,731,873,?,?,?,?,'2026-01-01')`)
      .run(animal, 'Alter Held', `${animal}@example.test`, `Mein ${animal}`, animal, JSON.stringify(oldSkills),
        JSON.stringify({ chests: 3, potion: 4, items: [{ id: 'sword', templateId: 'weapon-sun-common' }] }),
        JSON.stringify({ hand1: 'sword' }), JSON.stringify({ color: 'mint', outfit: 'scholar', emblem: 'leaf' }));
    db.prepare('INSERT INTO cosmetic_unlocks VALUES (?,?,?)').run(animal, 'pet-firefly', '2026-01-01');
    db.prepare('UPDATE users SET cosmetic_loadout = ? WHERE id = ?').run('{"companion":"pet-firefly"}', animal);
  }
  const fighter = { id: 'fox', avatar: 'fox', hp: 37, maxHp: 116, skills: oldSkills,
    stats: getCombatStats({ skills: oldSkills }), equipmentVisuals: { hand1: { type: 'weapon', rarity: 'common', templateId: 'weapon-sun-common' } } };
  db.prepare('INSERT INTO battles VALUES (?,?,?,?,?,?,?)').run('old-battle', 'training', 'fox', 'training-bot', 'active',
    JSON.stringify({ fighters: [fighter, { id: 'training-bot', avatar: 'dragon', hp: 42 }], turnId: 'fox', round: 3 }), '2026-01-01');
  for (const table of ['tower_runs', 'island_runs']) {
    db.prepare(`INSERT INTO ${table} VALUES (?,?,?,?)`).run('fox', table, JSON.stringify({ player: fighter, status: 'active' }), '2026-01-01');
  }
  db.prepare('INSERT INTO raids VALUES (?,?,?,?,?,?,?)').run('old-raid', 'campus-demo', 'fox', 'active', JSON.stringify({ members: [fighter] }), '2026-01-01', '2026-01-01');
  const previous = Object.keys(mappings).map(id => userView(db.prepare('SELECT * FROM users WHERE id = ?').get(id), { db }));
  db.close();
  db = openStore(path, { demo: false });
  const migrated = Object.entries(mappings).map(([animal, ancestry], index) => {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(animal);
    const user = userView(row, { db });
    assert.equal(user.ancestry, ancestry);
    assert.equal(user.characterName, `Mein ${animal}`);
    assert.deepEqual(economy(user), economy(previous[index]));
    assert.deepEqual(user.appearance, previous[index].appearance);
    assert.deepEqual(learned(user), { strength: 4, focus: 9, endurance: 2 });
    assert.deepEqual(user.skills, skillsFor(ancestry, learned(user)));
    return row;
  });
  for (const table of ['battles', 'tower_runs', 'island_runs', 'raids']) {
    const state = JSON.parse(db.prepare(`SELECT state FROM ${table}`).get().state);
    const snapshot = table === 'battles' ? state.fighters[0] : table === 'raids' ? state.members[0] : state.player;
    assert.deepEqual(snapshot, { ...fighter, ancestry: 'sky-nomad', avatar: 'sky-nomad' });
    if (table === 'battles') assert.equal(state.fighters[1].avatar, 'dragon');
  }
  db.close();
  db = openStore(path, { demo: false });
  try {
    for (const row of migrated) assert.deepEqual(db.prepare('SELECT * FROM users WHERE id = ?').get(row.id), row);
  } finally { db.close(); }
});
