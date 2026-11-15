import test from 'node:test';
import assert from 'node:assert/strict';
import { NPC_TYPES, npcDescriptor, npcNameFor, enemyVisualFor } from '../shared/enemies.js';
import { createTower, applyTowerAction, applyTowerChoice, createRaid, submitRaidAction } from '../lib/adventures.js';
import { createIsland, chooseIsland, actOnIsland } from '../lib/island.js';

const hero = (strength = 1) => ({ id: 'hero', name: 'Lina', characterName: 'Sternenlicht',
  ancestry: 'sky-nomad', skills: { strength, focus: strength, endurance: strength },
  inventory: { items: [] }, equipment: {}, level: 5 });
const zero = () => 0;
const seeded = seed => max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
function winFloor(run) {
  let next = run;
  for (let turn = 0; next.status === 'active' && turn < 50; turn++) {
    next = applyTowerAction(next, next.player.focusCooldown === 0 && next.player.energy >= 2 ? 'focus' : 'attack');
  }
  return next;
}
function enter(run, kind, title, step = 1) {
  return chooseIsland({ ...run, cleared: step - 1, phase: 'route', choices: [
    { id: `path-${step}-0`, kind, title, description: 'Ein Weg im Ätherstrom.' },
  ] }, `path-${step}-0`, zero);
}

test('enemy visuals only accept catalogue NPCs and leave players, golems and input snapshots unchanged', () => {
  assert.equal(NPC_TYPES.length, 5);
  for (const type of NPC_TYPES) {
    const visual = npcDescriptor(type, 'untrusted-variant');
    assert.ok(visual.npcVariant);
    assert.equal(visual.avatar, `npc-${type}`);
    assert.ok(npcNameFor(type, visual.npcVariant));
  }
  assert.equal(npcDescriptor('__proto__', 'scout'), null);
  const old = { id: 'tower-enemy', avatar: 'owl', hp: 19, maxHp: 48, attackDamage: 8,
    characterName: 'Runenhüter · Ebene 8', stats: { defense: 0 } };
  const before = structuredClone(old);
  assert.equal(enemyVisualFor(old).npcType, 'mage');
  assert.deepEqual(old, before);
  for (const player of [hero(), { id: 'old-player', avatar: 'fox' }, { id: 'rune-golem', avatar: 'golem' },
    { id: 'hero', ancestry: 'aether-elf', npcType: 'bandit' }, { id: 'tower-enemy', role: 'student' }]) {
    assert.equal(enemyVisualFor(player, { kind: 'tower', floor: 8 }), null);
  }
});

test('the lower five tower rooms have bandits and the upper five have humanoid mages', () => {
  let run = createTower(hero(10));
  for (let floor = 1; floor <= 10; floor++) {
    assert.equal(run.floor, floor);
    assert.equal(run.enemy.npcType, floor <= 5 ? 'bandit' : 'mage');
    assert.equal(run.enemy.avatar, floor <= 5 ? 'npc-bandit' : 'npc-mage');
    assert.match(run.enemy.name, floor <= 5 ? /Bandit/ : /magier|Magier/);
    const oldHp = 40 + floor * 8, oldAttack = 6 + Math.ceil(floor * 1.4);
    assert.equal(run.enemy.maxHp, Math.round(oldHp * 1.12));
    assert.equal(run.enemy.attackDamage, Math.round(oldAttack * 1.1));
    assert.equal(run.enemy.stats.defense, Math.floor((floor - 1) / 4));
    run = winFloor(run);
    assert.equal(run.cleared, floor, 'A fully trained hero can still clear the entire tower.');
    if (floor < 10) run = applyTowerChoice(run, 'power');
  }
  assert.equal(run.status, 'completed');
});

test('actual island locations select bandits or dark mages, while the guardian has its own humanoid look', () => {
  const run = createIsland(hero(), zero);
  for (const [title, type] of [['Kristallhöhle', 'dark-mage'], ['Dornenpfad', 'bandit']]) {
    for (const step of [1, 3, 6]) {
      const next = enter(run, 'combat', title, step);
      assert.equal(next.enemy.npcType, type);
      assert.equal(next.enemy.avatar, `npc-${type}`);
      assert.equal(next.enemy.maxHp, Math.round((34 + step * 6) * 1.12));
      assert.equal(next.enemy.attackDamage, Math.round((6 + step) * 1.1));
    }
  }
  const final = enter(run, 'guardian', 'Das Herz der Insel', 7);
  assert.equal(final.enemy.npcType, 'tide-guardian');
  assert.equal(final.enemy.avatar, 'npc-tide-guardian');
  assert.equal(final.enemy.name, 'Gezeitenwächter');
  assert.equal(final.enemy.maxHp, 99);
  assert.equal(final.enemy.attackDamage, 14);
  assert.equal(final.enemy.phase, 'watch');
});

