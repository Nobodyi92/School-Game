import test from 'node:test';
import assert from 'node:assert/strict';
import { createTower, applyTowerAction, applyTowerChoice, createRaid, submitRaidAction } from '../lib/adventures.js';
import { createIsland, chooseIsland, actOnIsland } from '../lib/island.js';

const hero = (id, ancestry = 'aether-elf', abilityLoadout = ['mark', 'heavy-strike', 'mend']) => ({
  id, name: `Spieler ${id}`, characterName: `Held ${id}`, ancestry, level: 5,
  skills: { strength: 3, focus: 3, endurance: 3 }, equipment: {}, inventory: { items: [] },
  appearance: {}, cosmetics: { owned: [], selected: {} }, abilityLoadout,
});
const round = (state, choices, targets = {}) => {
  let result = state;
  for (const member of state.members.filter(member => member.hp > 0)) {
    result = submitRaidAction(result, member.id, choices[member.id] || 'guard', targets[member.id]);
  }
  return result;
};
const chargedRaid = () => {
  const state = createRaid(['a', 'b', 'c'].map(id => hero(id)));
  for (const member of state.members) member.energy = 6;
  return state;
};
function openPhase(state, phase = 'onslaught') {
  state.boss.phase = phase;
  state.boss.hp = Math.floor(state.boss.maxHp * (phase === 'core' ? .25 : .6));
  state.boss.shielded = false;
  return state;
}

function islandCombat(player = hero('solo')) {
  for (let seed = 1; seed <= 30; seed++) {
    let value = seed;
    const rng = max => { value = (value * 1664525 + 1013904223) >>> 0; return value % max; };
    const run = createIsland(player, rng);
    const choice = run.choices.find(option => option.kind === 'combat');
    if (choice) return chooseIsland(run, choice.id, rng);
  }
  throw new Error('No deterministic combat route found.');
}

test('new tower and island combats snapshot three abilities, charge energy and reject invalid skills without spending a turn', () => {
  const account = hero('solo');
  const before = structuredClone(account);
  for (const [create, apply] of [
    [() => createTower(account), (run, action, target) => applyTowerAction(run, action, target)],
    [() => islandCombat(account), (run, action, target) => actOnIsland(run, action, () => 0, target)],
  ]) {
    let run = create();
    assert.equal(run.tacticsVersion, 1);
    assert.equal(run.player.energy, 2);
    assert.equal(run.player.abilityLoadout.length, 3);
    const snapshot = structuredClone(run);
    assert.throws(() => apply(run, 'ability:heavy-strike'), /Ätherenergie/);
    assert.throws(() => apply(run, 'ability:living-grove'), /ausgewählt/);
    assert.throws(() => apply(run, 'ability:mark', 'unknown'), /gegnerischen/);
    assert.deepEqual(run, snapshot);
    run = apply(run, 'guard');
    assert.equal(run.player.energy, 4);
    run = apply(run, 'ability:mark');
    assert.equal(run.player.energy, 2);
    assert.ok(run.enemy.effects.marked);
    const marked = run.enemy.hp;
    run = apply(run, 'attack');
    assert.ok(run.enemy.hp < marked);
    assert.equal(run.enemy.effects.marked, undefined);
    assert.ok(run.events.some(entry => entry.abilityId === 'mark'));
  }
  assert.deepEqual(account, before);
});

test('tower abilities can heal the hero and compatibility focus spends energy', () => {
  let run = createTower(hero('solo', 'aether-druid'));
  run.player.hp -= 40;
  run.player.energy = 6;
  const injured = run.player.hp;
  run = applyTowerAction(run, 'ability:mend', run.player.id);
  assert.ok(run.player.hp > injured);
  assert.equal(run.player.energy, 3);
  const healed = run;
  assert.throws(() => applyTowerAction(run, 'ability:mend', 'tower-enemy'), /Gruppe/);
  assert.deepEqual(run, healed);
  run = applyTowerAction(run, 'focus');
  assert.equal(run.player.energy, 1);
  run.player.focusCooldown = 0;
  assert.throws(() => applyTowerAction(run, 'focus'), /2 Ätherenergie/);
});

