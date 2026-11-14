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
  { id: 'pet-tide', type: 'companion', name: 'Gezeitengeist', description: 'Ein kleiner Wassergeist bewahrt die Erinnerung an deine Inselreise.', color: '#66b6b0', source: 'Insel: 3 Stationen abschließen und Funde sichern.' },
  { id: 'pet-aether-falcon', type: 'companion', name: 'Ätherfalke', description: 'Ein silberblauer Jungfalke aus den Bergen begleitet dich mit ausgebreiteten Schwingen.', color: '#9fcfea', source: 'Turm: Etage 4 abschließen und Funde sichern.' },
  { id: 'pet-clockwork-beetle', type: 'companion', name: 'Zahnradkäfer', description: 'Ein kleiner mechanischer Käfer aus Zephyria mit Messingpanzer und leuchtendem Ätherkern.', color: '#e4c086', source: 'Turm: Etage 6 abschließen und Funde sichern.' },
  { id: 'pet-mist-cat', type: 'companion', name: 'Äthertauflinker', description: 'Ein neugieriges Katzenwesen aus den Nebelwäldern mit schimmerndem Fell und einer sanften Nebelaura.', color: '#c4b5ef', source: 'Insel: 3 Stationen abschließen und Funde sichern.' },
  { id: 'pet-blossom-moth', type: 'companion', name: 'Ätherblütenfalter', description: 'Ein sanfter Bote der Harmonie mit großen, blütenförmigen Flügeln in den Farben des Äthers.', color: '#e8acce', source: 'Insel: 5 Stationen abschließen und Funde sichern.' },
  { id: 'pet-crystal-golem', type: 'companion', name: 'Kristallgolem', description: 'Ein kleiner Wächter aus den Ätherkristallminen. Seine leuchtenden Runen erinnern an euren gemeinsamen Sieg.', color: '#9de0ce', source: 'Den Runengolem gemeinsam bezwingen und am Kampf teilnehmen.' },
  { id: 'pet-aether-phoenix', type: 'companion', name: 'Junger Ätherphönix', description: 'Ein goldener Phönix aus den südlichen Wüsten. Seine korallenfarbenen Federn schimmern wie warmes Ätherlicht.', color: '#f0b68a', source: 'Alle 10 Turmetagen bezwingen.' },
  { id: 'outfit-pathfinder', type: 'outfit', name: 'Inselwanderer', description: 'Ein türkisgrüner Reisemantel mit muschelfarbenen Säumen.', color: '#408f83', source: 'Insel: 5 Stationen abschließen und Funde sichern.' },
  { id: 'trophy-island', type: 'trophy', name: 'Kompass der Insel', description: 'Dieser Kompass erinnert an deinen Sieg über den Gezeitenwächter.', color: '#c0a66a', source: 'Alle 7 Inselstationen und den Gezeitenwächter bezwingen.' },
].map(item => Object.freeze(item)));

const catalogueById = new Map(COSMETICS.map(item => [item.id, item]));

const freezeRewards = milestones => Object.freeze(Object.fromEntries(Object.entries(milestones).map(([key, ids]) => [key, Object.freeze(ids)])));
export const TOWER_REWARDS = freezeRewards({
  2: ['pet-firefly'], 4: ['outfit-starlight', 'pet-aether-falcon'],
  6: ['trophy-tower-bronze', 'pet-clockwork-beetle'], 8: ['pet-cloud'],
  10: ['outfit-warden', 'trophy-tower-gold', 'pet-aether-phoenix'],
});
export const ISLAND_REWARDS = freezeRewards({
  3: ['pet-tide', 'pet-mist-cat'], 5: ['outfit-pathfinder', 'pet-blossom-moth'], 7: ['trophy-island'],
});
export const RAID_REWARDS = Object.freeze(['pet-rune', 'outfit-runekeeper', 'trophy-golem', 'pet-crystal-golem']);

// Existing, already secured achievements also qualify for the new companions.
// The same expansion handles legacy runs whose pending rewards predate this update.
const companionAchievements = Object.freeze({
  'outfit-starlight': 'pet-aether-falcon', 'trophy-tower-bronze': 'pet-clockwork-beetle',
  'trophy-tower-gold': 'pet-aether-phoenix', 'pet-tide': 'pet-mist-cat',
  'outfit-pathfinder': 'pet-blossom-moth', 'trophy-golem': 'pet-crystal-golem',
});
export function expandAdventureRewards(ids = []) {
  const known = [...new Set(ids.filter(id => catalogueById.has(id)))];
  return [...new Set([...known, ...known.map(id => companionAchievements[id]).filter(Boolean)])];
}

export function grantCompanionsForAchievements(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const insert = db.prepare('INSERT OR IGNORE INTO cosmetic_unlocks (user_id, item_id, unlocked_at) SELECT user_id, ?, unlocked_at FROM cosmetic_unlocks WHERE item_id = ?');
    for (const [achievement, companion] of Object.entries(companionAchievements)) insert.run(companion, achievement);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

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
