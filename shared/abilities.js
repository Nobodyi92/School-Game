import { ancestryFor } from './ancestries.js';

export const MAX_AETHER_ENERGY = 6;
export const INITIAL_AETHER_ENERGY = 2;
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

export const EFFECTS = freeze({
  marked: { name: 'Markiert', glyph: '◎', description: 'Der nächste Treffer verursacht 25 % mehr Schaden. Hält höchstens zwei eigene Aktionen.' },
  weakened: { name: 'Geschwächt', glyph: '↘', description: 'Der nächste Angriff verursacht 25 % weniger Schaden. Hält höchstens zwei eigene Aktionen.' },
  protected: { name: 'Geschützt', glyph: '⬡', description: 'Der nächste Treffer wird abgeschwächt. Hält höchstens zwei eigene Aktionen.' },
});

export const ANCESTRY_PASSIVES = freeze({
  'aether-elf': { id: 'star-sight', name: 'Sternenblick', description: 'Magische Fähigkeiten verursachen 10 % mehr Schaden.' },
  'aether-engineer': { id: 'craft-force', name: 'Werkzeugkraft', description: 'Physische Fähigkeiten verursachen 10 % mehr Schaden.' },
  'cloud-warden': { id: 'cloud-shelter', name: 'Wolkenmantel', description: 'Deine Schutzfähigkeiten fangen 10 Prozentpunkte mehr Schaden ab.' },
  'sky-nomad': { id: 'tailwind', name: 'Rückenwind', description: 'Du beginnst einen Kampf mit 3 statt 2 Ätherenergie.' },
  'aether-druid': { id: 'living-aether', name: 'Lebendiger Äther', description: 'Deine Heilfähigkeiten heilen 20 % mehr Lebenspunkte.' },
  'aether-dusk': { id: 'desert-resolve', name: 'Wüstenwille', description: 'Unter halben Lebenspunkten verursachen deine physischen Fähigkeiten 20 % mehr Schaden.' },
});

