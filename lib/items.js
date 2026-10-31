import { randomInt } from 'node:crypto';

export const RARITIES = Object.freeze([
  Object.freeze({ id: 'common', name: 'Gewöhnlich', weight: 60, recycleXp: 2, color: '#758178' }),
  Object.freeze({ id: 'rare', name: 'Selten', weight: 28, recycleXp: 4, color: '#387eaf' }),
  Object.freeze({ id: 'epic', name: 'Episch', weight: 10, recycleXp: 7, color: '#8b55b1' }),
  Object.freeze({ id: 'legendary', name: 'Legendär', weight: 2, recycleXp: 10, color: '#bc862a' }),
]);

export const SLOTS = Object.freeze([
  Object.freeze({ id: 'helmet', name: 'Helm' }),
  Object.freeze({ id: 'chest', name: 'Brustplatte' }),
  Object.freeze({ id: 'hand1', name: 'Hand 1' }),
  Object.freeze({ id: 'hand2', name: 'Hand 2' }),
  Object.freeze({ id: 'necklace', name: 'Kette' }),
  Object.freeze({ id: 'ring', name: 'Ring' }),
]);

export const POTIONS = Object.freeze([
  Object.freeze({ id: 'potionSmall', name: 'Kleiner Heiltrank', healing: 20 }),
  Object.freeze({ id: 'potion', name: 'Mittlerer Heiltrank', healing: 35 }),
  Object.freeze({ id: 'potionLarge', name: 'Großer Heiltrank', healing: 60 }),
]);

const prefixes = {
  m: ['Schlichter', 'Seltener', 'Epischer', 'Legendärer'],
  f: ['Schlichte', 'Seltene', 'Epische', 'Legendäre'],
  n: ['Schlichtes', 'Seltenes', 'Episches', 'Legendäres'],
};

// Each design has one immutable template per rarity. Only templates determine
// bonus values; an inventory entry contains an instance ID and a template ID.
const designs = [
  { id: 'scout', type: 'helmet', name: 'Späherkapuze', gender: 'f', description: 'Eine leichte Kapuze für einen kühlen Kopf.', bonuses: { health: [3, 5, 8, 12], focus: [0, 1, 1, 2] } },
  { id: 'guardian', type: 'helmet', name: 'Hüterhelm', gender: 'm', description: 'Gut geschützt bleibt dein Held länger standhaft.', bonuses: { health: [2, 4, 6, 9], defense: [1, 1, 2, 2] } },
  { id: 'warden', type: 'chest', name: 'Wächterpanzer', gender: 'm', description: 'Eine verlässliche Brustplatte für mutige Duelle.', bonuses: { health: [5, 9, 14, 20], defense: [0, 1, 1, 2] } },
  { id: 'rune', type: 'chest', name: 'Runenweste', gender: 'f', description: 'Eingestickte Runen stärken Körper und Konzentration.', bonuses: { health: [4, 7, 11, 16], focus: [1, 1, 2, 3] } },
  { id: 'sun', type: 'weapon', name: 'Sonnenklinge', gender: 'f', description: 'Eine Trainingsklinge mit einem warmen Leuchten.', bonuses: { attack: [2, 3, 4, 6] } },
  { id: 'rune', type: 'weapon', name: 'Runenstab', gender: 'm', description: 'Bündelt deine Konzentration für kräftige Fokusstöße.', bonuses: { attack: [0, 1, 1, 2], focus: [2, 3, 4, 6] } },
  { id: 'oak', type: 'shield', name: 'Eichenschild', gender: 'm', description: 'Ein robuster Schild, der Treffer zuverlässig abfängt.', bonuses: { defense: [1, 2, 3, 4], health: [1, 2, 3, 4] } },
  { id: 'mirror', type: 'shield', name: 'Spiegelschild', gender: 'm', description: 'Glänzende Runen verbinden Schutz mit klarem Fokus.', bonuses: { defense: [1, 1, 2, 3], focus: [0, 1, 2, 3] } },
  { id: 'focus', type: 'necklace', name: 'Fokusamulett', gender: 'n', description: 'Ein ruhiger Blick auf dieses Amulett schärft den Geist.', bonuses: { focus: [1, 2, 3, 4], health: [0, 1, 2, 3] } },
  { id: 'courage', type: 'necklace', name: 'Mutmedaillon', gender: 'n', description: 'Eine kleine Erinnerung an deinen großen Mut.', bonuses: { attack: [1, 2, 3, 4], health: [1, 2, 3, 4] } },
  { id: 'spark', type: 'ring', name: 'Funkenring', gender: 'm', description: 'Ein kleiner Funke begleitet jeden entschlossenen Angriff.', bonuses: { attack: [1, 1, 2, 3], focus: [0, 1, 1, 2] } },
  { id: 'life', type: 'ring', name: 'Lebensring', gender: 'm', description: 'Ein grüner Stein gibt deinem Helden neue Ausdauer.', bonuses: { health: [3, 5, 8, 12], defense: [0, 0, 1, 1] } },
];

