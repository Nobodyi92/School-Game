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

// Cultural collections are visual families, not extra set bonuses. Every people
// can wear every design; their normal per-item bonuses follow the same budgets
// as the original equipment, keeping previously earned pieces useful.
const collections = [
  { id: 'silberlaub', origin: 'Silberwind', setName: 'Silberlaub', visualStyle: 'leaf', weaponShape: 'staff', pieces: [
    ['helmet', 'Silberlaubreif', 'm', 'Ein Reif aus silbernem Holz, wie ihn die Ätherelfen in den Baumkronen von Silberwind fertigen.', { health: [3, 5, 8, 12], focus: [0, 1, 1, 2] }],
    ['chest', 'Silberlaubweste', 'f', 'Leichtes Holz und eingewebte Blätter begleiten den Atem der Ätherelfen.', { health: [4, 7, 11, 16], focus: [1, 1, 2, 3] }],
    ['weapon', 'Lichtblattstab', 'm', 'Ein Ätherkristall zwischen silbernen Blättern bündelt das Licht für Fokusangriffe.', { attack: [0, 1, 1, 2], focus: [2, 3, 4, 6] }],
    ['shield', 'Blattspiegelschild', 'm', 'Silbernes Holz trägt einen geschliffenen Kristall aus den Werkstätten von Silberwind.', { defense: [1, 1, 2, 3], focus: [0, 1, 2, 3] }],
    ['necklace', 'Silberwindamulett', 'n', 'Ein blattförmiger Kristall erinnert an die leuchtenden Gärten zwischen den Baumhäusern.', { focus: [1, 2, 3, 4], health: [0, 1, 2, 3] }],
    ['ring', 'Morgentauring', 'm', 'Auf dem grünen Stein scheint ein Tautropfen das Licht des Äthers festzuhalten.', { focus: [0, 1, 1, 2], health: [2, 3, 5, 8] }],
  ] },
  { id: 'zahnrad', origin: 'Zephyria', setName: 'Zahnrad', visualStyle: 'gear', weaponShape: 'hammer', pieces: [
    ['helmet', 'Tüftlerbrille', 'f', 'Kräftige Messingfassungen schützen beim Arbeiten zwischen den Zahnrädern von Zephyria.', { health: [2, 4, 6, 9], defense: [1, 1, 2, 2] }],
    ['chest', 'Zahnradpanzer', 'm', 'Vernietete Metallplatten aus Zephyria schützen ihren Träger beim nächsten mutigen Schritt.', { health: [5, 9, 14, 20], defense: [0, 1, 1, 2] }],
    ['weapon', 'Ätherwerkhammer', 'm', 'Ein ausgewuchteter Werkhammer der Ätheringenieure verleiht normalen Angriffen mehr Wucht.', { attack: [2, 3, 4, 6] }],
    ['shield', 'Zahnradschild', 'm', 'Ineinandergreifende Messingsegmente verteilen den Druck eines Treffers.', { defense: [1, 2, 3, 4], health: [1, 2, 3, 4] }],
    ['necklace', 'Tüftlermedaillon', 'n', 'Ein kleines Zahnrad aus der ersten eigenen Erfindung wird zum Zeichen des Erfindergeists.', { attack: [1, 2, 3, 4], health: [1, 2, 3, 4] }],
    ['ring', 'Funkenwerk-Ring', 'm', 'Ein winziger Ätherkern schimmert im Messingring einer Zephyria-Werkstatt.', { attack: [1, 1, 2, 3], focus: [0, 1, 1, 2] }],
  ] },
  { id: 'nebelwacht', origin: 'Nebelheim', setName: 'Nebelwacht', visualStyle: 'cloud', weaponShape: 'spear', pieces: [
    ['helmet', 'Nebelwacht-Helm', 'm', 'Helle Metallbögen erinnern an die Wolken um Nebelheims höchste Gipfel.', { health: [3, 5, 8, 12], defense: [0, 1, 1, 1] }],
    ['chest', 'Wolkenhüter-Brustplatte', 'f', 'Sanft schimmernde Platten tragen die Zeichen der Wächter des Ätherstroms.', { health: [5, 9, 14, 20], defense: [0, 1, 1, 2] }],
    ['weapon', 'Gipfellicht-Speer', 'm', 'Eine helle Kristallspitze begleitet die Wolkenhüter auf ihren Wegen über die Bergkämme.', { attack: [1, 2, 3, 4], focus: [1, 1, 1, 2] }],
    ['shield', 'Wolkenwacht-Schild', 'm', 'Ein breiter Schild aus Nebelheim schützt auf den windigen Pfaden am höchsten Berg.', { defense: [1, 2, 3, 4], health: [1, 2, 3, 4] }],
    ['necklace', 'Gipfellicht-Amulett', 'n', 'Ein heller Kristall erinnert an den Ursprung des Ätherstroms hoch über Nebelheim.', { health: [1, 2, 3, 4], focus: [1, 1, 2, 3] }],
    ['ring', 'Nebelwacht-Ring', 'm', 'Ein blassblauer Stein bewahrt die Ruhe eines Wolkenhüters.', { health: [3, 5, 8, 12], defense: [0, 0, 1, 1] }],
  ] },
  { id: 'windfahrt', origin: 'Himmelsruhe', setName: 'Windfahrt', visualStyle: 'sail', weaponShape: 'blade', pieces: [
    ['helmet', 'Windfahrer-Haube', 'f', 'Eine feste Reisekappe schützt die Luftnomaden an Deck ihrer Schiffe im Ätherstrom.', { health: [3, 5, 8, 12], focus: [0, 1, 1, 2] }],
    ['chest', 'Segeltuchweste', 'f', 'Robustes Segeltuch aus Himmelsruhe lässt genug Bewegungsfreiheit für jedes Abenteuer.', { health: [4, 7, 11, 16], focus: [1, 1, 2, 3] }],
    ['weapon', 'Windsegler-Klinge', 'f', 'Eine leichte, gebogene Klinge für die vielseitigen Reisenden aus Himmelsruhe.', { attack: [1, 2, 3, 4], focus: [1, 1, 1, 2] }],
    ['shield', 'Segelstern-Schild', 'm', 'Ein gespannter Rahmen trägt das Sternenzeichen der Luftnomaden.', { defense: [1, 1, 2, 3], focus: [0, 1, 2, 3] }],
    ['necklace', 'Himmelskompass', 'm', 'Ein kleiner Kompass begleitet seine Besitzer auf den Reisen entlang des Ätherstroms.', { attack: [1, 1, 2, 3], focus: [0, 1, 1, 1], health: [1, 1, 2, 3] }],
    ['ring', 'Reisewind-Ring', 'm', 'Ein schmaler Ring erinnert an die Freiheit auf den bunten Luftschiffen von Himmelsruhe.', { attack: [1, 1, 2, 3], health: [0, 1, 2, 3] }],
  ] },
  { id: 'wurzelbund', origin: 'Ätherhain', setName: 'Wurzelbund', visualStyle: 'root', weaponShape: 'staff', pieces: [
    ['helmet', 'Mooskrone', 'f', 'Weiches Moos und biegsame Zweige bilden eine Krone aus den Nebelwäldern von Ätherhain.', { health: [3, 5, 8, 12], focus: [0, 1, 1, 2] }],
    ['chest', 'Wurzelrindenweste', 'f', 'Lebendige Rindenmuster erinnern die Druiden an das Gleichgewicht der Natur.', { health: [4, 7, 11, 16], focus: [1, 1, 2, 3] }],
    ['weapon', 'Ätherwurzelstab', 'm', 'Ein moosiger Ast trägt einen grünen Kristall, der die Konzentration der Druiden bündelt.', { attack: [0, 1, 1, 2], focus: [2, 3, 4, 6] }],
    ['shield', 'Wurzelgeflecht-Schild', 'm', 'Verflochtene Wurzeln aus Ätherhain bilden einen festen Schutz mit natürlicher Leichtigkeit.', { defense: [1, 1, 2, 3], focus: [0, 1, 2, 3] }],
    ['necklace', 'Hainherz-Amulett', 'n', 'Ein kleiner Samen in einem Kristall erinnert an die Ruhe der südlichen Nebelwälder.', { focus: [1, 2, 3, 4], health: [0, 1, 2, 3] }],
    ['ring', 'Wurzelherz-Ring', 'm', 'Moosgrüne Linien ziehen sich wie Wurzeln durch den Stein dieses Druidenrings.', { health: [3, 5, 8, 12], defense: [0, 0, 1, 1] }],
  ] },
  { id: 'sonnenglas', origin: 'Äthkern', setName: 'Sonnenglas', visualStyle: 'dune', weaponShape: 'blade', pieces: [
    ['helmet', 'Dünenwacht-Helm', 'm', 'Sandfarbene Platten und dunkles Glas schützen Reisende in den Fürstentümern um Äthkern.', { health: [2, 4, 6, 9], defense: [1, 1, 2, 2] }],
    ['chest', 'Sonnenglaspanzer', 'm', 'Dunkles Metall und bernsteinfarbenes Glas verbinden das Handwerk der Ätherdämmerer.', { health: [5, 9, 14, 20], defense: [0, 1, 1, 2] }],
    ['weapon', 'Dünenlicht-Klinge', 'f', 'Eine kraftvolle Klinge aus Äthkern schimmert wie die Wüstensonne im Ätherstrom.', { attack: [2, 3, 4, 6] }],
    ['shield', 'Sonnenglas-Schild', 'm', 'Ein warmer Glaskern sitzt fest in der dunklen Metallfassung dieses Wüstenschilds.', { defense: [1, 2, 3, 4], health: [1, 2, 3, 4] }],
    ['necklace', 'Sonnenglasmedaillon', 'n', 'Ein golden schimmerndes Stück Wüstenglas erinnert an die gemeinsame Hauptstadt Äthkern.', { attack: [1, 2, 3, 4], health: [1, 2, 3, 4] }],
    ['ring', 'Dünenfunken-Ring', 'm', 'Ein dunkler Ring trägt einen bernsteinfarbenen Funken aus den Werkstätten der Wüste.', { attack: [1, 1, 2, 3], focus: [0, 1, 1, 2] }],
  ] },
];
for (const collection of collections) {
  for (const [type, name, gender, description, bonuses] of collection.pieces) {
    designs.push({ id: collection.id, type, name, gender, description, bonuses,
      origin: collection.origin, setName: collection.setName, visualStyle: collection.visualStyle,
      weaponShape: type === 'weapon' ? collection.weaponShape : null });
  }
}

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
    origin: design.origin || '',
    setName: design.setName || '',
    visualStyle: design.visualStyle || 'classic',
    weaponShape: design.type === 'weapon' ? design.weaponShape || (design.id === 'rune' ? 'staff' : 'blade') : null,
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
