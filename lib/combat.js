import { equipmentBonuses, POTIONS } from './items.js';

const MAX_ACTIONS = 60;
const MAX_LOG_ENTRIES = 24;
const MAX_EVENTS = 64;
const POTION_BY_ID = new Map(POTIONS.map(potion => [potion.id, potion]));
const ACTIONS = new Set(['attack', 'focus', 'guard', ...POTION_BY_ID.keys()]);

const positiveBonus = value => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

function skillsFor(player) {
  const skills = {};
  for (const key of ['strength', 'focus', 'endurance']) {
    const level = player?.skills?.[key] ?? 1;
    if (!Number.isInteger(level) || level < 1 || level > 10) {
      throw new Error('Skills müssen eine ganze Stufe zwischen 1 und 10 haben.');
    }
    skills[key] = level;
  }
  return skills;
}

/** Calculate combat values without changing the supplied player. */
export function getCombatStats(player) {
  const skills = skillsFor(player);
  const bonuses = equipmentBonuses(player?.inventory, player?.equipment);
  return {
    maxHp: 80 + skills.endurance * 12 + positiveBonus(bonuses.health),
    attackDamage: 10 + skills.strength * 4 + positiveBonus(bonuses.attack),
    focusDamage: 14 + skills.strength * 2 + skills.focus * 5 + positiveBonus(bonuses.focus),
    defense: Math.min(12, positiveBonus(bonuses.defense)),
    guardHealing: 5 + skills.endurance * 2,
    potionHealing: 35,
    potionHealings: Object.fromEntries(POTIONS.map(potion => [potion.id, potion.healing])),
  };
}

function appearanceFor(appearance = {}) {
  return {
    color: ['amber', 'violet', 'mint', 'rose', 'sky'].includes(appearance?.color) ? appearance.color : 'amber',
    outfit: ['adventurer', 'scholar', 'knight'].includes(appearance?.outfit) ? appearance.outfit : 'adventurer',
    emblem: ['star', 'moon', 'leaf'].includes(appearance?.emblem) ? appearance.emblem : 'star',
  };
}

// Old persisted battles predate equipment. Their original skill values continue
// to apply, while new battles keep a dedicated immutable-at-start stats snapshot.
function statsForFighter(fighter) {
  return fighter.stats || getCombatStats({ skills: fighter.skills });
}

function fighterFor(player) {
  if (!player || typeof player.id !== 'string' || !player.id.trim()) {
    throw new Error('Ein Kämpfer braucht eine gültige ID.');
  }
  const skills = skillsFor(player);
  const stats = getCombatStats(player);
  const { maxHp } = stats;
  return {
    id: player.id,
    name: player.name || player.characterName || 'Held',
    characterName: player.characterName || player.name || 'Held',
    avatar: ['fox', 'owl', 'dragon', 'cat'].includes(player.avatar) ? player.avatar : 'fox',
    appearance: appearanceFor(player.appearance),
    equipment: Object.fromEntries(['helmet', 'chest', 'hand1', 'hand2', 'necklace', 'ring']
      .map(slot => [slot, typeof player.equipment?.[slot] === 'string' ? player.equipment[slot] : null])),
    skills,
    stats,
    hp: maxHp,
    maxHp,
    guarding: false,
    focusCooldown: 0,
    damageDealt: 0,
  };
}

/** The challenger moves first; all combat state can be stored as JSON. */
export function createBattleState(playerA, playerB) {
  const fighters = [fighterFor(playerA), fighterFor(playerB)];
  if (fighters[0].id === fighters[1].id) {
    throw new Error('Für ein Duell braucht es zwei unterschiedliche Kämpfer.');
  }
  return {
    fighters,
    turnId: fighters[0].id,
    winnerId: null,
    round: 1,
    turns: 0,
    events: [],
    eventSeq: 0,
    log: [`${fighters[0].characterName} fordert ${fighters[1].characterName} heraus. Das Duell beginnt!`],
    status: 'active',
  };
}

function finishAtLimit(state) {
  const [first, second] = state.fighters;
  // Cross multiplication avoids floating point ties for equal HP percentages.
  const hpDifference = first.hp * second.maxHp - second.hp * first.maxHp;
  const winner = hpDifference >= 0 ? first : second;
  state.status = 'finished';
  state.winnerId = winner.id;
  state.log.push(hpDifference === 0
    ? `Nach 30 Runden herrscht Gleichstand. ${first.characterName} gewinnt als Herausforderer den Stichentscheid.`
    : `Das Zeitlimit ist erreicht. ${winner.characterName} gewinnt mit dem höheren Lebenspunkte-Anteil.`);
}