const common = [
  { id: 'aether-bolt', name: 'Äthergeschoss', glyph: '✦', cost: 3, minLevel: 1, target: 'enemy', kind: 'special', damageFactor: 1.1, description: 'Ein kräftiger Spezialangriff mit deinem Fokus-Schaden.' },
  { id: 'heavy-strike', name: 'Wuchtschlag', glyph: '⚔', cost: 3, minLevel: 1, target: 'enemy', kind: 'physical', damageFactor: 1.35, description: 'Ein mächtiger Waffenangriff. Nutze eine vorher gesetzte Markierung.' },
  { id: 'mark', name: 'Ätherzeichen', glyph: '◎', cost: 2, minLevel: 1, target: 'enemy', kind: 'support', effect: 'marked', description: 'Markiert das Ziel: Der nächste Treffer verursacht 25 % mehr Schaden.' },
  { id: 'mend', name: 'Heilender Funke', glyph: '♡', cost: 3, minLevel: 1, target: 'ally', kind: 'support', healFlat: 12, healFactor: .55, description: 'Heilt dich oder ein lebendes Gruppenmitglied.' },
  { id: 'aether-shield', name: 'Ätherschild', glyph: '⬡', cost: 2, minLevel: 1, target: 'ally', kind: 'support', effect: 'protected', protection: .4, description: 'Schützt dich oder ein Gruppenmitglied: 40 % weniger Schaden beim nächsten Treffer.' },
  { id: 'shield-break', name: 'Schildstoß', glyph: '◈', cost: 2, minLevel: 3, target: 'enemy', kind: 'physical', damageFactor: .85, breakGuard: true, effect: 'marked', description: 'Durchbricht Deckung und Schutz. Markiert das Ziel für den nächsten Treffer.' },
];
const signatures = [
  ['aether-elf', { id: 'star-arrow', name: 'Sternenpfeil', glyph: '➶', cost: 3, minLevel: 1, target: 'enemy', kind: 'special', damageFactor: 1, effect: 'marked', description: 'Ein Spezialangriff, der das Ziel für einen folgenden Treffer markiert.' },
    { id: 'silver-volley', name: 'Silberlichtsalve', glyph: '✧', cost: 4, minLevel: 5, target: 'enemy', kind: 'special', damageFactor: 1.45, effect: 'weakened', description: 'Starker Spezialangriff. Schwächt den nächsten Angriff des Ziels.' }],
  ['aether-engineer', { id: 'gear-crush', name: 'Zahnradschlag', glyph: '⚙', cost: 3, minLevel: 1, target: 'enemy', kind: 'physical', damageFactor: 1.2, breakGuard: true, effect: 'marked', description: 'Durchbricht Deckung und markiert die freigelegte Schwachstelle.' },
    { id: 'turbine-hammer', name: 'Turbinenhammer', glyph: '⚒', cost: 4, minLevel: 5, target: 'enemy', kind: 'physical', damageFactor: 1.6, effect: 'weakened', description: 'Ein schwerer Schlag, der den folgenden Angriff des Gegners schwächt.' }],
  ['cloud-warden', { id: 'cloud-wall', name: 'Wolkenwall', glyph: '☁', cost: 2, minLevel: 1, target: 'ally', kind: 'support', effect: 'protected', protection: .45, healFlat: 8, description: 'Heilt leicht und fängt den nächsten Treffer auf dich oder ein Gruppenmitglied ab.' },
    { id: 'sky-sanctuary', name: 'Himmelszuflucht', glyph: '☾', cost: 4, minLevel: 5, target: 'party', kind: 'support', effect: 'protected', protection: .35, healFlat: 10, description: 'Schützt und heilt alle lebenden Mitglieder deiner Gruppe.' }],
  ['sky-nomad', { id: 'wind-lunge', name: 'Windklinge', glyph: '➜', cost: 2, minLevel: 1, target: 'enemy', kind: 'physical', damageFactor: 1.05, selfProtection: .25, description: 'Ein schneller Angriff. Der Wind schwächt den nächsten Treffer gegen dich ab.' },
    { id: 'storm-sail', name: 'Sturmsegel', glyph: 'ϟ', cost: 4, minLevel: 5, target: 'enemy', kind: 'special', damageFactor: 1.3, partyEnergy: 1, description: 'Trifft mit Ätherkraft und gibt deiner Gruppe je 1 Ätherenergie.' }],
  ['aether-druid', { id: 'thorn-bind', name: 'Dornenranke', glyph: '❧', cost: 3, minLevel: 1, target: 'enemy', kind: 'special', damageFactor: .95, effect: 'weakened', description: 'Ein Naturangriff, der den nächsten Angriff des Ziels schwächt.' },
    { id: 'living-grove', name: 'Lebenshain', glyph: '♧', cost: 4, minLevel: 5, target: 'ally', kind: 'support', healFlat: 22, healFactor: .7, effect: 'protected', protection: .3, description: 'Heilt dich oder ein Gruppenmitglied stark und gibt Schutz für einen Treffer.' }],
  ['aether-dusk', { id: 'dune-cleave', name: 'Dünenspalter', glyph: '◢', cost: 3, minLevel: 1, target: 'enemy', kind: 'physical', damageFactor: 1.35, effect: 'weakened', description: 'Ein kräftiger Waffenangriff, der den nächsten Gegenschlag schwächt.' },
    { id: 'dusk-reversal', name: 'Dämmerungswende', glyph: '◐', cost: 4, minLevel: 5, target: 'enemy', kind: 'physical', damageFactor: 1.45, lifeSteal: .3, description: 'Ein schwerer Angriff. 30 % des verursachten Schadens heilen dich.' }],
];
export const ABILITIES = freeze([
  ...common.map(ability => ({ ancestry: null, ...ability })),
  ...signatures.flatMap(([ancestry, ...abilities]) => abilities.map(ability => ({ ancestry, ...ability }))),
]);
const defaults = {
  'aether-elf': ['star-arrow', 'mark', 'aether-shield'],
  'aether-engineer': ['gear-crush', 'heavy-strike', 'aether-shield'],
  'cloud-warden': ['cloud-wall', 'heavy-strike', 'aether-bolt'],
  'sky-nomad': ['wind-lunge', 'aether-bolt', 'mend'],
  'aether-druid': ['thorn-bind', 'mend', 'aether-shield'],
  'aether-dusk': ['dune-cleave', 'heavy-strike', 'aether-shield'],
};
export function abilityFor(id) { return ABILITIES.find(ability => ability.id === id) || null; }
export function availableAbilities(ancestry, level = 1) {
  const id = ancestryFor(ancestry).id, current = Math.max(1, Math.floor(Number(level) || 1));
  return ABILITIES.filter(ability => ability.minLevel <= current && (!ability.ancestry || ability.ancestry === id));
}
export function defaultAbilityLoadout(ancestry, level = 1) {
  const valid = new Set(availableAbilities(ancestry, level).map(ability => ability.id));
  return defaults[ancestryFor(ancestry).id].filter(id => valid.has(id));
}
export function normalizeAbilityLoadout(raw, ancestry, level = 1) {
  let value = raw;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = []; } }
  const valid = new Set(availableAbilities(ancestry, level).map(ability => ability.id));
  const source = Array.isArray(value) ? value : [];
  const reserved = new Set();
  // Keep valid choices in their original slots. Reserve all of them before
  // replacing unavailable skills, so a new default cannot displace a later slot.
  const slots = Array.from({ length: 3 }, (_, index) => {
    const id = source[index];
    if (typeof id !== 'string' || !valid.has(id) || reserved.has(id)) return null;
    reserved.add(id);
    return id;
  });
  const replacements = [...defaultAbilityLoadout(ancestry, level), ...valid];
  return slots.map(id => {
    if (id) return id;
    const replacement = replacements.find(candidate => !reserved.has(candidate));
    reserved.add(replacement);
    return replacement;
  });
}
