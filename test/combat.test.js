import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattleState, applyAction, getCombatStats } from '../lib/combat.js';
import { ITEMS, POTIONS, equipmentBonuses } from '../lib/items.js';

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

test('equipped bonuses affect stats and are frozen together with appearance at battle start', () => {
  const weapon = ITEMS.find(item => item.type === 'weapon' && item.rarity === 'legendary');
  const helmet = ITEMS.find(item => item.type === 'helmet' && item.rarity === 'rare');
  assert.ok(weapon);
  assert.ok(helmet);
  const a = {
    ...player('a'), avatar: 'owl',
    appearance: { color: 'mint', outfit: 'scholar', emblem: 'moon' },
    inventory: { items: [{ id: 'weapon-a', templateId: weapon.id }, { id: 'helmet-a', templateId: helmet.id }] },
    equipment: { hand1: 'weapon-a', helmet: 'helmet-a' },
  };
  const bonuses = equipmentBonuses(a.inventory, a.equipment);
  const stats = getCombatStats(a);
  assert.equal(stats.attackDamage, 14 + bonuses.attack);
  assert.equal(stats.maxHp, 92 + bonuses.health);
  let state = createBattleState(a, player('b'));
  assert.deepEqual(state.fighters[0].stats, stats);
  assert.equal(state.fighters[0].avatar, 'owl');
  assert.equal(state.fighters[0].appearance.color, 'mint');
  a.equipment.hand1 = null;
  a.appearance.color = 'rose';
  a.inventory.items.length = 0;
  assert.equal(state.fighters[0].equipment.hand1, 'weapon-a');
  assert.equal(state.fighters[0].appearance.color, 'mint');
  // Even a changed display skill cannot replace the start-of-duel stats.
  state.fighters[0].skills.strength = 10;
  state = applyAction(state, 'a', 'attack').state;
  assert.equal(state.fighters[1].hp, 92 - stats.attackDamage);
});

test('armor reduces damage before guarding, is capped, and never makes fighters invulnerable', () => {
  const a = player('a');
  const b = player('b');
  const state = createBattleState(a, b);
  state.fighters[1].stats.defense = 999;
  const hit = applyAction(state, 'a', 'attack').state;
  assert.equal(hit.fighters[1].hp, 92 - 2); // attack14 - capped defense12
  assert.equal(hit.events[0].damage, 2);
  const guarded = structuredClone(state);
  guarded.fighters[1].guarding = true;
  const blocked = applyAction(guarded, 'a', 'attack').state;
  assert.equal(blocked.fighters[1].hp, 91);
  assert.equal(blocked.events[0].blocked, true);
  const lowAttack = structuredClone(state);
  lowAttack.fighters[0].stats.attackDamage = 1;
  const minimumHit = applyAction(lowAttack, 'a', 'attack').state;
  assert.equal(minimumHit.fighters[1].hp, 91);
  assert.equal(minimumHit.events[0].damage, 1);
  const negativeDefense = structuredClone(state);
  negativeDefense.fighters[1].stats.defense = -30;
  assert.equal(applyAction(negativeDefense, 'a', 'attack').state.events[0].damage, 14);
});

test('small, medium and large potions heal their own amount and consume only their own inventory key', () => {
  assert.deepEqual(POTIONS.map(potion => potion.healing), [20, 35, 60]);
  for (const potion of POTIONS) {
    const state = battle();
    state.fighters[0].hp = 10;
    const inventory = { [potion.id]: 1 };
    const result = applyAction(state, 'a', potion.id, inventory);
    assert.equal(result.state.fighters[0].hp, 10 + potion.healing);
    assert.equal(result.consumedItem, potion.id);
    assert.deepEqual(inventory, { [potion.id]: 1 });
    assert.equal(result.state.events[0].healing, potion.healing);
    assert.equal(result.state.events[0].action, potion.id);
    assert.equal(result.state.events[0].targetId, 'a');
    assert.throws(() => applyAction(state, 'a', potion.id, {}), /keinen Heiltrank/);
    assert.throws(() => applyAction(battle(), 'a', potion.id, inventory), /bereits voll/);
  }
});

test('animation events distinguish attacks, defense and healing with stable monotonic IDs', () => {
  let state = battle();
  assert.deepEqual(state.events, []);
  state = applyAction(state, 'a', 'attack').state;
  state = applyAction(state, 'b', 'guard').state;
  state = applyAction(state, 'a', 'focus').state;
  assert.deepEqual(state.events.map(event => event.id), [1, 2, 3]);
  assert.deepEqual(state.events.map(event => event.turn), [1, 2, 3]);
  assert.deepEqual(state.events[0], {
    id: 1, turn: 1, actorId: 'a', targetId: 'b', action: 'attack',
    damage: 14, healing: 0, blocked: false,
  });
  assert.equal(state.events[1].action, 'guard');
  assert.equal(state.events[1].healing, 7);
  assert.equal(state.events[1].targetId, 'b');
  assert.equal(state.events[2].blocked, true);
  assert.equal(state.events[2].damage, Math.ceil(21 * .45));
});

test('legacy saved battles without stats, appearances or event fields remain playable', () => {
  const legacy = battle();
  delete legacy.events;
  delete legacy.eventSeq;
  for (const fighter of legacy.fighters) {
    delete fighter.stats;
    delete fighter.equipment;
    delete fighter.appearance;
    delete fighter.avatar;
  }
  const before = structuredClone(legacy);
  const next = applyAction(legacy, 'a', 'attack').state;
  assert.equal(next.fighters[1].hp, 78);
  assert.equal(next.events[0].id, 1);
  assert.equal(next.eventSeq, 1);
  assert.deepEqual(legacy, before);
});

test('animation history is bounded without reusing IDs and final events identify the winner', () => {
  const state = battle();
  state.events = Array.from({ length: 64 }, (_, index) => ({ id: index + 1 }));
  state.eventSeq = 10; // An old persisted sequence cannot re-use an existing ID.
  state.fighters[1].hp = 1;
  const result = applyAction(state, 'a', 'attack');
  assert.equal(result.state.events.length, 64);
  assert.equal(result.state.events[0].id, 2);
  assert.equal(result.state.events.at(-1).id, 65);
  assert.equal(result.state.eventSeq, 65);
  assert.equal(result.state.events.at(-1).winnerId, 'a');
  assert.equal(result.state.events.at(-1).damage, 1);
  assert.equal(state.events.length, 64);
  assert.equal(state.eventSeq, 10);
});
