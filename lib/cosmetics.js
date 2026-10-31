// Unlock ownership is supplied by the store, never accepted from an equip body.
// Every cosmetic is visual only and has no combat or economy modifiers.
export const COSMETICS = Object.freeze([
  { id: 'pet-firefly', type: 'companion', name: 'Glühwürmchen', description: 'Ein kleiner goldener Lichtfunke begleitet deinen Helden.', color: '#e8bd62', source: 'Turm: Etage 2 abschließen und Funde sichern.' },
  { id: 'pet-cloud', type: 'companion', name: 'Wolkengeist', description: 'Eine freundliche kleine Wolke schwebt an deiner Seite.', color: '#c4ddf1', source: 'Turm: Etage 8 abschließen und Funde sichern.' },
  { id: 'pet-rune', type: 'companion', name: 'Runenfunke', description: 'Ein leuchtender Runenstein erinnert an euren gemeinsamen Sieg.', color: '#ad91e2', source: 'Den Runengolem gemeinsam bezwingen.' },
  { id: 'outfit-starlight', type: 'outfit', name: 'Sternenmantel', description: 'Ein nachtblauer Mantel mit goldenem Sternenschmuck.', color: '#595f9d', source: 'Turm: Etage 4 abschließen und Funde sichern.' },
  { id: 'outfit-warden', type: 'outfit', name: 'Turmwächter', description: 'Eine smaragdgrüne Wächtertracht mit goldenen Säumen.', color: '#438a79', source: 'Alle 10 Etagen des Turms bezwingen.' },
  { id: 'outfit-runekeeper', type: 'outfit', name: 'Runenhüter', description: 'Eine violette Tracht mit leuchtenden Runen.', color: '#8863b5', source: 'Den Runengolem gemeinsam bezwingen.' },
  { id: 'trophy-tower-bronze', type: 'trophy', name: 'Turmtrophäe', description: 'Ein bronzener Turm für deinen ersten großen Aufstieg.', color: '#b5845e', source: 'Turm: Etage 6 abschließen und Funde sichern.' },
  { id: 'trophy-tower-gold', type: 'trophy', name: 'Turmmeister', description: 'Der goldene Turm zeichnet den vollständigen Aufstieg aus.', color: '#e8bd62', source: 'Alle 10 Etagen des Turms bezwingen.' },
  { id: 'trophy-golem', type: 'trophy', name: 'Runengolembezwinger', description: 'Eine gemeinsame Leistung, die einen Ehrenplatz verdient.', color: '#ab94ca', source: 'Den Runengolem gemeinsam bezwingen.' },
].map(item => Object.freeze(item)));

const catalogueById = new Map(COSMETICS.map(item => [item.id, item]));

export function cosmeticCatalogue() {
  return structuredClone(COSMETICS);
}

export function normalizeCosmetics(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const owned = [...new Set((Array.isArray(value.owned) ? value.owned : [])
    .filter(id => typeof id === 'string' && catalogueById.has(id)))];
  const selected = {};
  for (const type of ['companion', 'outfit']) {
    const id = value.selected?.[type];
    selected[type] = owned.includes(id) && catalogueById.get(id)?.type === type ? id : null;
  }
  return { owned, selected };
}
