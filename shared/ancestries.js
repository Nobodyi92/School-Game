// Shared by the server and browser: every people starts with six skill levels.
export const SKILL_IDS = Object.freeze(['strength', 'focus', 'endurance']);
export const DEFAULT_ANCESTRY = 'sky-nomad';
export const ANCESTRIES = Object.freeze([
  { id: 'aether-elf', name: 'Ätherelfen', title: 'Licht und Natur', description: 'Wendige Elfen mit spitzen Ohren und leuchtenden Augen. Ihre Stärke sind mächtige Fokus-Attacken.', skills: { strength: 1, focus: 4, endurance: 1 } },
  { id: 'aether-engineer', name: 'Ätheringenieure', title: 'Kraft und Technik', description: 'Klein, kräftig und voller Erfindergeist. Sie verbinden starke normale Angriffe mit guter Ausdauer.', skills: { strength: 3, focus: 1, endurance: 2 } },
  { id: 'cloud-warden', name: 'Wolkenhüter', title: 'Schutz und Äther', description: 'Ätherische Gestalten mit Wolkenhaar. Viel Ausdauer und etwas Fokus helfen ihnen, lange durchzuhalten.', skills: { strength: 1, focus: 2, endurance: 3 } },
  { id: 'sky-nomad', name: 'Luftnomaden', title: 'Freiheit und Vielseitigkeit', description: 'Vielfältige Reisende zwischen den Himmelsinseln. Ihre ausgeglichenen Skills passen zu jedem Kampfstil.', skills: { strength: 2, focus: 2, endurance: 2 } },
  { id: 'aether-druid', name: 'Ätherdruiden', title: 'Natur und Erneuerung', description: 'Mit Blättern und Moos verbundene Naturhüter. Starke Fokus-Attacken und Ausdauer unterstützen Schutz und Heilung.', skills: { strength: 1, focus: 3, endurance: 2 } },
  { id: 'aether-dusk', name: 'Ätherdämmerer', title: 'Wüste und Schlagkraft', description: 'Robuste Wüstenbewohner mit sandfarbener Haut und dunklem, schimmerndem Haar. Normale Angriffe sind ihre Spezialität.', skills: { strength: 4, focus: 1, endurance: 1 } },
].map(people => Object.freeze({ ...people, skills: Object.freeze(people.skills) })));

export function isAncestry(id) { return ANCESTRIES.some(people => people.id === id); }
export function ancestryFor(id) {
  const legacy = { fox: 'sky-nomad', owl: 'aether-elf', dragon: 'aether-druid', cat: 'aether-dusk' };
  return ANCESTRIES.find(people => people.id === id || people.id === legacy[id])
    || ANCESTRIES.find(people => people.id === DEFAULT_ANCESTRY);
}

function object(raw) {
  if (typeof raw === 'string') { try { return JSON.parse(raw) || {}; } catch { return {}; } }
  return raw || {};
}
export function normalizeTraining(raw) {
  const value = object(raw);
  return Object.fromEntries(SKILL_IDS.map(skill => [skill, Math.max(0, Math.min(9, Math.trunc(Number(value[skill]) || 0)))]));
}
export function legacyTraining(raw) {
  const skills = object(raw);
  return normalizeTraining(Object.fromEntries(SKILL_IDS.map(skill => [skill, (Number(skills[skill]) || 1) - 1])));
}
export function skillsFor(ancestry, rawTraining = {}) {
  const base = ancestryFor(ancestry).skills;
  const trained = normalizeTraining(rawTraining);
  return Object.fromEntries(SKILL_IDS.map(skill => [skill, Math.min(10, base[skill] + trained[skill])]));
}
export function progressFor(ancestry, rawTraining = {}) {
  const base = ancestryFor(ancestry).skills;
  const trained = normalizeTraining(rawTraining);
  return Object.fromEntries(SKILL_IDS.map(skill => [skill, {
    base: base[skill], trained: trained[skill], reserve: Math.max(0, base[skill] + trained[skill] - 10),
    cost: (trained[skill] + 1) * 25,
  }]));
}
