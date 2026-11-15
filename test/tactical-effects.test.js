import test from 'node:test';
import assert from 'node:assert/strict';
import { combatEventVisual, playBattleEvents, isAnimating, cancelBattleEffects } from '../public/battle-effects.js';
import { initializeTactics, executeTacticalAction } from '../lib/tactics.js';

function fighter(id, ancestry, abilities, hp = 60) {
  const result = { id, characterName: id, hp, maxHp: 100,
    stats: { attackDamage: 30, focusDamage: 40, defense: 0 }, guarding: false };
  initializeTactics(result, { ancestry, level: 5, abilityLoadout: abilities });
  result.energy = 6;
  return result;
}

test('a real zero-damage marking event pulses the target without becoming a self shield', () => {
  const actor = fighter('elf', 'aether-elf', ['mark', 'aether-bolt', 'aether-shield']);
  const target = fighter('foe', 'aether-dusk', ['dune-cleave', 'heavy-strike', 'mark']);
  const result = executeTacticalAction({ actor, target, action: 'ability:mark' });
  assert.equal(result.events.length, 1);
  const event = result.events[0], before = structuredClone(event);
  assert.equal(event.damage, 0);
  const feedback = combatEventVisual(event);
  assert.equal(feedback.action, 'mark');
  assert.equal(feedback.recipientId, target.id);
  assert.equal(feedback.caption, 'Markiert');
  assert.deepEqual(event, before);
  assert.equal(combatEventVisual({ ...event, action: 'ability:mark' }).action, 'mark');
});

test('party protection uses each actual recipient and life steal heals its caster in a separate event', () => {
  const warden = fighter('warden', 'cloud-warden', ['sky-sanctuary', 'heavy-strike', 'mark']);
  const friend = fighter('friend', 'aether-druid', ['thorn-bind', 'mend', 'mark']);
  const foe = fighter('foe', 'aether-dusk', ['dusk-reversal', 'heavy-strike', 'mark']);
  const shelter = executeTacticalAction({ actor: warden, target: foe, allies: [warden, friend], action: 'ability:sky-sanctuary' });
  assert.deepEqual(shelter.events.map(event => combatEventVisual(event).recipientId).sort(), ['friend', 'warden']);
  for (const event of shelter.events) {
    assert.equal(combatEventVisual(event).action, 'guard');
    assert.ok(event.healing > 0);
  }
  const reversal = executeTacticalAction({ actor: foe, target: friend, action: 'ability:dusk-reversal' });
  const hit = reversal.events.find(event => event.damage > 0), heal = reversal.events.find(event => event.healing > 0);
  assert.equal(combatEventVisual(hit).action, 'attack');
  assert.equal(combatEventVisual(hit).recipientId, friend.id);
  assert.equal(combatEventVisual(heal).action, 'heal');
  assert.equal(combatEventVisual(heal).recipientId, foe.id);
});

test('visual ability classification uses catalogue metadata and preserves ordinary combat feedback', () => {
  assert.equal(combatEventVisual({ action: 'ability:aether-bolt', actorId: 'a', targetId: 'b', damage: 30 }).action, 'focus');
  assert.equal(combatEventVisual({ action: 'ability:shield-break', actorId: 'a', targetId: 'b', damage: 20 }).action, 'attack');
  assert.equal(combatEventVisual({ action: 'potion', actorId: 'a', targetId: 'a', healing: 20 }).recipientId, 'a');
  assert.equal(combatEventVisual({ action: 'guard', actorId: 'a', targetId: 'b' }).recipientId, 'a');
  assert.equal(combatEventVisual({ action: 'ability:invented', abilityId: 'mend', actorId: 'a', targetId: 'b' }), null);
  assert.equal(combatEventVisual({ action: 4 }), null);
});

function fakeBattleDocument(t) {
  const previous = { document: globalThis.document, Node: globalThis.Node, matchMedia: globalThis.matchMedia };
  const appended = [], widthChanges = { self: [], other: [] };
  const makeFighter = (id, hp) => {
    let width = `${hp}%`;
    const style = {};
    Object.defineProperty(style, 'width', { get: () => width, set(value) { width = value; widthChanges[id].push(value); } });
    const avatar = { append(node) { appended.push({ id, node }); }, getBoundingClientRect: () => ({ left: id === 'self' ? 0 : 200 }) };
    const value = { textContent: `${hp} / 100`, firstChild: { nodeType: 3, nodeValue: String(hp) } };
    return { dataset: { hp, maxHp: 100 }, querySelector(selector) {
      return selector === '.health-label strong' ? value : selector === '.health-track > span' ? { style } : selector === '.fighter-avatar' ? avatar : null;
    } };
  };
  const self = makeFighter('self', 80), other = makeFighter('other', 50);
  const panel = { isConnected: true, dataset: { battleId: 'effects-test' }, classList: { add() {}, remove() {} },
    querySelector: selector => selector === '.fighter.self' ? self : selector === '.fighter.opponent' ? other : null };
  globalThis.Node = { TEXT_NODE: 3 };
  globalThis.matchMedia = () => ({ matches: true });
  globalThis.document = { querySelectorAll: () => [panel], createElement: () => ({ style: { setProperty() {} }, setAttribute() {}, remove() {} }) };
  t.after(() => {
    cancelBattleEffects();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  return { appended, widthChanges };
}

test('DOM feedback animates a recipient heal, accepts tactical events and leaves server events unchanged', async t => {
  const { appended, widthChanges } = fakeBattleDocument(t);
  const events = [{ id: 1, action: 'ability:mend', actorId: 'self', targetId: 'other', damage: 0, healing: 20 }];
  const before = structuredClone(events);
  await playBattleEvents(events, { userId: 'self', battleId: 'effects-test' });
  assert.ok(widthChanges.other.includes('30%'), 'Reconstruct the recipient HP before healing.');
  assert.ok(widthChanges.other.includes('50%'));
  assert.ok(widthChanges.self.every(value => value === '80%'), 'The caster does not receive the ally heal.');
  assert.ok(appended.some(({ id, node }) => id === 'other' && node.textContent === '+20 LP'));
  assert.deepEqual(events, before);
  assert.equal(isAnimating(), false);
});
