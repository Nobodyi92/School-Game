import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTower, applyTowerAction, applyTowerChoice, TOWER_BOONS, TOWER_MAX_FLOOR,
  createRaid, submitRaidAction, LOBBY_MIN, LOBBY_MAX,
} from '../lib/adventures.js';

const hero = (id, level = 1) => ({
  id, name: `Spieler ${id}`, characterName: `Held ${id}`, avatar: 'fox',
  skills: { strength: level, focus: level, endurance: level },
  inventory: { potion: 3, chests: 2, items: [] }, equipment: {},
  appearance: { color: 'mint', outfit: 'knight', emblem: 'moon' },
  cosmetics: { owned: ['pet-firefly'], selected: { companion: 'pet-firefly', outfit: null } },
  xp: 80, totalXp: 130,
});
const freshRaid = () => createRaid(['a', 'b', 'c'].map(id => hero(id)));

function winFloor(run) {
  let result = run;
  for (let i = 0; i < 50 && result.status === 'active'; i++) {
    result = applyTowerAction(result, result.player.focusCooldown === 0 ? 'focus' : 'attack');
  }
  return result;
}

function round(state, actions) {
  let result = state;
  for (const member of state.members.filter(member => member.hp > 0)) {
    result = submitRaidAction(result, member.id, actions[member.id] || 'guard');
  }
  return result;
}

test('tower snapshots stats, appearance and cosmetics without changing account progress', () => {
  const player = hero('a');
  const before = structuredClone(player);
  const run = createTower(player);
  assert.equal(run.floor, 1);
  assert.equal(run.status, 'active');
  assert.equal(run.player.hp, run.player.maxHp);
  assert.deepEqual(run.player.cosmetics, player.cosmetics);
  run.player.cosmetics.selected.companion = null;
  run.player.appearance.color = 'sky';
  run.player.stats.attackDamage += 30;
  assert.deepEqual(player, before);
  assert.equal('xp' in run.player, false);
  assert.equal('inventory' in run.player, false);
  assert.equal(TOWER_BOONS.length, 3);
  assert.equal(TOWER_MAX_FLOOR, 10);
});

test('a basic unequipped hero can earn the first companion and bank it after floor two', () => {
  const account = hero('a');
  const before = structuredClone(account);
  let run = winFloor(createTower(account));
  assert.equal(run.status, 'choice');
  assert.equal(run.cleared, 1);
  assert.deepEqual(run.pendingRewards, []);
  const hp = run.player.hp;
  run = applyTowerChoice(run, 'vigor');
  assert.equal(run.floor, 2);
  assert.equal(run.player.maxHp, 110);
  assert.equal(run.player.hp, Math.min(110, hp + 25));
  run = winFloor(run);
  assert.equal(run.status, 'choice');
  assert.deepEqual(run.pendingRewards, ['pet-firefly']);
  const saved = applyTowerChoice(run, 'bank');
  assert.equal(saved.status, 'banked');
  assert.equal(saved.floor, 2);
  assert.deepEqual(saved.pendingRewards, ['pet-firefly']);
  assert.deepEqual(account, before);
  assert.equal(run.status, 'choice');
  assert.throws(() => applyTowerAction(saved, 'attack'), /kein Kampf/);
});

test('tower boons only affect this run and choices cannot skip active floors', () => {
  const player = hero('a');
  let run = winFloor(createTower(player));
  const before = structuredClone(run);
  const power = applyTowerChoice(run, 'power');
  const focus = applyTowerChoice(run, 'focus');
  assert.equal(power.player.stats.attackDamage, run.player.stats.attackDamage + 4);
  assert.equal(focus.player.stats.focusDamage, run.player.stats.focusDamage + 5);
  assert.equal(power.player.hp, run.player.hp);
  assert.deepEqual(run, before);
  assert.equal(createTower(player).player.stats.attackDamage, run.player.stats.attackDamage);
  assert.throws(() => applyTowerChoice(power, 'bank'), /erst nach/);
  assert.throws(() => applyTowerChoice(run, 'infinite-xp'), /gibt es nicht/);
});