export const ITEMS = Object.freeze(designs.flatMap(design => RARITIES.map((rarity, index) => {
  const bonuses = {};
  for (const [stat, values] of Object.entries(design.bonuses)) {
    if (values[index] > 0) bonuses[stat] = values[index];
  }
  return Object.freeze({
    id: `${design.type}-${design.id}-${rarity.id}`,
    name: `${prefixes[design.gender][index]} ${design.name}`,
    type: design.type,
    rarity: rarity.id,
    bonuses: Object.freeze(bonuses),
    description: design.description,
  });
})));

const templateById = new Map(ITEMS.map(item => [item.id, item]));
const rarityById = new Map(RARITIES.map(rarity => [rarity.id, rarity]));
const slotTypes = Object.freeze({
  helmet: ['helmet'], chest: ['chest'], hand1: ['weapon', 'shield'],
  hand2: ['weapon', 'shield'], necklace: ['necklace'], ring: ['ring'],
});

function objectValue(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;

/** Preserve old medium-potion counts and all structurally valid item entries. */
export function normalizeInventory(raw) {
  const value = objectValue(raw);
  return {
    potion: count(value.potion),
    potionSmall: count(value.potionSmall),
    potionLarge: count(value.potionLarge),
    chests: count(value.chests),
    // Unknown templates are retained so that a newer catalogue never loses
    // stored instances when opened by an older application version.
    items: Array.isArray(value.items) ? value.items.filter(entry => entry &&
      typeof entry.id === 'string' && entry.id.trim() &&
      typeof entry.templateId === 'string' && entry.templateId.trim())
      .map(entry => ({ id: entry.id, templateId: entry.templateId })) : [],
  };
}

export function normalizeEquipment(raw) {
  const value = objectValue(raw);
  return Object.fromEntries(SLOTS.map(slot => [slot.id,
    typeof value[slot.id] === 'string' && value[slot.id].trim() ? value[slot.id] : null]));
}

/** Resolve every stat from the trusted catalogue, never from a client entry. */
export function resolveItem(entry) {
  if (!entry || typeof entry.id !== 'string' || typeof entry.templateId !== 'string') return null;
  const template = templateById.get(entry.templateId);
  if (!template) return null;
  return { ...template, id: entry.id, templateId: template.id,
    bonuses: { ...template.bonuses }, recycleXp: rarityById.get(template.rarity).recycleXp };
}

export function compatibleSlot(item, slot) {
  return Boolean(item && Object.hasOwn(slotTypes, slot) && slotTypes[slot].includes(item.type));
}

export function equipmentBonuses(inventory, equipment) {
  const owned = normalizeInventory(inventory);
  const worn = normalizeEquipment(equipment);
  const entries = new Map(owned.items.map(item => [item.id, item]));
  const counted = new Set();
  const result = { attack: 0, focus: 0, health: 0, defense: 0 };
  for (const slot of SLOTS) {
    const id = worn[slot.id];
    if (!id || counted.has(id)) continue;
    const item = resolveItem(entries.get(id));
    if (!compatibleSlot(item, slot.id)) continue;
    counted.add(id);
    for (const stat of Object.keys(result)) result[stat] += item.bonuses[stat] || 0;
  }
  return result;
}

function rollRarity(randomIntFn) {
  const roll = randomIntFn(100);
  let edge = 0;
  for (const rarity of RARITIES) {
    edge += rarity.weight;
    if (roll < edge) return rarity.id;
  }
  throw new Error('Der Zufallswert liegt außerhalb des gültigen Bereichs.');
}

/** Server-side randomness; injected integer draws make boundary tests exact. */
export function rollChest(randomIntFn = randomInt) {
  const amount = 1 + randomIntFn(2);
  const drops = [];
  for (let index = 0; index < amount; index++) {
    const rarity = rollRarity(randomIntFn);
    if (randomIntFn(4) === 0) {
      const potionId = rarity === 'common' ? 'potionSmall' : rarity === 'rare' ? 'potion' : 'potionLarge';
      drops.push({ kind: 'potion', potionId, rarity });
    } else {
      const pool = ITEMS.filter(item => item.rarity === rarity);
      const item = pool[randomIntFn(pool.length)];
      drops.push({ kind: 'equipment', templateId: item.id });
    }
  }
  return drops;
}

export function catalogue() {
  return structuredClone({ items: ITEMS, rarities: RARITIES, slots: SLOTS, potions: POTIONS });
}
