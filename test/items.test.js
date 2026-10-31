import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RARITIES, SLOTS, POTIONS, ITEMS, normalizeInventory, normalizeEquipment,
  resolveItem, compatibleSlot, equipmentBonuses, rollChest, catalogue,
} from '../lib/items.js';

function draws(sequence) {
  let index = 0;
  const random = max => {
    assert.ok(index < sequence.length, 'unexpected random draw');
    const value = sequence[index++];
    assert.ok(value >= 0 && value < max, `${value} must be inside [0, ${max})`);
    return value;
  };
  random.used = () => index;
  return random;
}

const entry = (templateId, id = templateId + '-instance') => ({ id, templateId });

test('catalogue supplies all six categories at every agreed rarity and three potion sizes', () => {
  assert.deepEqual(RARITIES.map(r => r.weight), [60, 28, 10, 2]);
  assert.deepEqual(RARITIES.map(r => r.recycleXp), [2, 4, 7, 10]);
  assert.equal(RARITIES.reduce((sum, rarity) => sum + rarity.weight, 0), 100);
  assert.equal(SLOTS.length, 6);
  assert.equal(ITEMS.length, 48);
  assert.equal(new Set(ITEMS.map(item => item.id)).size, ITEMS.length);
  for (const rarity of RARITIES) for (const type of ['helmet', 'chest', 'weapon', 'shield', 'necklace', 'ring']) {
    assert.equal(ITEMS.filter(item => item.rarity === rarity.id && item.type === type).length, 2);
  }
  assert.deepEqual(POTIONS.map(p => p.healing), [20, 35, 60]);
});

test('legacy inventories retain medium potions and unknown instances without sharing objects', () => {
  const old = { potion: 4 };
  assert.deepEqual(normalizeInventory(old), { potion: 4, potionSmall: 0, potionLarge: 0, chests: 0, items: [] });
  const raw = { potion: 2, potionSmall: 3, potionLarge: 1, chests: 4,
    items: [entry('weapon-sun-common'), entry('future-item'), null, { id: '', templateId: 'invalid' }] };
  const normalized = normalizeInventory(JSON.stringify(raw));
  assert.equal(normalized.items.length, 2);
  assert.equal(normalized.items[1].templateId, 'future-item');
  normalized.items[0].id = 'changed';
  assert.notEqual(normalized.items[0].id, raw.items[0].id);
  assert.equal(resolveItem(normalized.items[1]), null);
});

test('inventory normalization rejects impossible counts and equipment knows only the six slots', () => {
  assert.deepEqual(normalizeInventory({ potion: -1, potionSmall: 1.5, potionLarge: '3', chests: Infinity }),
    { potion: 0, potionSmall: 0, potionLarge: 0, chests: 0, items: [] });
  for (const invalid of [null, undefined, [], 'bad JSON']) assert.equal(normalizeInventory(invalid).potion, 0);
  assert.deepEqual(normalizeEquipment({ helmet: 'h', hand1: 's', hand2: ' ', invalid: 'x' }),
    { helmet: 'h', chest: null, hand1: 's', hand2: null, necklace: null, ring: null });
});

test('resolved items use catalogue bonuses and values instead of untrusted extra fields', () => {
  const resolved = resolveItem({ ...entry('weapon-sun-common'), bonuses: { attack: 9999 }, rarity: 'legendary', recycleXp: 999 });
  assert.equal(resolved.bonuses.attack, 2);
  assert.equal(resolved.rarity, 'common');
  assert.equal(resolved.recycleXp, 2);
  assert.equal(resolved.id, 'weapon-sun-common-instance');
  resolved.bonuses.attack = 999;
  assert.equal(resolveItem(entry('weapon-sun-common')).bonuses.attack, 2);
  assert.equal(resolveItem({ id: 'x', templateId: 'missing' }), null);
  assert.equal(resolveItem(null), null);
});