test('each new tower room starts its own energy pool and clears short-lived conditions', () => {
  let run = createTower(hero('solo', 'sky-nomad'));
  run.enemy.hp = 1;
  run = applyTowerAction(run, 'attack');
  assert.equal(run.status, 'choice');
  run.player.energy = 0;
  run.player.effects = { weakened: { turns: 2, potency: .25 } };
  run = applyTowerChoice(run, 'vigor');
  assert.equal(run.player.energy, 3);
  assert.deepEqual(run.player.effects, {});
});

test('raid skills validate energy and ownership when queued, spend only on resolution and store the selected ally', () => {
  const state = chargedRaid();
  state.members[1].hp -= 45;
  const untouched = structuredClone(state);
  let next = submitRaidAction(state, 'a', 'ability:mend', 'b');
  assert.equal(next.members[0].energy, 6);
  assert.equal(next.actionTargets.a, 'b');
  assert.deepEqual(state, untouched);
  assert.throws(() => submitRaidAction(next, 'a', 'ability:mark'), /steht bereits/);
  assert.throws(() => submitRaidAction(state, 'a', 'ability:mend', 'stranger'), /Gruppe/);
  const poor = structuredClone(state); poor.members[0].energy = 0;
  assert.throws(() => submitRaidAction(poor, 'a', 'ability:mark'), /Ätherenergie/);
  next = submitRaidAction(next, 'b', 'runeSun');
  next = submitRaidAction(next, 'c', 'runeMoon');
  assert.equal(next.members[0].energy, 3);
  assert.ok(next.members[1].hp > state.members[1].hp);
  assert.ok(next.events.some(entry => entry.actorId === 'a' && entry.targetId === 'b' && entry.healing > 0));
  assert.deepEqual(next.actionTargets, {});
});

test('group marks resolve before heavy strikes even when the attacker joined first', () => {
  const baseline = openPhase(chargedRaid());
  const combined = structuredClone(baseline);
  const plain = round(baseline, { a: 'ability:heavy-strike' });
  const combo = round(combined, { a: 'ability:heavy-strike', b: 'ability:mark' });
  const damage = run => run.events.find(entry => entry.actorId === 'a' && entry.abilityId === 'heavy-strike').damage;
  assert.ok(damage(combo) > damage(plain));
  const mark = combo.events.findIndex(entry => entry.abilityId === 'mark');
  const strike = combo.events.findIndex(entry => entry.abilityId === 'heavy-strike');
  assert.ok(mark < strike);
  assert.equal(combo.boss.effects.marked, undefined);
});

test('two valid queued heals can fill the same ally without deadlocking the round', () => {
  const state = chargedRaid();
  state.members[2].hp -= 1;
  const result = round(state, { a: 'ability:mend', b: 'ability:mend', c: 'guard' }, { a: 'c', b: 'c' });
  assert.equal(result.round, 2);
  assert.equal(result.members[0].energy, 3);
  assert.equal(result.members[1].energy, 3);
  assert.ok(result.events.some(entry => entry.actorId === 'a' && entry.healing === 1));
});

test('an early lethal hit cancels later attacks and still wins the resolved raid', () => {
  const state = openPhase(chargedRaid(), 'core');
  state.boss.hp = 1;
  const result = round(state, { a: 'attack', b: 'ability:heavy-strike' });
  assert.equal(result.status, 'won');
  assert.equal(result.boss.hp, 0);
  assert.ok(result.events.at(-1).winnerId);
  assert.equal(result.members[1].energy, 6, 'The cancelled attack does not spend energy.');
});

