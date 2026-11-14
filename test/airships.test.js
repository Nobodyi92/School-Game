import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { AIRSHIPS, SHIP_PARTS, SHIP_DOCKS, SHIP_SLOTS, walletFor, formatMoney,
  moneyRangeForLevel, shipStats, journeyDurationMs, partsForAdventureRewards } from '../shared/airships.js';
import { grantShipParts, rollChestCoins } from '../lib/airships.js';

test('Aetheria currency converts exactly without changing the total', () => {
  assert.deepEqual(walletFor(1037), { total: 1037, krona: 1, thal: 3, aetherlings: 7 });
  assert.deepEqual(walletFor(1000), { total: 1000, krona: 1, thal: 0, aetherlings: 0 });
  assert.equal(formatMoney(1037), '1 Krona · 3 Thal · 7 Ätherlinge');
  assert.equal(formatMoney(walletFor(1037)), formatMoney(1037));
  assert.equal(formatMoney(0), '0 Ätherlinge');
  for (const invalid of [-1, 1.5, NaN, Infinity, '100', Number.MAX_SAFE_INTEGER + 1]) assert.equal(walletFor(invalid).total, 0);
});

test('chest money uses inclusive player-level ranges and rejects an invalid RNG', () => {
  for (const [level, range] of [[1, { min: 15, max: 30 }], [5, { min: 35, max: 70 }], [10, { min: 60, max: 120 }]]) {
    assert.deepEqual(moneyRangeForLevel(level), range);
    assert.equal(rollChestCoins(level, (min, exclusive) => { assert.equal(exclusive, range.max + 1); return min; }), range.min);
    assert.equal(rollChestCoins(level, (min, exclusive) => exclusive - 1), range.max);
    for (const invalid of [range.min - 1, range.max + 1, NaN, 35.5]) assert.throws(() => rollChestCoins(level, () => invalid), RangeError);
  }
  assert.deepEqual(moneyRangeForLevel(-999), moneyRangeForLevel(1));
  assert.deepEqual(moneyRangeForLevel(1000), moneyRangeForLevel(100));
});

test('three ship tiers and eighteen permanent regional designs have complete travel metadata', () => {
  assert.deepEqual(AIRSHIPS.map(ship => [ship.id, ship.minLevel, ship.price]), [
    ['windling', 5, 250], ['himmelsfalter', 5, 750], ['aetherarche', 10, 3000],
  ]);
  assert.equal(SHIP_PARTS.length, 18);
  assert.equal(new Set(SHIP_PARTS.map(part => part.id)).size, 18);
  for (const slot of SHIP_SLOTS) assert.equal(SHIP_PARTS.filter(part => part.slot === slot).length, 6);
  assert.equal(new Set(SHIP_PARTS.map(part => part.origin)).size, 6);
  for (const part of SHIP_PARTS) {
    assert.match(part.colors.primary, /^#[\da-f]{6}$/i);
    assert.ok(part.visualStyle && part.pattern && part.source.includes('Spielerlevel 5'));
    assert.deepEqual(Object.keys(part.bonuses), ['speed', 'stability', 'navigation']);
    assert.ok(Object.values(part.bonuses).some(value => value > 0));
  }
  assert.equal(SHIP_PARTS.find(part => part.id === 'flag-zephyria').source, 'Turm: Etage 6 abschließen und Funde sichern. Ab Spielerlevel 5.');
  assert.equal(SHIP_PARTS.find(part => part.id === 'sails-himmelsruhe').source, 'Turm: Etage 8 abschließen und Funde sichern. Ab Spielerlevel 5.');
});

test('only trusted matching-slot designs change a model and no design changes character combat', () => {
  const base = shipStats('windling');
  assert.deepEqual(shipStats({ id: 'windling', stats: { speed: 999999 } }), base);
  assert.deepEqual(shipStats('windling', { sails: 'hull-zephyria', defense: 99999, flag: '__proto__' }), base);
  const modified = shipStats('windling', { sails: 'sails-zephyria', hull: 'hull-aetherhain', flag: 'flag-himmelsruhe' });
  assert.equal(modified.speed, base.speed + 12);
  assert.equal(modified.stability, base.stability + 16);
  assert.equal(modified.navigation, base.navigation + 10);
  assert.deepEqual(Object.keys(modified), ['speed', 'stability', 'navigation']);
  assert.deepEqual(shipStats('windling'), base);
  assert.equal(shipStats('made-up'), null);
});

test('each of the three ship properties reduces real journey time on the current', () => {
  assert.equal(SHIP_DOCKS.length, 5);
  assert.ok(!SHIP_DOCKS.some(dock => dock.id === 'zephyria'));
  const stats = shipStats('windling');
  const duration = journeyDurationMs(stats, 'nebelheim', 'aethkern');
  for (const stat of Object.keys(stats)) {
    assert.ok(journeyDurationMs({ ...stats, [stat]: stats[stat] + 10 }, 'nebelheim', 'aethkern') < duration, stat);
  }
  for (const ship of AIRSHIPS) for (const from of SHIP_DOCKS) for (const to of SHIP_DOCKS) {
    const time = journeyDurationMs(ship.stats, from.id, to.id);
    assert.ok(from.id === to.id ? time === 0 : time >= 4000 && time <= 45000);
    assert.equal(time, journeyDurationMs(ship.stats, to.id, from.id));
  }
  assert.equal(journeyDurationMs(stats, 'nebelheim', 'zephyria'), 0);
  assert.ok(journeyDurationMs(shipStats('aetherarche'), 'nebelheim', 'aethkern') < duration);
});

test('secured adventure proofs cover all designs, and are gated by current player level', () => {
  const proofs = ['pet-firefly', 'outfit-starlight', 'trophy-tower-bronze', 'pet-cloud', 'trophy-tower-gold',
    'pet-tide', 'outfit-pathfinder', 'trophy-island', 'trophy-golem'];
  assert.deepEqual(partsForAdventureRewards(proofs, 4), []);
  assert.deepEqual(partsForAdventureRewards(['pet-firefly', 'pet-firefly', '__proto__'], 5), ['sails-silberwind', 'flag-nebelheim']);
  assert.deepEqual(partsForAdventureRewards(proofs, 5).sort(), SHIP_PARTS.map(part => part.id).sort());
  assert.deepEqual(partsForAdventureRewards(null, 10), []);
});

test('part grants are permanent, idempotent and can be earned by repeating an old cosmetic milestone', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE airship_parts (user_id TEXT, part_id TEXT, unlocked_at TEXT, PRIMARY KEY(user_id, part_id))');
    assert.deepEqual(grantShipParts(db, 'hero', ['pet-firefly'], 4, 'before'), []);
    assert.deepEqual(grantShipParts(db, 'hero', ['pet-firefly'], 5, 'after'), ['sails-silberwind', 'flag-nebelheim']);
    assert.deepEqual(grantShipParts(db, 'hero', ['pet-firefly'], 5, 'later'), []);
    assert.deepEqual(db.prepare('SELECT DISTINCT unlocked_at FROM airship_parts').all().map(row => row.unlocked_at), ['after']);
    assert.equal(db.prepare('SELECT count(*) AS count FROM airship_parts').get().count, 2);
  } finally { db.close(); }
});
