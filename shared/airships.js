// This catalogue is shared by the server and browser. Ship bonuses affect travel only.
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

export const SHIP_SLOTS = freeze(['sails', 'hull', 'flag']);
export const AIRSHIPS = freeze([
  { id: 'windling', name: 'Windling', minLevel: 5, price: 250, visualStyle: 'small', description: 'Dein kleines Luftschiff für erste Reisen im Ätherstrom.', stats: { speed: 35, stability: 30, navigation: 12 } },
  { id: 'himmelsfalter', name: 'Himmelsfalter', minLevel: 5, price: 750, visualStyle: 'medium', description: 'Ein geräumiger Zweimaster mit ruhiger Fahrt und kräftigen Segeln.', stats: { speed: 48, stability: 50, navigation: 20 } },
  { id: 'aetherarche', name: 'Ätherarche', minLevel: 10, price: 3000, visualStyle: 'large', description: 'Ein großes Flaggschiff für erfahrene Reisende des Ätherstroms.', stats: { speed: 62, stability: 75, navigation: 30 } },
]);

const traditions = [
  { id: 'silberwind', origin: 'Silberwind', visualStyle: 'leaf', colors: { primary: '#78b793', secondary: '#e0f0c5', accent: '#c8e6c9' }, pattern: 'leaf', names: ['Blattsilber-Segel', 'Silberrinden-Rumpf', 'Blattbanner'], bonuses: [{ speed: 9, navigation: 2 }, { stability: 10, speed: 2 }, { navigation: 7, speed: 2 }], source: 'Turm: Ebene 2 / Insel: Küstenpfad und Pfadfinder' },
  { id: 'zephyria', origin: 'Zephyria', visualStyle: 'gear', colors: { primary: '#b97b46', secondary: '#384653', accent: '#f4d07b' }, pattern: 'gear', names: ['Turbinen-Segel', 'Messingkiel', 'Zahnradbanner'], bonuses: [{ speed: 12 }, { stability: 14, navigation: 2 }, { navigation: 5, speed: 3 }], source: 'Turm: Ebenen 3–4 / Runengolem' },
  { id: 'nebelheim', origin: 'Nebelheim', visualStyle: 'cloud', colors: { primary: '#7f9ac5', secondary: '#e6effc', accent: '#c2b3f4' }, pattern: 'cloud', names: ['Nebelschleier-Segel', 'Wolkenpanzer-Rumpf', 'Nebelwimpel'], bonuses: [{ speed: 7, stability: 4 }, { stability: 11, navigation: 3 }, { navigation: 8, stability: 2 }], source: 'Turm: Ebenen 2–4' },
  { id: 'himmelsruhe', origin: 'Himmelsruhe', visualStyle: 'sail', colors: { primary: '#e2ba67', secondary: '#f5e7bd', accent: '#579bba' }, pattern: 'compass', names: ['Horizont-Segel', 'Nomaden-Kiel', 'Kompassflagge'], bonuses: [{ speed: 10, navigation: 3 }, { stability: 8, speed: 5 }, { navigation: 10 }], source: 'Turm: Ebene 6 / Insel: Abschluss' },
  { id: 'aetherhain', origin: 'Ätherhain', visualStyle: 'root', colors: { primary: '#526e54', secondary: '#a5cf8f', accent: '#a7e4c8' }, pattern: 'tree', names: ['Wurzelweber-Segel', 'Lebensholz-Rumpf', 'Hainbanner'], bonuses: [{ speed: 6, stability: 7 }, { stability: 16 }, { navigation: 6, stability: 5 }], source: 'Insel: Küstenpfad und Pfadfinder / Runengolem' },
  { id: 'aethkern', origin: 'Äthkern', visualStyle: 'dune', colors: { primary: '#c78a64', secondary: '#f2d7a3', accent: '#a76caf' }, pattern: 'sun', names: ['Sonnenfänger-Segel', 'Dünenstahl-Rumpf', 'Dämmerbanner'], bonuses: [{ speed: 11, stability: 2 }, { stability: 12, speed: 4 }, { navigation: 9, speed: 1 }], source: 'Turm: Spitze / Insel: Abschluss' },
];

const rewardParts = new Map([
  ['pet-firefly', ['sails-silberwind', 'flag-nebelheim']],
  ['outfit-starlight', ['hull-zephyria', 'sails-nebelheim']],
  ['trophy-tower-bronze', ['flag-zephyria', 'hull-nebelheim']],
  ['pet-cloud', ['sails-himmelsruhe', 'flag-himmelsruhe']],
  ['trophy-tower-gold', ['hull-aethkern', 'sails-aethkern']],
  ['pet-tide', ['hull-aetherhain', 'flag-silberwind']],
  ['outfit-pathfinder', ['sails-aetherhain', 'hull-silberwind']],
  ['trophy-island', ['flag-aethkern', 'hull-himmelsruhe']],
  ['trophy-golem', ['sails-zephyria', 'flag-aetherhain']],
]);
const rewardSources = new Map([
  ['pet-firefly', 'Turm: Etage 2 abschließen und Funde sichern.'],
  ['outfit-starlight', 'Turm: Etage 4 abschließen und Funde sichern.'],
  ['trophy-tower-bronze', 'Turm: Etage 6 abschließen und Funde sichern.'],
  ['pet-cloud', 'Turm: Etage 8 abschließen und Funde sichern.'],
  ['trophy-tower-gold', 'Alle 10 Turmetagen bezwingen.'],
  ['pet-tide', 'Insel: 3 Stationen abschließen und Funde sichern.'],
  ['outfit-pathfinder', 'Insel: 5 Stationen abschließen und Funde sichern.'],
  ['trophy-island', 'Alle 7 Inselstationen und den Gezeitenwächter bezwingen.'],
  ['trophy-golem', 'Den Runengolem gemeinsam bezwingen und am Kampf teilnehmen.'],
]);
const partSources = new Map([...rewardParts].flatMap(([proof, parts]) => parts.map(id => [id, rewardSources.get(proof)])));

