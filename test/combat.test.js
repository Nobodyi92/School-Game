import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattleState, applyAction, getCombatStats } from '../lib/combat.js';

const player = (id, skills = {}) => ({
  id,
  name: id,
  characterName: `Held ${id}`,
  skills: { strength: 1, focus: 1, endurance: 1, ...skills },
});

const battle = () => createBattleState(player('a'), player('b'));
const act = (state, action, inventory) => applyAction(state, state.turnId, action, inventory).state;

test('creates independent fighters, derives stats, and lets the challenger start', () => {
  const a = player('a', { endurance: 3 });
  const state = createBattleState(a, player('b'));
  assert.equal(state.fighters[0].maxHp, 116);
  assert.equal(state.fighters[0].hp, 116);
  assert.equal(state.turnId, 'a');
  assert.equal(state.round, 1);
  state.fighters[0].skills.endurance = 9;
  assert.equal(a.skills.endurance, 3);
  assert.ok(getCombatStats(player('a', { strength: 2 })).attackDamage > getCombatStats(player('b')).attackDamage);
  assert.ok(getCombatStats(player('a', { focus: 2 })).focusDamage > getCombatStats(player('b')).focusDamage);
});

test('rejects duplicate fighters and invalid skill values', () => {
  assert.throws(() => createBattleState(player('a'), player('a')), /unterschiedliche/);
  assert.throws(() => getCombatStats(player('a', { strength: 11 })), /zwischen 1 und 10/);
  assert.throws(() => getCombatStats(player('a', { endurance: 1.5 })), /ganze Stufe/);
});

test('enforces participation, turn order, and known actions without changing state', () => {
  const state = battle();
  const before = structuredClone(state);
  assert.throws(() => applyAction(state, 'outsider', 'attack'), /nimmst/);
  assert.throws(() => applyAction(state, 'b', 'attack'), /am Zug/);
  assert.throws(() => applyAction(state, 'a', 'cheat'), /nicht bekannt/);
  assert.deepEqual(state, before);
  const next = act(state, 'attack');
  assert.equal(next.turnId, 'b');
  assert.equal(next.turns, 1);
  assert.equal(next.round, 1);
  assert.equal(act(next, 'attack').round, 2);
});

test('guard reduces the next incoming attack, heals within maximum HP, and is consumed', () => {
  let state = battle();
  state.fighters[0].hp -= 20;
  const oldHp = state.fighters[0].hp;
  state = act(state, 'guard');
  assert.equal(state.fighters[0].hp, oldHp + 7);
  assert.equal(state.fighters[0].guarding, true);
  const beforeHit = state.fighters[0].hp;
  state = act(state, 'attack');
  assert.equal(beforeHit - state.fighters[0].hp, Math.ceil(14 * 0.45));
  assert.equal(state.fighters[0].guarding, false);
  const fullHealth = act(battle(), 'guard');
  assert.equal(fullHealth.fighters[0].hp, fullHealth.fighters[0].maxHp);
});

test('potion checks inventory and missing HP, returns consumption, and never changes inventory', () => {
  const state = battle();
  assert.throws(() => applyAction(state, 'a', 'potion', { potion: 1 }), /bereits voll/);
  state.fighters[0].hp -= 50;
  assert.throws(() => applyAction(state, 'a', 'potion'), /keinen Heiltrank/);
  assert.throws(() => applyAction(state, 'a', 'potion', { potion: 0 }), /keinen Heiltrank/);
  const inventory = { potion: 1 };
  const result = applyAction(state, 'a', 'potion', inventory);
  assert.equal(result.consumedItem, 'potion');
  assert.equal(result.state.fighters[0].hp, state.fighters[0].hp + 35);
  assert.deepEqual(inventory, { potion: 1 });
  assert.equal(result.state.turnId, 'b');
  const almostFull = battle();
  almostFull.fighters[0].hp -= 3;
  const capped = applyAction(almostFull, 'a', 'potion', { potion: 1 });
  assert.equal(capped.state.fighters[0].hp, almostFull.fighters[0].maxHp);
});

test('focus is stronger and requires two other own actions to cool down', () => {
  let state = act(battle(), 'focus');
  assert.equal(state.fighters[1].hp, 92 - 21);
  assert.equal(state.fighters[0].focusCooldown, 2);
  state = act(state, 'guard');
  assert.throws(() => applyAction(state, 'a', 'focus'), /2 weiteren/);
  state = act(state, 'guard');
  assert.equal(state.fighters[0].focusCooldown, 1);
  state = act(state, 'guard');
  assert.throws(() => applyAction(state, 'a', 'focus'), /1 weiteren/);
  state = act(state, 'guard');
  assert.equal(state.fighters[0].focusCooldown, 0);
  state = act(state, 'guard');
  state = act(state, 'focus');
  assert.equal(state.fighters[0].focusCooldown, 2);
});

test('winning hit caps HP at zero, records winner, and prevents subsequent turns', () => {
  let state = battle();
  state.fighters[1].hp = 1;
  const result = applyAction(state, 'a', 'attack');
  state = result.state;
  assert.equal(result.consumedItem, null);
  assert.equal(state.fighters[1].hp, 0);
  assert.equal(state.winnerId, 'a');
  assert.equal(state.status, 'finished');
  assert.match(state.log.at(-1), /gewinnt/);
  assert.throws(() => applyAction(state, 'b', 'attack'), /beendet/);
});

test('actions do not mutate input state, including nested fighter and log data', () => {
  const state = battle();
  const before = structuredClone(state);
  const result = applyAction(state, 'a', 'focus');
  assert.deepEqual(state, before);
  result.state.log.push('other');
  result.state.fighters[0].skills.strength = 10;
  assert.deepEqual(state, before);
});

test('guard-only combat ends after 30 rounds with a bounded log', () => {
  let state = battle();
  for (let i = 0; i < 60; i += 1) state = act(state, 'guard');
  assert.equal(state.status, 'finished');
  assert.equal(state.winnerId, 'a');
  assert.equal(state.turns, 60);
  assert.equal(state.round, 30);
  assert.equal(state.log.length, 24);
  assert.match(state.log.at(-1), /Stichentscheid/);
});

test('time limit compares HP percentages rather than absolute endurance bonus', () => {
  let state = createBattleState(player('a', { endurance: 10 }), player('b'));
  state.turns = 59;
  state.turnId = 'b';
  state.fighters[0].hp = 100; // 50% of 200
  state.fighters[1].hp = 70; // 76% of 92; guard heals more
  state = act(state, 'guard');
  assert.equal(state.status, 'finished');
  assert.equal(state.winnerId, 'b');
});
