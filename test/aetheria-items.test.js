import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ITEMS, RARITIES, SLOTS, catalogue, compatibleSlot, resolveItem, rollChest } from '../lib/items.js';
import { getCombatStats } from '../lib/combat.js';

const legacy = ITEMS.filter(item => item.visualStyle === 'classic');
const themed = ITEMS.filter(item => item.visualStyle !== 'classic');
const origins = ['Silberwind', 'Zephyria', 'Nebelheim', 'Himmelsruhe', 'Ätherhain', 'Äthkern'];
const types = ['helmet', 'chest', 'weapon', 'shield', 'necklace', 'ring'];
const stats = ['attack', 'focus', 'health', 'defense'];
const instance = template => ({ id: `${template.id}-owned`, templateId: template.id });

test('all original item IDs, names, bonuses and descriptions stay unchanged after the catalogue expansion', () => {
  assert.equal(legacy.length, 48);
  const originalFields = legacy.map(({ id, name, type, rarity, bonuses, description }) =>
    ({ id, name, type, rarity, bonuses, description }));
  // Digest of the 0.8 catalogue: old inventories and saved combat bonuses retain
  // their original definitions, even as more templates enter the chest pool.
  assert.equal(createHash('sha256').update(JSON.stringify(originalFields)).digest('hex'),
    'a16e450cb6a1bbd93b00acea37f3690d1d0184f382c743824e0e4771f5106e5e');
});

test('six Aetheria collections cover every equipment category at every rarity without ancestry restrictions', () => {
  assert.equal(themed.length, 144);
  assert.deepEqual([...new Set(themed.map(item => item.origin))], origins);
  assert.equal(new Set(themed.map(item => item.setName)).size, 6);
  for (const origin of origins) {
    const collection = themed.filter(item => item.origin === origin);
    assert.equal(collection.length, 24);
    assert.equal(new Set(collection.map(item => item.visualStyle)).size, 1);
    for (const rarity of RARITIES) {
      for (const type of types) {
        const items = collection.filter(item => item.type === type && item.rarity === rarity.id);
        assert.equal(items.length, 1, `${origin}: ${type}/${rarity.id}`);
        const item = items[0];
        assert.ok(item.description && item.name && item.setName && item.visualStyle);
        assert.equal('requiredAncestry' in item, false);
        const slots = SLOTS.filter(slot => compatibleSlot(item, slot.id)).map(slot => slot.id);
        assert.deepEqual(slots, type === 'weapon' || type === 'shield' ? ['hand1', 'hand2'] : [type]);
        if (type === 'weapon') assert.ok(['blade', 'staff', 'spear', 'hammer'].includes(item.weaponShape));
        else assert.equal(item.weaponShape, null);
      }
    }
  }
});

test('new equipment stays within the existing per-category rarity budgets and has monotonic bonuses', () => {
  for (const item of themed) {
    const previous = legacy.filter(old => old.type === item.type && old.rarity === item.rarity);
    const budget = Math.max(...previous.map(old => Object.values(old.bonuses).reduce((sum, value) => sum + value, 0)));
    assert.ok(Object.values(item.bonuses).reduce((sum, value) => sum + value, 0) <= budget, item.id);
    for (const [stat, value] of Object.entries(item.bonuses)) {
      assert.ok(stats.includes(stat));
      assert.ok(Number.isSafeInteger(value) && value > 0);
      assert.ok(value <= Math.max(...previous.map(old => old.bonuses[stat] || 0)), `${item.id}/${stat}`);
    }
  }
  for (const base of themed.filter(item => item.rarity === 'common')) {
    const family = RARITIES.map(rarity => themed.find(item => item.origin === base.origin && item.type === base.type && item.rarity === rarity.id));
    for (const stat of stats) {
      for (let i = 1; i < family.length; i++) assert.ok((family[i].bonuses[stat] || 0) >= (family[i - 1].bonuses[stat] || 0));
    }
  }
});

test('every new equipment template can actually be drawn from the normal teacher chest pool', () => {
  const rarityRoll = { common: 0, rare: 60, epic: 88, legendary: 98 };
  for (const item of themed) {
    const pool = ITEMS.filter(candidate => candidate.rarity === item.rarity);
    const draws = [0, rarityRoll[item.rarity], 1, pool.findIndex(candidate => candidate.id === item.id)];
    const result = rollChest(max => {
      assert.ok(draws.length > 0);
      const value = draws.shift();
      assert.ok(value >= 0 && value < max);
      return value;
    });
    assert.deepEqual(result, [{ kind: 'equipment', templateId: item.id }]);
    assert.equal(draws.length, 0);
  }
});

test('full cultural loadouts produce their intended attack, focus and endurance profiles', () => {
  const equippedStats = {};
  for (const origin of origins) {
    const items = themed.filter(item => item.origin === origin && item.rarity === 'rare');
    const equipment = Object.fromEntries(items.map(item => [item.type === 'weapon' ? 'hand1' : item.type === 'shield' ? 'hand2' : item.type, instance(item).id]));
    equippedStats[origin] = getCombatStats({ skills: { strength: 1, focus: 1, endurance: 1 },
      inventory: { items: items.map(instance) }, equipment });
    assert.ok(equippedStats[origin].maxHp > 92);
    assert.ok(equippedStats[origin].attackDamage > 14);
  }
  assert.ok(equippedStats.Zephyria.attackDamage > equippedStats.Silberwind.attackDamage);
  assert.ok(equippedStats['Äthkern'].attackDamage > equippedStats['Ätherhain'].attackDamage);
  assert.ok(equippedStats.Silberwind.focusDamage > equippedStats.Zephyria.focusDamage);
  assert.ok(equippedStats['Ätherhain'].focusDamage > equippedStats['Äthkern'].focusDamage);
  assert.ok(equippedStats.Nebelheim.maxHp > equippedStats.Silberwind.maxHp);
});

test('new visual metadata and bonuses come only from the trusted catalogue', () => {
  const forged = resolveItem({ id: 'owned-staff', templateId: 'weapon-silberlaub-rare',
    origin: 'Fake', setName: 'Admin', visualStyle: 'gear', weaponShape: 'hammer', rarity: 'legendary',
    bonuses: { attack: 99999 }, recycleXp: 99999 });
  assert.equal(forged.origin, 'Silberwind');
  assert.equal(forged.setName, 'Silberlaub');
  assert.equal(forged.visualStyle, 'leaf');
  assert.equal(forged.weaponShape, 'staff');
  assert.equal(forged.rarity, 'rare');
  assert.deepEqual(forged.bonuses, { attack: 1, focus: 3 });
  assert.equal(forged.recycleXp, 4);
  const first = catalogue();
  const item = first.items.find(item => item.id === forged.templateId);
  item.visualStyle = 'gear'; item.bonuses.focus = 999;
  assert.equal(resolveItem(forged).visualStyle, 'leaf');
  assert.equal(resolveItem(forged).bonuses.focus, 3);
});