/**
 * Apply exactly one turn. Inventory is checked, never mutated: the caller must
 * deduct consumedItem atomically with saving the returned state.
 * Focus requires two other successful own actions before it is available again.
 */
export function applyAction(state, actorId, action, inventory = {}) {
  if (!state || state.status !== 'active') {
    throw new Error('Dieses Duell ist bereits beendet.');
  }
  if (!Array.isArray(state.fighters) || state.fighters.length !== 2 ||
      !state.fighters.some((fighter) => fighter.id === actorId)) {
    throw new Error('Du nimmst an diesem Duell nicht teil.');
  }
  if (state.turnId !== actorId) {
    throw new Error('Du bist noch nicht am Zug.');
  }
  if (!ACTIONS.has(action)) {
    throw new Error('Diese Kampfaktion ist nicht bekannt.');
  }

  const next = structuredClone(state);
  const actor = next.fighters.find((fighter) => fighter.id === actorId);
  const target = next.fighters.find((fighter) => fighter.id !== actorId);
  const stats = statsForFighter(actor);
  const targetStats = statsForFighter(target);
  const potion = POTION_BY_ID.get(action);
  let consumedItem = null;
  let damage = 0;
  let healing = 0;
  let blocked = false;

  if (action === 'focus' && actor.focusCooldown > 0) {
    throw new Error(`Fokus ist erst nach ${actor.focusCooldown} weiteren eigenen Aktionen wieder bereit.`);
  }
  if (potion) {
    if (!Number.isInteger(inventory[action]) || inventory[action] < 1) {
      throw new Error('Du hast keinen Heiltrank mehr.');
    }
    if (actor.hp >= actor.maxHp) {
      throw new Error('Deine Lebenspunkte sind bereits voll.');
    }
  }

  if (action === 'attack' || action === 'focus') {
    const baseDamage = action === 'focus' ? stats.focusDamage : stats.attackDamage;
    const reducedDamage = Math.max(1, baseDamage - Math.min(12, positiveBonus(targetStats.defense)));
    blocked = Boolean(target.guarding);
    damage = Math.min(target.hp, blocked ? Math.max(1, Math.ceil(reducedDamage * 0.45)) : reducedDamage);
    target.hp -= damage;
    target.guarding = false;
    actor.damageDealt = (actor.damageDealt || 0) + damage;
    next.log.push(`${actor.characterName} ${action === 'focus' ? 'nutzt den Fokusstoß' : 'greift an'}: ${target.characterName} verliert ${damage} LP.${blocked ? ' Die Deckung fängt einen Teil ab.' : ''}`);
  } else if (action === 'guard') {
    healing = Math.min(stats.guardHealing, actor.maxHp - actor.hp);
    actor.hp += healing;
    actor.guarding = true;
    next.log.push(`${actor.characterName} geht in Deckung.${healing > 0 ? ` Dabei regenerieren ${healing} LP.` : ''}`);
  } else {
    healing = Math.min(potion.healing, actor.maxHp - actor.hp);
    actor.hp += healing;
    consumedItem = action;
    next.log.push(`${actor.characterName} nutzt ${potion.name} und erhält ${healing} LP zurück.`);
  }

  actor.focusCooldown = action === 'focus' ? 2 : Math.max(0, (actor.focusCooldown || 0) - 1);
  next.turns = (next.turns || 0) + 1;
  next.turnId = target.id;
  if (target.hp === 0) {
    next.status = 'finished';
    next.winnerId = actor.id;
    next.log.push(`${actor.characterName} gewinnt das Duell!`);
  } else if (next.turns >= MAX_ACTIONS) {
    finishAtLimit(next);
  }
  next.round = next.status === 'finished' ? Math.ceil(next.turns / 2) : Math.floor(next.turns / 2) + 1;
  next.log = next.log.slice(-MAX_LOG_ENTRIES);
  const events = Array.isArray(next.events) ? next.events : [];
  next.eventSeq = Math.max(next.eventSeq || 0, ...events.map(event => event.id || 0)) + 1;
  const event = {
    id: next.eventSeq,
    turn: next.turns,
    actorId,
    targetId: action === 'attack' || action === 'focus' ? target.id : actorId,
    action,
    damage,
    healing,
    blocked,
  };
  if (next.status === 'finished') event.winnerId = next.winnerId;
  next.events = [...events, event].slice(-MAX_EVENTS);
  return { state: next, consumedItem };
}
