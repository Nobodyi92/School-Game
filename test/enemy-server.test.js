import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server.js';
import { createBattleState, getCombatStats } from '../lib/combat.js';
import { createTower, createRaid } from '../lib/adventures.js';
import { createIsland, chooseIsland } from '../lib/island.js';
import { NPC_TYPES } from '../shared/enemies.js';

const password = 'Klassenhelden!2026';
const ok = response => { assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body; };

async function fixture(t) {
  const app = createApp({ dbPath: ':memory:' });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
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
  return { ...app, origin, client };
}

const mechanical = fighter => Object.fromEntries([
  'id', 'hp', 'maxHp', 'stats', 'skills', 'attackDamage', 'energy', 'maxEnergy', 'effects',
  'focusCooldown', 'guarding', 'tacticsVersion', 'abilityLoadout',
].filter(key => Object.hasOwn(fighter, key)).map(key => [key, fighter[key]]));
const progress = state => Object.fromEntries([
  'turnId', 'turns', 'round', 'floor', 'cleared', 'totalTurns', 'version', 'status', 'phase', 'fragments',
].filter(key => Object.hasOwn(state, key)).map(key => [key, state[key]]));
function removeVisual(fighter, avatar, name) {
  delete fighter.npcType; delete fighter.npcVariant;
  fighter.avatar = avatar;
  if (name) { fighter.name = name; fighter.characterName = name; }
  return fighter;
}

test('new training fights serialize a human practice opponent with a modest independent difficulty increase', async t => {
  const f = await fixture(t), student = f.client();
  const player = await student.login();
  const before = await student.state();
  const battle = ok(await student.request('/api/battles', { opponentId: 'training-bot', npcType: 'dark-mage',
    stats: { attackDamage: 99999 }, enemyHp: 1 })).battle;
  const trainer = battle.state.fighters.find(fighter => fighter.id === 'training-bot');
  const own = battle.state.fighters.find(fighter => fighter.id === player.id);
  const baseline = getCombatStats({ skills: { strength: 1, focus: 1, endurance: 1 } });
  assert.equal(trainer.npcType, 'training-warden');
  assert.equal(trainer.avatar, 'npc-training-warden');
  assert.equal(trainer.hp, trainer.maxHp);
  assert.ok(trainer.maxHp > baseline.maxHp && trainer.maxHp <= baseline.maxHp * 1.3);
  assert.ok(trainer.stats.attackDamage > baseline.attackDamage && trainer.stats.attackDamage <= baseline.attackDamage * 1.3);
  assert.ok(trainer.stats.focusDamage > baseline.focusDamage && trainer.stats.focusDamage <= baseline.focusDamage * 1.3);
  assert.equal(own.npcType, undefined);
  assert.equal(own.ancestry, player.ancestry);
  assert.deepEqual(own.stats, player.stats);
  const after = await student.state();
  assert.deepEqual(after.user, before.user, 'Starting a tougher practice fight must not spend rewards or change the player.');
  assert.deepEqual(after.battles.find(entry => entry.id === battle.id).state.fighters, battle.state.fighters);
});

