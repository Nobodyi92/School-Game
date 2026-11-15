import test from 'node:test';
import assert from 'node:assert/strict';
import { ANCESTRIES } from '../shared/ancestries.js';
import { ABILITIES, ANCESTRY_PASSIVES, availableAbilities, defaultAbilityLoadout, normalizeAbilityLoadout } from '../shared/abilities.js';
import { createBattleState, applyAction } from '../lib/combat.js';
import { initializeTactics, executeTacticalAction, validateTacticalAction, applyTacticalDamage,
  finishTacticalTurn, gainTacticalEnergy } from '../lib/tactics.js';

const player = (id, ancestry = 'aether-elf', abilityLoadout = ['mark', 'heavy-strike', 'aether-shield'], level = 5) => ({
  id, name: id, characterName: `Held ${id}`, ancestry, level, abilityLoadout,
  skills: { strength: 2, focus: 2, endurance: 2 }, inventory: { items: [] }, equipment: {},
});
function fighter(id, ancestry = 'aether-elf', ids = ['mark', 'heavy-strike', 'aether-shield']) {
  return createBattleState(player(id, ancestry, ids), player(`${id}-enemy`)).fighters[0];
}
const cast = (actor, target, id, options = {}) => executeTacticalAction({ actor, target, action: `ability:${id}`, ...options });

test('each people has three distinct starting skills and more choices unlock with player level', () => {
  assert.equal(ABILITIES.length, 18);
  assert.equal(new Set(ABILITIES.map(ability => ability.id)).size, ABILITIES.length);
  for (const ancestry of ANCESTRIES) {
    const initial = defaultAbilityLoadout(ancestry.id, 1), available = availableAbilities(ancestry.id, 1);
    assert.equal(initial.length, 3);
    assert.equal(new Set(initial).size, 3);
    assert.ok(initial.every(id => available.some(ability => ability.id === id)));
    assert.ok(availableAbilities(ancestry.id, 3).length > available.length);
    assert.ok(availableAbilities(ancestry.id, 5).length > availableAbilities(ancestry.id, 3).length);
    assert.ok(ANCESTRY_PASSIVES[ancestry.id].name);
    assert.ok(available.every(ability => !ability.ancestry || ability.ancestry === ancestry.id));
  }
  const cleaned = normalizeAbilityLoadout(['turbine-hammer', 'mark', 'mark', 'not-a-skill'], 'aether-elf', 1);
  assert.equal(cleaned.length, 3);
  assert.equal(new Set(cleaned).size, 3);
  assert.ok(!cleaned.includes('turbine-hammer'));
  assert.deepEqual(normalizeAbilityLoadout('bad JSON', 'aether-elf', 1), defaultAbilityLoadout('aether-elf', 1));
});

test('new fights snapshot skills, level and energy; attack and guard refill with a firm cap', () => {
  const account = player('a');
  let state = createBattleState(account, player('b', 'sky-nomad'));
  assert.equal(state.tacticsVersion, 1);
  assert.equal(state.fighters[0].energy, 2);
  assert.equal(state.fighters[1].energy, 3);
  assert.equal(state.fighters[0].maxEnergy, 6);
  account.abilityLoadout[0] = 'mend'; account.level = 1;
  assert.equal(state.fighters[0].abilityLoadout[0], 'mark');
  assert.equal(state.fighters[0].combatLevel, 5);
  state = applyAction(state, 'a', 'attack').state;
  assert.equal(state.fighters[0].energy, 4);
  state = applyAction(state, 'b', 'guard').state;
  state = applyAction(state, 'a', 'guard').state;
  assert.equal(state.fighters[0].energy, 6);
  gainTacticalEnergy(state.fighters[0], 'attack');
  assert.equal(state.fighters[0].energy, 6);
  gainTacticalEnergy(state.fighters[0], 'potion');
  assert.equal(state.fighters[0].energy, 6);
});

test('changing people preserves valid skill slots and restores replaced defaults on a round trip', () => {
  const original = defaultAbilityLoadout('aether-elf', 1);
  assert.deepEqual(original, ['star-arrow', 'mark', 'aether-shield']);
  const changed = normalizeAbilityLoadout(original, 'aether-druid', 1);
  assert.deepEqual(changed, ['thorn-bind', 'mark', 'aether-shield']);
  assert.deepEqual(normalizeAbilityLoadout(changed, 'aether-elf', 1), original);
  assert.deepEqual(normalizeAbilityLoadout(['unknown', 'heavy-strike', 'mark'], 'aether-elf', 1),
    ['star-arrow', 'heavy-strike', 'mark']);
  assert.deepEqual(normalizeAbilityLoadout(['mark', 'mark', 'aether-shield'], 'aether-elf', 1),
    ['mark', 'star-arrow', 'aether-shield']);
});

