import test from 'node:test';
import assert from 'node:assert/strict';
import { COSMETICS, cosmeticCatalogue, normalizeCosmetics } from '../lib/cosmetics.js';

test('cosmetic catalogue includes tower, golem and island rewards without combat bonuses', () => {
  assert.equal(COSMETICS.length, 18);
  assert.equal(COSMETICS.filter(item => item.type === 'companion').length, 10);
  assert.equal(COSMETICS.filter(item => item.type === 'outfit').length, 4);
  assert.equal(COSMETICS.filter(item => item.type === 'trophy').length, 4);
  assert.equal(new Set(COSMETICS.map(item => item.id)).size, 18);
  for (const id of ['pet-tide', 'outfit-pathfinder', 'trophy-island']) assert.ok(COSMETICS.some(item => item.id === id));
  for (const item of COSMETICS) {
    assert.ok(item.source && item.name && item.description && item.color);
    assert.equal('bonuses' in item, false);
    assert.equal('xp' in item, false);
  }
});

test('selected cosmetics require actual ownership and their matching cosmetic type', () => {
  assert.deepEqual(normalizeCosmetics({ selected: { companion: 'pet-rune', outfit: 'outfit-starlight' } }),
    { owned: [], selected: { companion: null, outfit: null } });
  assert.deepEqual(normalizeCosmetics({ owned: ['pet-rune', 'outfit-starlight', 'trophy-golem'],
    selected: { companion: 'pet-rune', outfit: 'outfit-starlight' } }),
  { owned: ['pet-rune', 'outfit-starlight', 'trophy-golem'], selected: { companion: 'pet-rune', outfit: 'outfit-starlight' } });
  const wrongTypes = normalizeCosmetics({ owned: ['pet-rune', 'outfit-starlight', 'trophy-golem'],
    selected: { companion: 'trophy-golem', outfit: 'pet-rune' } });
  assert.equal(wrongTypes.selected.companion, null);
  assert.equal(wrongTypes.selected.outfit, null);
});

test('normalization removes duplicate and unknown unlock IDs without sharing input arrays', () => {
  const input = { owned: ['pet-cloud', 'pet-cloud', 'free-xp', {}, null],
    selected: { companion: 'pet-cloud', outfit: '__proto__' }, bonuses: { attack: 999 }, xp: 9999 };
  const output = normalizeCosmetics(input);
  assert.deepEqual(output, { owned: ['pet-cloud'], selected: { companion: 'pet-cloud', outfit: null } });
  output.owned.push('pet-rune');
  assert.equal(input.owned.length, 5);
  assert.deepEqual(normalizeCosmetics(null), { owned: [], selected: { companion: null, outfit: null } });
  assert.deepEqual(normalizeCosmetics([]), { owned: [], selected: { companion: null, outfit: null } });
});

test('catalogue callers receive independent mutable copies', () => {
  const catalogue = cosmeticCatalogue();
  catalogue[0].name = 'Changed';
  catalogue.push({ id: 'fake' });
  assert.equal(cosmeticCatalogue().length, 18);
  assert.equal(cosmeticCatalogue()[0].name, 'Glühwürmchen');
});