test('reading saved animal opponents changes only their presentation and never writes or rebalances a running fight', async t => {
  const f = await fixture(t), student = f.client();
  const player = await student.login();
  const stamp = '2026-01-01T00:00:00.000Z';
  const duel = createBattleState(player, { id: 'training-bot', avatar: 'dragon', skills: { strength: 1, focus: 1, endurance: 1 } });
  const bot = removeVisual(duel.fighters[1], 'dragon', 'Trainingswächter');
  bot.hp = 42; bot.maxHp = 92; bot.stats = getCombatStats({ skills: { strength: 1, focus: 1, endurance: 1 } });
  bot.energy = 1; bot.effects = { weakened: { turns: 1, potency: .25 } };
  duel.round = 3; duel.turns = 4;
  f.db.prepare('INSERT INTO battles VALUES(?,?,?,?,?,?,?)').run('legacy-enemy-battle', 'training', player.id,
    'training-bot', 'active', JSON.stringify(duel), stamp);

  const tower = createTower(player);
  tower.floor = 8; tower.cleared = 7; tower.totalTurns = 19;
  removeVisual(tower.enemy, 'cat', 'Nebelpfote · Ebene 8');
  tower.enemy.hp = 17; tower.enemy.maxHp = 104; tower.enemy.attackDamage = 18;
  tower.enemy.stats = { maxHp: 104, attackDamage: 18, defense: 1 };
  f.db.prepare('INSERT INTO tower_runs VALUES(?,?,?,?)').run(player.id, 'legacy-enemy-tower', JSON.stringify(tower), stamp);

  let island = createIsland(player, max => max - 1);
  const combat = island.choices.find(choice => choice.kind === 'combat');
  assert.ok(combat);
  island = chooseIsland(island, combat.id, () => 0);
  island.cleared = 4; island.current.title = 'Dornenpfad'; island.version = 11;
  removeVisual(island.enemy, 'owl', 'Kristallwächter');
  island.enemy.hp = 21; island.enemy.maxHp = 64; island.enemy.attackDamage = 11;
  f.db.prepare('INSERT INTO island_runs VALUES(?,?,?,?)').run(player.id, 'legacy-enemy-island', JSON.stringify(island), stamp);

  const raw = {
    battle: f.db.prepare('SELECT state FROM battles WHERE id=?').get('legacy-enemy-battle').state,
    tower: f.db.prepare('SELECT state FROM tower_runs WHERE user_id=?').get(player.id).state,
    island: f.db.prepare('SELECT state FROM island_runs WHERE user_id=?').get(player.id).state,
  };
  for (let read = 0; read < 2; read++) {
    const state = await student.state();
    const visibleDuel = state.battles.find(entry => entry.id === 'legacy-enemy-battle').state;
    const visibleTower = state.adventure.tower.state, visibleIsland = state.adventure.island.state;
    assert.equal(visibleDuel.fighters[1].npcType, 'training-warden');
    assert.equal(visibleTower.enemy.npcType, 'mage');
    assert.equal(visibleIsland.enemy.npcType, 'bandit');
    assert.deepEqual(mechanical(visibleDuel.fighters[1]), mechanical(bot));
    assert.deepEqual(mechanical(visibleTower.enemy), mechanical(tower.enemy));
    assert.deepEqual(mechanical(visibleIsland.enemy), mechanical(island.enemy));
    assert.deepEqual(progress(visibleDuel), progress(duel));
    assert.deepEqual(progress(visibleTower), progress(tower));
    assert.deepEqual(progress(visibleIsland), progress(island));
    assert.deepEqual(visibleDuel.fighters[0], duel.fighters[0]);
    assert.deepEqual(visibleTower.player, tower.player);
    assert.deepEqual(visibleIsland.player, island.player);
  }
  assert.equal(f.db.prepare('SELECT state FROM battles WHERE id=?').get('legacy-enemy-battle').state, raw.battle);
  assert.equal(f.db.prepare('SELECT state FROM tower_runs WHERE user_id=?').get(player.id).state, raw.tower);
  assert.equal(f.db.prepare('SELECT state FROM island_runs WHERE user_id=?').get(player.id).state, raw.island);

  island.cleared = 6; island.current.kind = 'guardian'; island.current.title = 'Das Herz der Insel';
  removeVisual(island.enemy, 'dragon', 'Gezeitenwächter');
  island.enemy.guardian = true;
  const guardianRaw = JSON.stringify(island);
  f.db.prepare('UPDATE island_runs SET state=? WHERE user_id=?').run(guardianRaw, player.id);
  const guardian = (await student.state()).adventure.island.state.enemy;
  assert.equal(guardian.npcType, 'tide-guardian');
  assert.deepEqual(mechanical(guardian), mechanical(island.enemy));
  assert.equal(f.db.prepare('SELECT state FROM island_runs WHERE user_id=?').get(player.id).state, guardianRaw);
});

test('human opponent presentation never turns PvP players or the Runengolem into ordinary NPCs', async t => {
  const f = await fixture(t), lina = f.client(), ben = f.client(), third = f.client();
  const player = await lina.login(), opponent = await ben.login('ben@demo.schule');
  ok(await ben.request('/api/character', { characterName: 'Banditenspäher', ancestry: opponent.ancestry,
    npcType: 'bandit', npcVariant: 'captain', avatar: 'npc-bandit' }));
  const invite = ok(await lina.request('/api/battles', { opponentId: opponent.id })).battle;
  const accepted = ok(await ben.request(`/api/battles/${invite.id}/respond`, { accept: true })).battle;
  assert.ok(accepted.state.fighters.every(fighter => fighter.npcType === undefined));
  assert.equal(accepted.state.fighters.find(fighter => fighter.id === opponent.id).ancestry, opponent.ancestry);
  assert.deepEqual(accepted.state.fighters.find(fighter => fighter.id === opponent.id).stats, opponent.stats);

  const recruit = ok(await third.request('/api/auth/register', { name: 'Nora Beispiel', email: 'enemy-party@example.test',
    password, characterName: 'Runenlicht', ancestry: 'aether-druid' })).user;
  const raid = createRaid([player, opponent, recruit]);
  const stamp = '2026-01-01T00:00:00.000Z';
  f.db.prepare('INSERT INTO raids VALUES(?,?,?,?,?,?,?)').run('enemy-golem', 'campus-demo', player.id, 'active',
    JSON.stringify(raid), stamp, stamp);
  const visible = (await lina.state()).adventure.raids.find(entry => entry.id === 'enemy-golem').state;
  assert.equal(visible.boss.avatar, 'golem');
  assert.equal(visible.boss.npcType, undefined);
  assert.deepEqual(visible.boss, raid.boss);
  assert.deepEqual(visible.members, raid.members);
});

test('all humanoid opponent assets are local and their SVG portraits escape labels', async t => {
  const f = await fixture(t);
  for (const path of ['/enemy3d.js', '/enemy-portraits.js', '/enemy-portraits.css', '/shared/enemies.js']) {
    const response = await fetch(f.origin + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), path.endsWith('.css') ? /text\/css/ : /javascript/);
    assert.ok((await response.text()).length > 100);
  }
  const { enemyPortrait } = await import('../public/enemy-portraits.js');
  for (const npcType of NPC_TYPES) {
    const portrait = enemyPortrait({ id: 'test-npc', npcType, name: '<img src=x onerror=alert(1)>', npcVariant: 'untrusted' });
    assert.match(portrait, /<svg\b/);
    assert.match(portrait, new RegExp(`data-npc-type="${npcType}"`));
    assert.doesNotMatch(portrait, /<img\b|<script\b|["']\s+onerror\s*=/);
  }
  assert.equal(enemyPortrait({ id: 'normal-player', ancestry: 'aether-elf', npcType: 'bandit' }), '');
  assert.equal(enemyPortrait({ id: 'rune-golem', avatar: 'golem' }), '');
});
