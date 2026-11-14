import test from 'node:test';
import assert from 'node:assert/strict';
import { createIsland, chooseIsland, actOnIsland, endIsland, islandPublicState } from '../lib/island.js';

const hero = () => ({ id: 'hero', name: 'Lina', characterName: 'Windpfote', avatar: 'fox',
  skills: { strength: 1, focus: 1, endurance: 1 }, inventory: { potion: 2, items: [] },
  equipment: {}, xp: 125, cosmetics: { owned: [], selected: { companion: null, outfit: null } } });
const zero = () => 0;
const seeded = seed => max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
function enter(kind, rng = zero, state = createIsland(hero(), zero)) {
  return chooseIsland({ ...state, phase: 'route', choices: [{ id: 'test-path', kind, title: 'Teststation', description: 'Ein Weg' }] }, 'test-path', rng);
}
function progress(state, rng = zero) {
  if (state.phase === 'route') {
    const path = ['camp', 'puzzle', 'treasure', 'event', 'combat', 'guardian'].flatMap(kind => state.choices.filter(c => c.kind === kind))[0];
    return chooseIsland(state, path.id, rng);
  }
  if (state.phase === 'combat') {
    const action = state.player.hp < state.player.maxHp * .45 && !state.springUsed ? 'spring'
      : state.enemy.intent === 'heavy' && state.player.hp < state.player.maxHp * .6 ? 'guard'
        : state.player.focusCooldown === 0 ? 'focus' : 'attack';
    return actOnIsland(state, action, rng);
  }
  if (state.phase === 'boon') {
    const choice = ['vigor', 'edge', 'mirror', 'echo', 'renew'].find(id => state.offers.some(offer => offer.id === id));
    return chooseIsland(state, choice, rng);
  }
  const choice = state.phase === 'puzzle' ? state.encounter.correctOption
    : state.phase === 'camp' ? (state.player.hp < state.player.maxHp * .6 ? 'heal' : 'boon')
      : state.phase === 'treasure' ? 'boon'
        : state.encounter.id === 'bridge' ? 'safe' : state.encounter.id === 'trader' ? 'leave' : 'guide';
  return chooseIsland(state, choice, rng);
}

test('each island generates branching routes, snapshots the hero and keeps future routes private', () => {
  const player = hero(), before = structuredClone(player);
  const a = createIsland(player, seeded(12)), b = createIsland(player, seeded(87));
  assert.notDeepEqual(a.routeDeck, b.routeDeck);
  assert.equal(a.choices.length, 2);
  assert.notEqual(a.choices[0].kind, a.choices[1].kind);
  assert.equal(a.routeDeck.length, 6);
  a.player.stats.maxHp = 999;
  assert.deepEqual(player, before);
  const publicState = islandPublicState(a);
  assert.equal(publicState.routeDeck, undefined);
  publicState.choices[0].title = 'Changed';
  assert.notEqual(a.choices[0].title, 'Changed');
});

test('puzzles generate three distinct choices and never expose their answer before a decision', () => {
  for (let variant = 0; variant < 3; variant++) {
    let first = true;
    const rng = max => { if (first) { first = false; return variant; } return 0; };
    const run = enter('puzzle', rng);
    assert.equal(run.encounter.options.length, 3);
    assert.equal(new Set(run.encounter.options.map(choice => choice.label)).size, 3);
    const publicState = islandPublicState(run);
    assert.equal(publicState.encounter.correctOption, undefined);
    assert.equal(publicState.encounter.explanation, undefined);
    const solved = chooseIsland(run, run.encounter.correctOption, zero);
    assert.equal(solved.cleared, 1);
    assert.equal(solved.fragments, 2);
    assert.match(solved.lastOutcome.text, /2 Sternsplitter/);
  }
});