export const SHIP_PARTS = freeze(traditions.flatMap(theme => SHIP_SLOTS.map((slot, index) => ({
  id: `${slot}-${theme.id}`, slot, name: theme.names[index], origin: theme.origin,
  visualStyle: theme.visualStyle, colors: theme.colors, pattern: theme.pattern,
  description: `${theme.names[index]} aus ${theme.origin} für dein Luftschiff.`,
  bonuses: { speed: 0, stability: 0, navigation: 0, ...theme.bonuses[index] },
  source: `${partSources.get(`${slot}-${theme.id}`)} Ab Spielerlevel 5.`,
}))));

// All five berths lie on this one current. Zephyria's ground shipyard is not a flying destination.
export const AETHER_ROUTE = 'M807 51C729 95 721 146 778 177C843 223 595 232 614 286S770 336 920 352C1037 367 1083 444 997 495S683 524 788 566S1120 607 1008 689S815 724 775 796L705 869';
export const SHIP_DOCKS = freeze([
  { id: 'nebelheim', name: 'Gipfelhafen Nebelheim', description: 'Dein erster Liegeplatz am nördlichen Ursprung des Ätherstroms.', progress: 0.04, x: 765, y: 89 },
  { id: 'sky-rest', name: 'Himmelsruhe', description: 'Der schwebende Treffpunkt der Luftnomaden.', progress: 0.34, x: 840, y: 345 },
  { id: 'wandering-island', name: 'Wandelnde Insel', description: 'Eine schwimmende Insel, die im Ätherstrom ihre Kreise zieht.', progress: 0.52, x: 1004, y: 489 },
  { id: 'aether-grove', name: 'Ätherhain', description: 'Ein schwebender Anleger über den grünen Hainen.', progress: 0.74, x: 1021, y: 640 },
  { id: 'aethkern', name: 'Äthkern', description: 'Der südliche Stromhafen am Rand der Wüste.', progress: 0.96, x: 741, y: 829 },
]);

function playerLevel(value) {
  return Math.max(1, Math.min(100, Math.trunc(Number(value) || 1)));
}
export function moneyRangeForLevel(level) {
  const current = playerLevel(level);
  return { min: 10 + 5 * current, max: 20 + 10 * current };
}
export function walletFor(value = 0) {
  const total = Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return { total, krona: Math.floor(total / 1000), thal: Math.floor((total % 1000) / 10), aetherlings: total % 10 };
}
export function formatMoney(value = 0) {
  const wallet = walletFor(typeof value === 'object' ? value?.total : value);
  const parts = [];
  if (wallet.krona) parts.push(`${wallet.krona} Krona`);
  if (wallet.thal) parts.push(`${wallet.thal} Thal`);
  if (wallet.aetherlings || !parts.length) parts.push(`${wallet.aetherlings} Ätherlinge`);
  return parts.join(' · ');
}

export function shipStats(shipOrId, modifications = {}) {
  // Always resolve the model through the trusted catalogue, including object arguments.
  const ship = AIRSHIPS.find(item => item.id === (typeof shipOrId === 'string' ? shipOrId : shipOrId?.id));
  if (!ship) return null;
  const stats = { ...ship.stats };
  for (const slot of SHIP_SLOTS) {
    const part = SHIP_PARTS.find(item => item.id === modifications?.[slot] && item.slot === slot);
    if (part) for (const stat of ['speed', 'stability', 'navigation']) stats[stat] += part.bonuses[stat];
  }
  return stats;
}

export function journeyDurationMs(stats, fromDockId, toDockId) {
  const from = SHIP_DOCKS.find(dock => dock.id === fromDockId);
  const to = SHIP_DOCKS.find(dock => dock.id === toDockId);
  if (!from || !to || !stats || from.id === to.id) return 0;
  const bounded = stat => Math.max(0, Math.min(200, Number(stats[stat]) || 0));
  const distance = Math.abs(to.progress - from.progress);
  const cruise = 60 / (1 + bounded('speed') / 30);
  const current = 16 / (1 + bounded('stability') / 30);
  const manoeuvre = 10 / (1 + bounded('navigation') / 15);
  return Math.round(Math.max(4, Math.min(45, 4 + distance * (cruise + current + manoeuvre))) * 1000);
}

export function partsForAdventureRewards(rewardIds, level) {
  if (playerLevel(level) < 5 || !Array.isArray(rewardIds)) return [];
  return [...new Set(rewardIds.flatMap(id => rewardParts.get(id) || []))];
}