test('tower source heals once per floor; invalid actions and cooldowns never mutate a run', () => {
  let run = createTower(hero('a'));
  assert.throws(() => applyTowerAction(run, 'rest'), /bereits voll/);
  assert.throws(() => applyTowerAction(run, 'cheat'), /nicht bekannt/);
  run = applyTowerAction(run, 'focus');
  assert.equal(run.player.focusCooldown, 2);
  const saved = structuredClone(run);
  assert.throws(() => applyTowerAction(run, 'focus'), /aufladen/);
  assert.deepEqual(run, saved);
  run.player.hp = Math.min(run.player.hp, run.player.maxHp - 25);
  const oldHp = run.player.hp;
  const source = applyTowerAction(run, 'rest');
  assert.equal(source.restUsed, true);
  assert.ok(source.events.some(entry => entry.actorId === run.player.id && entry.healing === 20));
  assert.equal(run.player.hp, oldHp);
  assert.equal(run.restUsed, false);
  assert.throws(() => applyTowerAction(source, 'rest'), /bereits benutzt/);
});

test('tower losses forfeit unbanked rewards but do not touch account gear, XP or inventory', () => {
  const account = hero('a');
  const original = structuredClone(account);
  let run = winFloor(createTower(account));
  run = winFloor(applyTowerChoice(run, 'vigor'));
  run = applyTowerChoice(run, 'power');
  assert.deepEqual(run.pendingRewards, ['pet-firefly']);
  run.player.hp = 1;
  run.enemy.intent = 'heavy';
  const lost = applyTowerAction(run, 'attack');
  assert.equal(lost.status, 'lost');
  assert.deepEqual(lost.pendingRewards, []);
  assert.deepEqual(account, original);
  const stalled = createTower(account);
  stalled.turns = 49;
  const timedOut = applyTowerAction(stalled, 'guard');
  assert.equal(timedOut.status, 'lost');
  assert.match(timedOut.log.at(-1), /50 Zügen/);
});

test('a full ten-floor ascent awards each milestone exactly once and cannot continue past the summit', () => {
  let run = createTower(hero('champion', 10));
  for (let floor = 1; floor <= 10; floor++) {
    run = winFloor(run);
    assert.equal(run.cleared, floor);
    if (floor < 10) run = applyTowerChoice(run, 'power');
  }
  assert.equal(run.status, 'completed');
  assert.deepEqual(run.pendingRewards, ['pet-firefly', 'outfit-starlight', 'pet-aether-falcon', 'trophy-tower-bronze', 'pet-clockwork-beetle', 'pet-cloud', 'outfit-warden', 'trophy-tower-gold', 'pet-aether-phoenix']);
  assert.equal(new Set(run.pendingRewards).size, 9);
  assert.throws(() => applyTowerChoice(run, 'power'), /erst nach/);
  const ids = run.events.map(entry => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.at(-1), run.eventSeq);
  assert.ok(ids.every((id, index) => index === 0 || id > ids[index - 1]));
});

test('raid creation requires three to five distinct participants and freezes their appearance', () => {
  assert.equal(LOBBY_MIN, 3); assert.equal(LOBBY_MAX, 5);
  assert.throws(() => createRaid([hero('a'), hero('b')]), /drei bis fünf/);
  assert.throws(() => createRaid(Array.from({ length: 6 }, (_, i) => hero(String(i)))), /drei bis fünf/);
  assert.throws(() => createRaid([hero('a'), hero('a'), hero('b')]), /einmal/);
  const participants = ['a', 'b', 'c'].map(id => hero(id));
  const before = structuredClone(participants);
  const state = createRaid(participants);
  state.members[0].cosmetics.selected.companion = null;
  state.members[0].stats.attackDamage += 100;
  assert.deepEqual(participants, before);
  assert.equal(state.boss.hp, 315);
  assert.equal(state.round, 1);
});

test('raid queues one immutable action each and never resolves an incomplete round', () => {
  const original = freshRaid();
  const before = structuredClone(original);
  let state = submitRaidAction(original, 'a', 'runeSun');
  assert.deepEqual(original, before);
  assert.equal(state.round, 1);
  assert.equal(state.members[0].action, 'runeSun');
  assert.equal(state.boss.hp, before.boss.hp);
  assert.equal(state.events.length, 0);
  assert.throws(() => submitRaidAction(state, 'a', 'runeMoon'), /steht bereits/);
  assert.throws(() => submitRaidAction(state, 'outsider', 'attack'), /gehörst nicht/);
  assert.throws(() => submitRaidAction(state, 'b', 'free-win'), /nicht bekannt/);
  state = submitRaidAction(state, 'b', 'runeMoon');
  assert.equal(state.round, 1);
  state = submitRaidAction(state, 'c', 'attack');
  assert.equal(state.round, 2);
  assert.deepEqual(state.actions, {});
  assert.ok(state.members.every(member => member.action === null));
});