test('a wrong puzzle answer costs eight HP once but does not block the expedition', () => {
  const run = enter('puzzle');
  const wrong = run.encounter.options.find(option => option.id !== run.encounter.correctOption);
  const next = chooseIsland(run, wrong.id, zero);
  assert.equal(next.player.hp, run.player.hp - 8);
  assert.equal(next.phase, 'route');
  assert.equal(next.cleared, 1);
  assert.throws(() => chooseIsland(next, wrong.id, zero));
  assert.equal(run.cleared, 0);
});

test('merchant trades enforce travel currency and failed choices do not mutate the run', () => {
  let first = true;
  const rng = max => { if (first) { first = false; return 1; } return 0; };
  const run = enter('event', rng);
  assert.equal(run.encounter.id, 'trader');
  const before = structuredClone(run);
  assert.throws(() => chooseIsland(run, 'trade-boon', zero), /Sternsplitter/);
  assert.deepEqual(run, before);
  run.fragments = 3;
  const next = chooseIsland(run, 'trade-boon', zero);
  assert.equal(next.fragments, 1);
  assert.equal(next.phase, 'boon');
  assert.equal(next.offers.length, 2);
});

test('the wind bridge has both announced outcomes and a safe alternative', () => {
  const run = enter('event');
  const win = chooseIsland(run, 'jump', zero);
  assert.equal(win.fragments, 3);
  assert.equal(win.player.hp, run.player.hp);
  let first = true;
  const lose = chooseIsland(run, 'jump', max => { if (first) { first = false; return 1; } return 0; });
  assert.equal(lose.player.hp, run.player.hp - 12);
  assert.equal(lose.fragments, 0);
  const safe = chooseIsland(run, 'safe', zero);
  assert.equal(safe.player.hp, run.player.hp);
  assert.equal(safe.fragments, 1);
});

test('camp and treasure alternatives give different benefits and cannot be replayed', () => {
  const camp = enter('camp'); camp.player.hp -= 40;
  const healed = chooseIsland(camp, 'heal', zero);
  assert.equal(healed.player.hp, camp.player.hp + 28);
  assert.equal(healed.cleared, 1);
  assert.throws(() => chooseIsland(healed, 'heal', zero));
  const blessed = chooseIsland(camp, 'boon', zero);
  assert.equal(blessed.phase, 'boon');
  assert.equal(blessed.player.hp, camp.player.hp);
  const treasure = enter('treasure');
  assert.equal(chooseIsland(treasure, 'fragments', zero).fragments, 3);
  assert.equal(chooseIsland(treasure, 'boon', zero).fragments, 1);
});

test('only offered boons can be chosen and their stats never alter account equipment', () => {
  const player = hero(), before = structuredClone(player);
  let run = enter('camp', zero, createIsland(player, zero));
  run = chooseIsland(run, 'boon', zero);
  const oldHp = run.player.maxHp;
  run.offers = [{ id: 'vigor', name: 'Wurzelkraft' }];
  assert.throws(() => chooseIsland(run, 'edge', zero), /angeboten/);
  const next = chooseIsland(run, 'vigor', zero);
  assert.equal(next.player.maxHp, oldHp + 16);
  assert.equal(next.player.stats.maxHp, oldHp + 16);
  assert.deepEqual(player, before);
});

test('Doppelblitz triggers on every second normal attack with its own animation event', () => {
  let run = enter('combat'); run.boons = ['echo']; run.enemy.hp = 250; run.enemy.maxHp = 250;
  run = actOnIsland(run, 'attack', zero);
  assert.equal(run.events.filter(event => event.actorId === 'hero' && event.action === 'focus').length, 0);
  run = actOnIsland(run, 'attack', zero);
  assert.ok(run.events.some(event => event.actorId === 'hero' && event.action === 'focus' && event.damage === 7));
  assert.equal(new Set(run.events.map(event => event.id)).size, run.events.length);
});

test('Spiegelschild reflects only a guarded incoming hit', () => {
  const run = enter('combat'); run.boons = ['mirror']; run.enemy.intent = 'attack';
  const guarded = actOnIsland(run, 'guard', zero);
  assert.equal(guarded.enemy.hp, run.enemy.hp - 6);
  assert.ok(guarded.events.some(event => event.actorId === 'hero' && event.action === 'focus' && event.damage === 6));
  const ordinary = actOnIsland(run, 'attack', zero);
  assert.equal(ordinary.enemy.hp, run.enemy.hp - run.player.stats.attackDamage);
});

