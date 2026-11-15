import { isAncestry } from './ancestries.js';

export const NPC_TYPES = Object.freeze(['bandit', 'mage', 'dark-mage', 'tide-guardian', 'training-warden']);
export const NPC_VARIANTS = Object.freeze({
  bandit: Object.freeze(['scout', 'brute', 'captain']),
  mage: Object.freeze(['rune', 'storm', 'archmage']),
  'dark-mage': Object.freeze(['crystal', 'shadow']),
  'tide-guardian': Object.freeze(['tide']),
  'training-warden': Object.freeze(['warden']),
});
const names = Object.freeze({
  bandit: { scout: 'Banditenspäher', brute: 'Banditenschläger', captain: 'Banditenhauptmann' },
  mage: { rune: 'Runenmagier', storm: 'Sturmmagier', archmage: 'Magier der Turmkuppel' },
  'dark-mage': { crystal: 'Dunkler Kristallmagier', shadow: 'Schattenmagier' },
  'tide-guardian': { tide: 'Gezeitenwächter' },
  'training-warden': { warden: 'Übungsmeister' },
});

/** Only catalogue values reach the renderers; arbitrary variants use the default. */
export function npcDescriptor(type, variant) {
  if (!NPC_TYPES.includes(type)) return null;
  const npcVariant = NPC_VARIANTS[type].includes(variant) ? variant : NPC_VARIANTS[type][0];
  return { npcType: type, npcVariant, avatar: `npc-${type}` };
}
export function npcNameFor(type, variant) {
  const visual = npcDescriptor(type, variant);
  return visual ? names[visual.npcType][visual.npcVariant] : '';
}

/**
 * View-only interpretation of old NPC snapshots. Character and boss snapshots
 * never become human enemies, and no saved combat values are modified.
 */
export function enemyVisualFor(fighter, context = {}) {
  if (!fighter || isAncestry(fighter.ancestry) || fighter.role === 'student' || fighter.role === 'teacher'
      || fighter.id === 'rune-golem' || fighter.avatar === 'golem' || fighter.kind === 'golem') return null;
  const explicit = npcDescriptor(fighter.npcType, fighter.npcVariant);
  if (explicit) return explicit;
  if (fighter.id === 'training-bot') return npcDescriptor('training-warden', 'warden');
  if (fighter.id === 'tower-enemy') {
    const parsedFloor = /(?:Etage|Ebene)\s*(\d+)/i.exec(fighter.characterName || fighter.name || '')?.[1];
    const floor = Math.max(1, Math.min(10, Math.trunc(Number(context.floor ?? parsedFloor) || 1)));
    return floor <= 5 ? npcDescriptor('bandit', ['scout', 'brute', 'captain'][(floor - 1) % 3])
      : npcDescriptor('mage', floor === 10 ? 'archmage' : floor % 2 ? 'storm' : 'rune');
  }
  if (fighter.id === 'island-enemy') {
    const guardian = context.guardian || fighter.guardian || /Gezeitenwächter/.test(fighter.name || fighter.characterName || '');
    if (guardian) return npcDescriptor('tide-guardian', 'tide');
    const station = Math.max(1, Math.min(7, Math.trunc(Number(context.station) || 1)));
    const title = context.routeTitle || context.title || '';
    const type = title === 'Kristallhöhle' ? 'dark-mage' : title === 'Dornenpfad' ? 'bandit'
      : station % 2 ? 'bandit' : 'dark-mage';
    return npcDescriptor(type, type === 'dark-mage' ? station % 2 ? 'shadow' : 'crystal'
      : station > 3 ? 'captain' : 'scout');
  }
  return null;
}