test('only complementary runes by distinct players break the shield and permit real damage', () => {
  const wrong = round(freshRaid(), { a: 'runeSun', b: 'runeSun', c: 'attack' });
  assert.equal(wrong.boss.hp, 314);
  assert.deepEqual(wrong.runeshield, { sun: true, moon: false, broken: false });
  const correct = round(freshRaid(), { a: 'runeSun', b: 'runeMoon', c: 'attack' });
  assert.equal(correct.boss.hp, 315 - 14 - 50);
  assert.equal(correct.runeshield.broken, true);
  assert.equal(correct.boss.shielded, true); // Reforms for the next announced round.
  assert.ok(correct.events.some(entry => entry.runeBreak && entry.damage === 50));
  assert.ok(correct.events.some(entry => entry.action === 'runeSun' && entry.actorId === 'a'));
  assert.ok(correct.events.some(entry => entry.action === 'runeMoon' && entry.actorId === 'b'));
});

test('the announced slam target can guard, heal and reduce incoming damage', () => {
  const first = round(freshRaid(), { a: 'runeSun', b: 'runeMoon', c: 'attack' });
  assert.equal(first.boss.intent, 'slam');
  const targetId = first.boss.targetId;
  const guarded = round(first, Object.fromEntries(first.members.map(member => [member.id, member.id === targetId ? 'guard' : 'runeSun'])));
  const unguarded = round(first, Object.fromEntries(first.members.map(member => [member.id, 'runeSun'])));
  assert.ok(guarded.members.find(member => member.id === targetId).hp > unguarded.members.find(member => member.id === targetId).hp);
  assert.ok(guarded.events.some(entry => entry.actorId === 'rune-golem' && entry.targetId === targetId && entry.blocked));
});

test('a single surviving hero cannot defeat the golem or trigger both runes', () => {
  const state = freshRaid();
  state.members[1].hp = 0; state.members[2].hp = 0; state.boss.hp = 1;
  const result = submitRaidAction(state, 'a', 'attack');
  assert.equal(result.status, 'lost');
  assert.equal(result.boss.hp, 1);
  assert.throws(() => submitRaidAction(result, 'a', 'runeSun'), /bereits beendet/);
  assert.throws(() => submitRaidAction(state, 'b', 'runeMoon'), /ausgeschieden/);
});

test('coordinated basic heroes can win; cosmetic participation metadata survives pure transitions', () => {
  let state = freshRaid();
  state.participated = { a: true, b: true, c: true };
  for (let i = 0; i < 12 && state.status === 'active'; i++) {
    const attacker = state.members.find(member => member.id === 'c');
    state = round(state, { a: 'runeSun', b: 'runeMoon', c: attacker.focusCooldown === 0 ? 'focus' : 'attack' });
  }
  assert.equal(state.status, 'won');
  assert.equal(state.boss.hp, 0);
  assert.ok(state.round <= 6);
  assert.deepEqual(state.participated, { a: true, b: true, c: true });
  assert.ok(state.events.at(-1).winnerId);
  assert.equal('xp' in state.members[0], false);
  assert.throws(() => submitRaidAction(state, 'a', 'attack'), /bereits beendet/);
  const ids = state.events.map(entry => entry.id);
  assert.equal(ids.at(-1), state.eventSeq);
  assert.ok(ids.every((id, index) => index === 0 || id > ids[index - 1]));
});

test('enrage limits stalled groups and each successful own action recharges focus', () => {
  let state = freshRaid();
  state = round(state, { a: 'focus', b: 'guard', c: 'guard' });
  assert.equal(state.members[0].focusCooldown, 2);
  assert.throws(() => submitRaidAction(state, 'a', 'focus'), /aufladen/);
  state = round(state, { a: 'guard', b: 'guard', c: 'guard' });
  assert.equal(state.members[0].focusCooldown, 1);
  state = round(state, { a: 'guard', b: 'guard', c: 'guard' });
  assert.equal(state.members[0].focusCooldown, 0);
  state.round = 12;
  const result = round(state, { a: 'guard', b: 'guard', c: 'guard' });
  assert.equal(result.status, 'lost');
  assert.ok(result.members.every(member => member.hp === 0));
  assert.match(result.log.at(-1), /zwölf Runden/);
});