test('unavailable skills, wrong allies and insufficient energy reject without spending a turn', () => {
  const state = createBattleState(player('a'), player('b'));
  const before = structuredClone(state);
  assert.throws(() => applyAction(state, 'a', 'ability:heavy-strike'), /Ätherenergie/);
  assert.throws(() => applyAction(state, 'a', 'ability:mend'), /nicht.*ausgewählt/);
  assert.throws(() => applyAction(state, 'a', 'ability:mark', {}, { targetId: 'a' }), /gegnerischen/);
  assert.throws(() => applyAction(state, 'a', 'ability:aether-shield', {}, { targetId: 'b' }), /lebendes Mitglied/);
  assert.deepEqual(state, before);
  const foreign = structuredClone(state);
  foreign.fighters[0].energy = 6; foreign.fighters[0].abilityLoadout[0] = 'turbine-hammer';
  assert.throws(() => applyAction(foreign, 'a', 'ability:turbine-hammer'), /anderen Volk/);
  foreign.fighters[0].abilityLoadout[0] = 'silver-volley'; foreign.fighters[0].combatLevel = 1;
  assert.throws(() => applyAction(foreign, 'a', 'ability:silver-volley'), /Spielerlevel/);
});

test('mark boosts precisely the next incoming hit and expires after two recipient actions', () => {
  const actor = fighter('a'), target = fighter('b');
  cast(actor, target, 'mark');
  assert.equal(actor.energy, 0);
  assert.equal(target.effects.marked.turns, 2);
  const clean = structuredClone(target); clean.effects = {};
  const enhanced = applyTacticalDamage({ actor, target, damage: 20 }).damage;
  const regular = applyTacticalDamage({ actor, target: clean, damage: 20 }).damage;
  assert.equal(enhanced, 25);
  assert.equal(regular, 20);
  assert.equal(target.effects.marked, undefined);
  actor.energy = 2; cast(actor, target, 'mark');
  finishTacticalTurn(target); assert.equal(target.effects.marked.turns, 1);
  finishTacticalTurn(target); assert.equal(target.effects.marked, undefined);
});

test('shield break removes cover and protection before the hit and marks the following attack', () => {
  const actor = fighter('a', 'aether-engineer', ['shield-break', 'heavy-strike', 'aether-shield']);
  actor.energy = 6;
  const target = fighter('b'); target.guarding = true; target.effects.protected = { turns: 2, potency: .6 };
  const result = cast(actor, target, 'shield-break');
  assert.equal(target.guarding, false);
  assert.equal(target.effects.protected, undefined);
  assert.equal(target.effects.marked.turns, 2);
  const expected = Math.round(actor.stats.attackDamage * .85 * 1.1);
  assert.equal(result.damage, expected);
  assert.equal(applyTacticalDamage({ actor, target, damage: 20 }).damage, 25);
});

test('weakened outgoing attacks and protected incoming hits consume one eligible hit', () => {
  const actor = fighter('a', 'aether-druid', ['thorn-bind', 'mend', 'aether-shield']); actor.energy = 6;
  const target = fighter('b');
  cast(actor, target, 'thorn-bind');
  const weakened = applyTacticalDamage({ actor: target, target: actor, damage: 20 });
  assert.equal(weakened.damage, 15);
  assert.equal(target.effects.weakened, undefined);
  actor.energy = 2; cast(actor, target, 'aether-shield');
  finishTacticalTurn(actor);
  assert.equal(actor.effects.protected.turns, 2, 'The application action itself does not age self protection.');
  const hit = applyTacticalDamage({ actor: target, target: actor, damage: 20 });
  assert.equal(hit.damage, 12); assert.equal(hit.blocked, true);
  assert.equal(actor.effects.protected, undefined);
  assert.equal(applyTacticalDamage({ actor: target, target: actor, damage: 20 }).damage, 20);
});

test('passives enhance special, physical, healing and protection skills without replacing base stats', () => {
  const enemy = fighter('enemy'); enemy.hp = enemy.maxHp = 500;
  const elf = fighter('elf', 'aether-elf', ['aether-bolt', 'mark', 'mend']); elf.energy = 6;
  const neutral = fighter('neutral', 'sky-nomad', ['aether-bolt', 'mark', 'mend']); neutral.energy = 6;
  assert.equal(cast(elf, structuredClone(enemy), 'aether-bolt').damage, Math.round(elf.stats.focusDamage * 1.1 * 1.1));
  assert.equal(cast(neutral, structuredClone(enemy), 'aether-bolt').damage, Math.round(neutral.stats.focusDamage * 1.1));
  const druid = fighter('druid', 'aether-druid', ['mend', 'mark', 'aether-shield']); druid.energy = 6; druid.hp = 10;
  neutral.energy = 6; neutral.hp = 10;
  assert.ok(cast(druid, enemy, 'mend').healing > cast(neutral, enemy, 'mend').healing);
  const warden = fighter('warden', 'cloud-warden', ['aether-shield', 'mark', 'mend']);
  cast(warden, enemy, 'aether-shield'); assert.equal(warden.effects.protected.potency, .5);
  const dusk = fighter('dusk', 'aether-dusk', ['heavy-strike', 'mark', 'mend']); dusk.energy = 6;
  const normalDamage = cast(dusk, structuredClone(enemy), 'heavy-strike').damage;
  dusk.hp = 10; dusk.energy = 6;
  assert.ok(cast(dusk, structuredClone(enemy), 'heavy-strike').damage > normalDamage);
});