test('both hand slots accept shields and weapons, while body and jewelry slots remain distinct', () => {
  for (const slot of ['hand1', 'hand2']) {
    assert.equal(compatibleSlot(resolveItem(entry('weapon-sun-common')), slot), true);
    assert.equal(compatibleSlot(resolveItem(entry('shield-oak-legendary')), slot), true);
    assert.equal(compatibleSlot(resolveItem(entry('helmet-scout-common')), slot), false);
  }
  assert.equal(compatibleSlot(resolveItem(entry('ring-life-common')), 'ring'), true);
  assert.equal(compatibleSlot(resolveItem(entry('ring-life-common')), 'necklace'), false);
  assert.equal(compatibleSlot(resolveItem(entry('helmet-scout-common')), 'helmet'), true);
  assert.equal(compatibleSlot({ type: 'weapon' }, '__proto__'), false);
  assert.equal(compatibleSlot(null, 'hand1'), false);
});

test('equipment sums only owned compatible templates and never counts one instance twice', () => {
  const weapon = entry('weapon-sun-common', 'w');
  const shield = entry('shield-oak-legendary', 's');
  const helmet = entry('helmet-scout-rare', 'h');
  const inventory = { items: [weapon, shield, helmet, entry('future-item', 'u')] };
  assert.deepEqual(equipmentBonuses(inventory, { hand1: 'w', hand2: 'w', helmet: 'h', ring: 's' }),
    { attack: 2, focus: 1, health: 5, defense: 0 });
  assert.deepEqual(equipmentBonuses(inventory, { hand1: 'w', hand2: 's', helmet: 'h', ring: 'missing' }),
    { attack: 2, focus: 1, health: 9, defense: 4 });
  assert.deepEqual(equipmentBonuses(inventory, { hand1: 'u', helmet: 'w' }),
    { attack: 0, focus: 0, health: 0, defense: 0 });
});

test('rarity boundaries implement exactly 60/28/10/2 equipment draw outcomes', () => {
  const observed = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (let roll = 0; roll < 100; roll++) {
    const drops = rollChest(draws([0, roll, 1, 0]));
    assert.equal(drops.length, 1);
    assert.equal(drops[0].kind, 'equipment');
    observed[ITEMS.find(item => item.id === drops[0].templateId).rarity]++;
  }
  assert.deepEqual(observed, { common: 60, rare: 28, epic: 10, legendary: 2 });
});

test('every chest contains one or two independent drops, including repeated templates', () => {
  const random = draws([1, 0, 1, 0, 99, 1, 11]);
  const drops = rollChest(random);
  assert.equal(drops.length, 2);
  assert.equal(ITEMS.find(item => item.id === drops[0].templateId).rarity, 'common');
  assert.equal(ITEMS.find(item => item.id === drops[1].templateId).rarity, 'legendary');
  assert.equal(random.used(), 7);
  const duplicate = rollChest(draws([1, 0, 1, 0, 0, 1, 0]));
  assert.equal(duplicate[0].templateId, duplicate[1].templateId);
});

test('one of four category draws yields potions of the appropriate size', () => {
  const cases = [[0, 'potionSmall', 'common'], [60, 'potion', 'rare'], [88, 'potionLarge', 'epic'], [98, 'potionLarge', 'legendary']];
  for (const [roll, potionId, rarity] of cases) {
    assert.deepEqual(rollChest(draws([0, roll, 0])), [{ kind: 'potion', potionId, rarity }]);
  }
  const kinds = [0, 1, 2, 3].map(category => rollChest(draws(category === 0 ? [0, 0, category] : [0, 0, category, 0]))[0].kind);
  assert.deepEqual(kinds, ['potion', 'equipment', 'equipment', 'equipment']);
});

test('catalogue returns independent serializable metadata', () => {
  const first = catalogue();
  first.items[0].bonuses.health = 999;
  first.slots[0].name = 'changed';
  const next = catalogue();
  assert.notEqual(next.items[0].bonuses.health, 999);
  assert.equal(next.slots[0].name, 'Helm');
  assert.doesNotThrow(() => JSON.stringify(next));
});
