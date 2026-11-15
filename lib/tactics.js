import { isAncestry, ancestryFor } from '../shared/ancestries.js';
import { abilityFor, normalizeAbilityLoadout, MAX_AETHER_ENERGY, INITIAL_AETHER_ENERGY } from '../shared/abilities.js';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const alive = fighter => fighter && Number(fighter.hp) > 0;
const number = value => Number.isFinite(value) ? Math.max(0, value) : 0;
const effectsFor = fighter => fighter.effects || (fighter.effects = {});
const effectFor = (fighter, key) => fighter?.effects?.[key]?.turns > 0 ? fighter.effects[key] : null;
const passive = fighter => fighter?.tacticsVersion === 1 ? fighter.tacticalAncestry : null;

export function initializeTactics(fighter, player = {}) {
  const ancestry = ancestryFor(player.ancestry || player.avatar).id;
  const level = Math.max(1, Math.floor(Number(player.level) || (1 + Math.floor(Number(player.totalXp ?? player.total_xp ?? 0) / 100))));
  fighter.tacticsVersion = 1;
  fighter.tacticalAncestry = isAncestry(player.ancestry) ? player.ancestry : null;
  fighter.combatLevel = level;
  fighter.abilityLoadout = normalizeAbilityLoadout(player.abilityLoadout ?? player.combatAbilities?.equipped ?? player.ability_loadout, ancestry, level);
  fighter.energy = fighter.tacticalAncestry === 'sky-nomad' ? 3 : INITIAL_AETHER_ENERGY;
  fighter.maxEnergy = MAX_AETHER_ENERGY;
  fighter.effects = {};
  return fighter;
}
export function isTacticalAction(action) { return typeof action === 'string' && action.startsWith('ability:'); }
export function gainTacticalEnergy(actor, action) {
  if (actor?.tacticsVersion !== 1 || !['attack', 'guard'].includes(action)) return;
  actor.energy = Math.min(MAX_AETHER_ENERGY, number(actor.energy) + 2);
}
function giveEffect(target, name, potency = .25, sourceId = null) {
  if (!alive(target)) return;
  const current = effectFor(target, name);
  effectsFor(target)[name] = { turns: 2, potency: Math.max(number(current?.potency), potency), sourceId, fresh: true };
}
export function finishTacticalTurn(actor) {
  if (!actor?.effects) return;
  for (const [name, effect] of Object.entries(actor.effects)) {
    if (effect.fresh && effect.sourceId === actor.id) { delete effect.fresh; continue; }
    delete effect.fresh;
    effect.turns = Math.max(0, number(effect.turns) - 1);
    if (!effect.turns) delete actor.effects[name];
  }
}

export function applyTacticalDamage({ actor, target, damage, guarded, ignoreGuard = false,
  physical = false, special = false, ability = false, damageScale = 1, maxDamage = Infinity }) {
  if (!alive(target)) return { damage: 0, blocked: false };
  let amount = number(damage);
  const scale = Math.max(0, Number(damageScale) || 0);
  if (!amount || !scale || maxDamage <= 0) return { damage: 0, blocked: false };
  if (ability && special && passive(actor) === 'aether-elf') amount *= 1.1;
  if (ability && physical && passive(actor) === 'aether-engineer') amount *= 1.1;
  if (ability && physical && passive(actor) === 'aether-dusk' && actor.hp < actor.maxHp / 2) amount *= 1.2;
  const weak = effectFor(actor, 'weakened');
  if (weak && amount > 0) { amount *= 1 - Math.min(.75, number(weak.potency) || .25); delete actor.effects.weakened; }
  const mark = effectFor(target, 'marked');
  if (mark && amount > 0) { amount *= 1 + Math.min(.5, number(mark.potency) || .25); delete target.effects.marked; }
  if (ignoreGuard) { target.guarding = false; if (target.effects) delete target.effects.protected; }
  const protection = effectFor(target, 'protected');
  const guarding = ignoreGuard ? false : guarded ?? Boolean(target.guarding);
  const blocked = Boolean(guarding || protection);
  amount = Math.max(1, Math.round(amount) - Math.min(12, number(target.stats?.defense)));
  if (guarding) amount = Math.max(1, Math.ceil(amount * .45));
  if (protection) { amount = Math.max(1, Math.ceil(amount * (1 - Math.min(.75, number(protection.potency) || .4)))); delete target.effects.protected; }
  amount = Math.min(target.hp, Math.max(0, number(maxDamage === Infinity ? Number.MAX_SAFE_INTEGER : maxDamage)),
    Math.max(1, Math.round(amount * scale)));
  target.hp -= amount;
  target.guarding = false;
  if (actor) actor.damageDealt = (actor.damageDealt || 0) + amount;
  return { damage: amount, blocked };
}
export function applyTacticalHealing({ actor, target, healing, ability = false }) {
  if (!alive(target)) return 0;
  const multiplier = ability && passive(actor) === 'aether-druid' ? 1.2 : 1;
  const gained = Math.min(Math.max(0, target.maxHp - target.hp), Math.max(0, Math.round(number(healing) * multiplier)));
  target.hp += gained;
  return gained;
}