test('Runengolem phases open the shield, announce area danger and expose its core', () => {
  let state = chargedRaid();
  assert.equal(state.boss.phase, 'armor');
  assert.equal(state.boss.shielded, true);
  state.boss.hp = Math.floor(state.boss.maxHp * .65);
  state = round(state, {});
  assert.equal(state.boss.phase, 'onslaught');
  assert.equal(state.boss.shielded, false);
  assert.match(state.boss.intentLabel, /Steinsturm.*ganze Gruppe/);
  assert.equal(state.boss.intent, 'stampede');
  const before = state.boss.hp;
  state = round(state, { a: 'attack', b: 'attack', c: 'attack' });
  assert.ok(state.boss.hp <= before - 3 * state.members[0].stats.attackDamage);
  state.boss.hp = Math.floor(state.boss.maxHp * .3);
  state = round(state, {});
  assert.equal(state.boss.phase, 'core');
  assert.equal(state.boss.vulnerability, 1.25);
  assert.match(state.boss.intentLabel, /Runenwut/);
  const core = state.boss.hp;
  state = round(state, { a: 'attack' });
  assert.ok(core - state.boss.hp > state.members[0].stats.attackDamage);
});

test('weakening one announced area attack protects every living group member', () => {
  const player = hero('a', 'aether-druid', ['thorn-bind', 'mark', 'aether-shield']);
  const baseline = openPhase(createRaid([player, hero('b'), hero('c')]));
  baseline.boss.intent = 'stampede';
  for (const member of baseline.members) member.energy = 6;
  const weakened = round(baseline, { a: 'ability:thorn-bind', b: 'runeSun', c: 'runeSun' });
  const plain = round(baseline, { a: 'runeSun', b: 'runeSun', c: 'runeSun' });
  for (const member of plain.members) assert.ok(weakened.members.find(other => other.id === member.id).hp > member.hp, member.id);
  assert.equal(weakened.boss.effects.weakened, undefined);
});

test('persisted legacy adventures keep their old actions and reject new skill payloads', () => {
  let tower = createTower(hero('legacy'));
  delete tower.tacticsVersion; delete tower.player.tacticsVersion; delete tower.player.energy;
  assert.throws(() => applyTowerAction(tower, 'ability:mark'), /nicht bekannt/);
  tower = applyTowerAction(tower, 'focus');
  assert.equal(tower.player.energy, undefined);
  let island = islandCombat(hero('legacy'));
  delete island.tacticsVersion; delete island.player.tacticsVersion; delete island.player.energy;
  assert.throws(() => actOnIsland(island, 'ability:mark'), /nicht bekannt/);
  island = actOnIsland(island, 'focus', () => 0);
  assert.equal(island.player.energy, undefined);
  const raid = chargedRaid(); delete raid.tacticsVersion;
  assert.throws(() => submitRaidAction(raid, 'a', 'ability:mark'), /nicht bekannt/);
  const result = round(raid, { a: 'runeSun', b: 'runeMoon', c: 'attack' });
  assert.equal(result.boss.hp, raid.boss.hp - raid.members[2].stats.attackDamage - 50);
});

test('the final island guardian changes phase and announces its stronger attacks', () => {
  let run = createIsland(hero('guardian-test'), () => 0);
  run.cleared = 6;
  run.choices = [{ id: 'path-7-0', kind: 'guardian', title: 'Das Herz der Insel', description: 'Letzte Station' }];
  run = chooseIsland(run, 'path-7-0', () => 0);
  assert.equal(run.enemy.phase, 'watch');
  run.enemy.hp = 45;
  run = actOnIsland(run, 'attack', () => 0);
  assert.equal(run.enemy.phase, 'surge');
  assert.equal(run.enemy.phaseIndex, 2);
  assert.match(run.enemy.intentLabel, /Entfesselter Strom/);
  const hp = run.player.hp;
  run = actOnIsland(run, 'attack', () => 0);
  assert.ok(hp - run.player.hp > 13, 'The announced second phase strengthens the guardian attack.');
});