test('focus and the per-combat spring enforce cooldowns, ownership of the turn and immutability', () => {
  const run = enter('combat');
  assert.throws(() => actOnIsland(run, 'spring', zero), /bereits voll/);
  const after = actOnIsland(run, 'focus', zero);
  const snapshot = structuredClone(after);
  assert.throws(() => actOnIsland(after, 'focus', zero), /aufladen/);
  assert.deepEqual(after, snapshot);
  after.player.hp -= 30;
  const spring = actOnIsland(after, 'spring', zero);
  assert.equal(spring.springUsed, true);
  assert.throws(() => actOnIsland(spring, 'spring', zero), /bereits benutzt/);
});

test('a basic unequipped hero can finish varied seven-station expeditions and defeat the final guardian', () => {
  for (const seed of [4, 27, 64, 200]) {
    const rng = seeded(seed), player = hero(), before = structuredClone(player);
    let run = createIsland(player, rng), moves = 0;
    while (run.status === 'active' && moves++ < 250) run = progress(run, rng);
    assert.equal(run.status, 'completed', JSON.stringify({ seed, log: run.log }));
    assert.equal(run.cleared, 7);
    assert.equal(run.history.length, 7);
    assert.equal(run.history.at(-1).kind, 'guardian');
    assert.deepEqual(run.pendingRewards, ['pet-tide', 'pet-mist-cat', 'outfit-pathfinder', 'pet-blossom-moth', 'trophy-island']);
    assert.equal(run.events.at(-1).winnerId, 'hero');
    assert.deepEqual(player, before);
    assert.throws(() => actOnIsland(run, 'attack', rng), /beendet/);
  }
});

test('banking after three stations saves the first companion while losses clear only pending finds', () => {
  const rng = seeded(7);
  let run = createIsland(hero(), rng);
  for (let i = 0; run.cleared < 3 && i < 100; i++) run = progress(run, rng);
  assert.equal(run.status, 'active');
  const banked = endIsland(run);
  assert.equal(banked.status, 'banked');
  assert.deepEqual(banked.pendingRewards, ['pet-tide', 'pet-mist-cat']);
  assert.equal(banked.version, run.version + 1);
  const lost = endIsland(run, true);
  assert.equal(lost.status, 'lost'); assert.deepEqual(lost.pendingRewards, []);
  assert.throws(() => endIsland(banked), /beendet/);
  const fight = enter('combat', zero, run); fight.player.hp = 1; fight.enemy.intent = 'heavy';
  const defeated = actOnIsland(fight, 'attack', zero);
  assert.equal(defeated.status, 'lost'); assert.deepEqual(defeated.pendingRewards, []);
});

test('banking is blocked during an encounter and the final allowed combat action can still win', () => {
  const run = enter('combat'); run.cleared = 1;
  assert.throws(() => endIsland(run), /abgeschlossenen Station/);
  run.combatTurns = 39; run.enemy.hp = 1;
  assert.notEqual(actOnIsland(run, 'attack', zero).status, 'lost');
  run.enemy.hp = 1000;
  assert.equal(actOnIsland(run, 'guard', zero).status, 'lost');
});

test('versions increase across routes and encounters while unknown actions and invalid RNG are rejected', () => {
  const run = enter('puzzle');
  const next = chooseIsland(run, run.encounter.correctOption, zero);
  assert.equal(next.version, run.version + 1);
  const entered = chooseIsland(next, next.choices[0].id, zero);
  assert.equal(entered.version, next.version + 1);
  assert.throws(() => chooseIsland(run, 'free-legendary', zero));
  assert.throws(() => actOnIsland(run, 'attack', zero), /Station/);
  assert.throws(() => createIsland(hero(), max => max), /Zufallswert/);
});