export function validateTacticalAction({ actor, target, allies = [], action, targetId, allowFullHealth = false }) {
  check(actor?.tacticsVersion === 1, 'Diese Fähigkeiten stehen im nächsten neu gestarteten Kampf bereit.');
  check(alive(actor), 'Ein ausgeschiedener Held kann keine Fähigkeit einsetzen.');
  const ability = isTacticalAction(action) ? abilityFor(action.slice(8)) : null;
  check(ability, 'Diese Fähigkeit gibt es nicht.');
  check(Array.isArray(actor.abilityLoadout) && actor.abilityLoadout.includes(ability.id), 'Diese Fähigkeit ist nicht für diesen Kampf ausgewählt.');
  check(ability.minLevel <= (Number(actor.combatLevel) || 1), 'Diese Fähigkeit ist auf deinem Spielerlevel noch gesperrt.');
  const ancestry = actor.tacticalAncestry || ancestryFor(actor.ancestry || actor.avatar).id;
  check(!ability.ancestry || ability.ancestry === ancestry, 'Diese Fähigkeit gehört zu einem anderen Volk.');
  check(Number.isInteger(actor.energy) && actor.energy >= ability.cost, `Dafür brauchst du ${ability.cost} Ätherenergie.`);
  const friends = [...new Map([actor, ...allies].filter(Boolean).map(friend => [friend.id, friend])).values()];
  let recipient;
  if (ability.target === 'enemy') {
    check(alive(target), 'Dieses Ziel ist nicht mehr im Kampf.');
    check(targetId === undefined || targetId === null || targetId === '' || targetId === target.id, 'Wähle den gegnerischen Kämpfer als Ziel.');
    recipient = target;
  } else if (ability.target === 'party') {
    check(targetId === undefined || targetId === null || targetId === '' || targetId === actor.id, 'Diese Fähigkeit gilt für deine ganze Gruppe.');
    recipient = actor;
  } else {
    recipient = friends.find(friend => friend.id === (targetId || actor.id));
    check(alive(recipient), 'Wähle dich oder ein lebendes Mitglied deiner Gruppe.');
  }
  if (!allowFullHealth && (ability.healFlat || ability.healFactor) && !ability.effect && ability.target !== 'party') {
    check(recipient.hp < recipient.maxHp, 'Die Lebenspunkte dieses Ziels sind bereits voll.');
  }
  return { ability, recipient, friends };
}

/** Mutates only the caller's already-cloned combat snapshots. */
export function executeTacticalAction(options) {
  const { actor, target, action } = options;
  const { ability, recipient, friends } = validateTacticalAction(options);
  actor.energy -= ability.cost;
  const stats = actor.stats || {};
  const affected = ability.target === 'party' ? friends.filter(alive) : [recipient];
  const events = [];
  let damage = 0, healing = 0, blocked = false;
  for (const fighter of affected) {
    let hit = { damage: 0, blocked: false }, healed = 0;
    if (ability.damageFactor) {
      const base = ability.kind === 'physical' ? number(stats.attackDamage) : number(stats.focusDamage);
      hit = applyTacticalDamage({ actor, target: fighter, damage: base * ability.damageFactor,
        ignoreGuard: ability.breakGuard, ability: true, physical: ability.kind === 'physical', special: ability.kind === 'special',
        damageScale: options.damageScale ?? 1, maxDamage: options.maxDamage ?? Infinity });
      damage += hit.damage; blocked ||= hit.blocked;
    }
    if (ability.healFlat || ability.healFactor) {
      healed = applyTacticalHealing({ actor, target: fighter, healing: (ability.healFlat || 0) + number(stats.focusDamage) * (ability.healFactor || 0), ability: true });
      healing += healed;
    }
    if (ability.effect) {
      const potency = ability.effect === 'protected' ? Math.min(.75, (ability.protection || .4) + (passive(actor) === 'cloud-warden' ? .1 : 0)) : .25;
      giveEffect(fighter, ability.effect, potency, actor.id);
    }
    events.push({ actorId: actor.id, targetId: fighter.id, action: hit.damage ? ability.kind === 'physical' ? 'attack' : 'focus' : healed ? 'potion' : 'guard',
      abilityId: ability.id, damage: hit.damage, healing: healed, blocked: hit.blocked, effect: ability.effect || null });
  }
  if (ability.selfProtection) giveEffect(actor, 'protected', ability.selfProtection, actor.id);
  if (ability.lifeSteal && damage) {
    const healed = applyTacticalHealing({ actor, target: actor, healing: damage * ability.lifeSteal, ability: true });
    healing += healed;
    if (healed) events.push({ actorId: actor.id, targetId: actor.id, action: 'potion', abilityId: ability.id, damage: 0, healing: healed, blocked: false });
  }
  if (ability.partyEnergy) for (const friend of friends.filter(alive)) {
    if (friend.tacticsVersion === 1) friend.energy = Math.min(MAX_AETHER_ENERGY, number(friend.energy) + ability.partyEnergy);
  }
  const actorName = actor.characterName || actor.name || 'Dein Held';
  const recipientName = ability.target === 'party' ? 'die Gruppe' : recipient.characterName || recipient.name || 'das Ziel';
  const log = `${actorName} nutzt ${ability.name} auf ${recipientName}.${damage ? ` ${damage} Schaden.` : ''}${healing ? ` ${healing} LP geheilt.` : ''}${ability.effect ? ` ${ability.effect === 'marked' ? 'Markierung gesetzt.' : ability.effect === 'weakened' ? 'Nächster Angriff geschwächt.' : 'Schutz gewährt.'}` : ''}`;
  return { damage, healing, blocked, targetId: recipient.id, action, abilityId: ability.id, log, logs: [log], events };
}
