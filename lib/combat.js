const MAX_ACTIONS = 60;
const MAX_LOG_ENTRIES = 24;
const ACTIONS = new Set(['attack', 'focus', 'guard', 'potion']);

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
  return {
    maxHp: 80 + skills.endurance * 12,
    attackDamage: 10 + skills.strength * 4,
    focusDamage: 14 + skills.strength * 2 + skills.focus * 5,
    guardHealing: 5 + skills.endurance * 2,
    potionHealing: 35,
  };
}

function fighterFor(player) {
  if (!player || typeof player.id !== 'string' || !player.id.trim()) {
    throw new Error('Ein Kämpfer braucht eine gültige ID.');
  }
  const skills = skillsFor(player);
  const { maxHp } = getCombatStats({ skills });
  return {
    id: player.id,
    name: player.name || player.characterName || 'Held',
    characterName: player.characterName || player.name || 'Held',
    skills,
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
  const stats = getCombatStats(actor);
  let consumedItem = null;

  if (action === 'focus' && actor.focusCooldown > 0) {
    throw new Error(`Fokus ist erst nach ${actor.focusCooldown} weiteren eigenen Aktionen wieder bereit.`);
  }
  if (action === 'potion') {
    if (!Number.isInteger(inventory.potion) || inventory.potion < 1) {
      throw new Error('Du hast keinen Heiltrank mehr.');
    }
    if (actor.hp >= actor.maxHp) {
      throw new Error('Deine Lebenspunkte sind bereits voll.');
    }
  }

  if (action === 'attack' || action === 'focus') {
    const baseDamage = action === 'focus' ? stats.focusDamage : stats.attackDamage;
    const blocked = target.guarding;
    const damage = Math.min(target.hp, blocked ? Math.max(1, Math.ceil(baseDamage * 0.45)) : baseDamage);
    target.hp -= damage;
    target.guarding = false;
    actor.damageDealt = (actor.damageDealt || 0) + damage;
    next.log.push(`${actor.characterName} ${action === 'focus' ? 'nutzt den Fokusstoß' : 'greift an'}: ${target.characterName} verliert ${damage} LP.${blocked ? ' Die Deckung fängt einen Teil ab.' : ''}`);
  } else if (action === 'guard') {
    const healed = Math.min(stats.guardHealing, actor.maxHp - actor.hp);
    actor.hp += healed;
    actor.guarding = true;
    next.log.push(`${actor.characterName} geht in Deckung.${healed > 0 ? ` Dabei regenerieren ${healed} LP.` : ''}`);
  } else {
    const healed = Math.min(stats.potionHealing, actor.maxHp - actor.hp);
    actor.hp += healed;
    consumedItem = 'potion';
    next.log.push(`${actor.characterName} nutzt einen Heiltrank und erhält ${healed} LP zurück.`);
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
  return { state: next, consumedItem };
}