test('old saved attempts keep their original balance for current and later encounters', () => {
  const tower = createTower(hero());
  delete tower.enemyBalanceVersion;
  tower.status = 'choice'; tower.cleared = 1;
  Object.assign(tower.enemy, { hp: 11, maxHp: 48, attackDamage: 8 });
  const before = structuredClone(tower);
  const next = applyTowerChoice(tower, 'vigor');
  assert.deepEqual(tower, before);
  assert.equal(next.enemy.maxHp, 56);
  assert.equal(next.enemy.attackDamage, 9);
  assert.equal(next.enemyBalanceVersion, undefined);
  const island = createIsland(hero(), zero);
  delete island.enemyBalanceVersion;
  const old = enter(island, 'combat', 'Kristallhöhle');
  assert.equal(old.enemy.maxHp, 40);
  assert.equal(old.enemy.attackDamage, 7);
  const saved = structuredClone(old);
  const moved = actOnIsland(old, 'guard', zero);
  assert.deepEqual(old, saved);
  assert.equal(moved.enemy.maxHp, 40);
  assert.equal(moved.enemy.attackDamage, 7);
});

test('the first companion remains reachable for a basic hero despite the moderate increase', () => {
  const account = hero(), before = structuredClone(account);
  let run = winFloor(createTower(account));
  assert.equal(run.status, 'choice');
  run = winFloor(applyTowerChoice(run, 'vigor'));
  assert.equal(run.status, 'choice');
  assert.ok(run.player.hp > 0);
  const banked = applyTowerChoice(run, 'bank');
  assert.ok(banked.pendingRewards.includes('pet-firefly'));
  assert.deepEqual(account, before);
});

test('new group bosses get modest health and damage increases while saved raids keep their earlier values', () => {
  const players = ['one', 'two', 'three'].map(id => ({ ...hero(4), id }));
  const fresh = createRaid(players);
  assert.equal(fresh.boss.maxHp, 347);
  assert.equal(fresh.boss.hp, 347);
  assert.equal(fresh.enemyBalanceVersion, 1);
  assert.equal(fresh.boss.phase, 'armor');
  const saved = structuredClone(fresh);
  delete saved.enemyBalanceVersion;
  saved.boss.hp = 315; saved.boss.maxHp = 315;
  const before = structuredClone(saved);
  function round(run) {
    let next = run;
    for (const player of players) next = submitRaidAction(next, player.id, 'runeSun');
    return next;
  }
  const newRound = round(fresh), oldRound = round(saved);
  assert.deepEqual(saved, before);
  for (const player of players) {
    assert.equal(newRound.members.find(member => member.id === player.id).hp, fresh.members[0].hp - 11);
    assert.equal(oldRound.members.find(member => member.id === player.id).hp, saved.members[0].hp - 10);
  }
  assert.equal(oldRound.boss.maxHp, 315);
  assert.equal(oldRound.enemyBalanceVersion, undefined);
  for (const size of [4, 5]) {
    const raid = createRaid(Array.from({ length: size }, (_, index) => ({ ...hero(4), id: String(index) })));
    assert.equal(raid.boss.maxHp, Math.round((180 + 45 * size) * 1.1));
  }
});

test('a trained hero can still finish varied seven-island routes with rest, boons and tactical choices', () => {
  for (const seed of [4, 27, 64, 200]) {
    const rng = seeded(seed);
    let run = createIsland(hero(4), rng);
    for (let turn = 0; run.status === 'active' && turn < 200; turn++) {
      if (run.phase === 'route') {
        const path = ['combat', 'puzzle', 'treasure', 'camp', 'event', 'guardian'].flatMap(kind => run.choices.filter(choice => choice.kind === kind))[0];
        run = chooseIsland(run, path.id, rng);
      } else if (run.phase === 'combat') {
        const action = run.player.hp < run.player.maxHp * .4 && !run.springUsed ? 'spring'
          : run.enemy.intent === 'heavy' && run.player.hp < run.player.maxHp * .55 ? 'guard'
            : run.player.focusCooldown === 0 && run.player.energy >= 2 ? 'focus' : 'attack';
        run = actOnIsland(run, action, rng);
      } else if (run.phase === 'boon') {
        const boon = ['vigor', 'edge', 'mirror', 'echo', 'renew'].find(id => run.offers.some(item => item.id === id));
        run = chooseIsland(run, boon, rng);
      } else {
        const option = run.phase === 'puzzle' ? run.encounter.correctOption : run.phase === 'camp' ? 'heal'
          : run.phase === 'treasure' ? 'boon' : run.encounter.id === 'bridge' ? 'safe' : run.encounter.id === 'trader' ? 'leave' : 'guide';
        run = chooseIsland(run, option, rng);
      }
    }
    assert.equal(run.status, 'completed', `Seed ${seed}: ${run.log.join(' ')}`);
    assert.equal(run.cleared, 7);
    assert.ok(run.player.hp > 0);
  }
});