test('ally heals and group protection emit health events for actual recipients', () => {
  const druid = fighter('druid', 'aether-druid', ['mend', 'living-grove', 'mark']); druid.energy = 6;
  const ally = fighter('ally'); ally.hp = 10;
  const enemy = fighter('enemy');
  const selfHp = druid.hp;
  const result = cast(druid, enemy, 'mend', { allies: [druid, ally], targetId: ally.id });
  assert.equal(result.events[0].targetId, ally.id);
  assert.ok(result.events[0].healing > 0);
  assert.equal(druid.hp, selfHp);
  ally.hp = ally.maxHp;
  const remaining = druid.energy;
  assert.throws(() => cast(druid, enemy, 'mend', { allies: [druid, ally], targetId: ally.id }), /bereits voll/);
  assert.equal(druid.energy, remaining);
  cast(druid, enemy, 'mend', { allies: [druid, ally], targetId: ally.id, allowFullHealth: true });
  const warden = fighter('warden', 'cloud-warden', ['sky-sanctuary', 'cloud-wall', 'mend']); warden.energy = 6;
  warden.hp -= 20; ally.hp -= 20;
  const party = cast(warden, enemy, 'sky-sanctuary', { allies: [warden, ally] });
  assert.equal(party.events.length, 2);
  assert.deepEqual(new Set(party.events.map(event => event.targetId)), new Set([warden.id, ally.id]));
  assert.ok(warden.effects.protected && ally.effects.protected);
});

test('life steal emits a separate heal event on the attacker and energy remains bounded', () => {
  const actor = fighter('dusk', 'aether-dusk', ['dusk-reversal', 'mark', 'mend']); actor.energy = 6; actor.hp = 20;
  const enemy = fighter('enemy');
  const result = cast(actor, enemy, 'dusk-reversal');
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].targetId, enemy.id);
  assert.equal(result.events[0].healing, 0);
  assert.equal(result.events[1].targetId, actor.id);
  assert.equal(result.events[1].damage, 0);
  assert.ok(result.events[1].healing > 0);
  assert.equal(actor.energy, 2);
});

test('phase damage caps cannot be bypassed by marks and protection cannot make a target immortal', () => {
  const actor = fighter('a'), target = fighter('b');
  target.effects.marked = { turns: 2, potency: .25 };
  assert.equal(applyTacticalDamage({ actor, target, damage: 999, maxDamage: 1 }).damage, 1);
  const hp = target.hp;
  assert.equal(applyTacticalDamage({ actor, target, damage: 999, damageScale: 0 }).damage, 0);
  assert.equal(target.hp, hp);
  target.stats.defense = 999; target.guarding = true; target.effects.protected = { turns: 2, potency: .75 };
  assert.equal(applyTacticalDamage({ actor, target, damage: 1 }).damage, 1);
});

test('new focus compatibility costs energy while saved legacy duels keep exact old rules', () => {
  const next = createBattleState(player('a'), player('b'));
  const result = applyAction(next, 'a', 'focus').state;
  assert.equal(result.fighters[0].energy, 0);
  const noEnergy = structuredClone(next); noEnergy.fighters[0].energy = 0;
  assert.throws(() => applyAction(noEnergy, 'a', 'focus'), /Ätherenergie/);
  const legacy = structuredClone(next); delete legacy.tacticsVersion;
  for (const hero of legacy.fighters) {
    for (const key of ['tacticsVersion', 'tacticalAncestry', 'combatLevel', 'abilityLoadout', 'energy', 'maxEnergy', 'effects']) delete hero[key];
  }
  const old = applyAction(legacy, 'a', 'focus').state;
  assert.equal(old.fighters[1].hp, legacy.fighters[1].hp - legacy.fighters[0].stats.focusDamage);
  assert.throws(() => applyAction(legacy, 'a', 'ability:mark'), /nächsten neu gestarteten/);
  const legacyBefore = structuredClone(legacy);
  assert.throws(() => validateTacticalAction({ actor: legacy.fighters[0], target: legacy.fighters[1], action: 'ability:mark' }), /nächsten/);
  assert.deepEqual(legacy, legacyBefore);
});
