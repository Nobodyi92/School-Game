import { getCombatStats } from './combat.js';
import { TOWER_REWARDS } from './cosmetics.js';
import { initializeTactics, isTacticalAction, validateTacticalAction, executeTacticalAction, gainTacticalEnergy, applyTacticalDamage, finishTacticalTurn } from './tactics.js';

export const TOWER_MAX_FLOOR = 10;
export const LOBBY_MIN = 3;
export const LOBBY_MAX = 5;
export const TOWER_BOONS = Object.freeze([
  Object.freeze({ id: 'vigor', name: 'Lebensfunke', description: '+18 maximale LP und bis zu 25 LP Heilung für diesen Aufstieg.' }),
  Object.freeze({ id: 'power', name: 'Mutklinge', description: '+4 Angriffsschaden für diesen Aufstieg.' }),
  Object.freeze({ id: 'focus', name: 'Sternenfokus', description: '+5 Fokus-Schaden für diesen Aufstieg.' }),
]);

const TOWER_ACTIONS = new Set(['attack', 'focus', 'guard', 'rest']);
const RAID_ACTIONS = new Set(['attack', 'focus', 'guard', 'runeSun', 'runeMoon']);
const clone = value => structuredClone(value);
const cap = state => { state.log = state.log.slice(-30); state.events = state.events.slice(-64); return state; };

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function snapshot(player) {
  check(player && typeof player.id === 'string' && player.id.trim(), 'Ein Held braucht eine gültige ID.');
  const stats = getCombatStats(player);
  return initializeTactics({
    id: player.id, name: player.name || 'Held', characterName: player.characterName || player.name || 'Held',
    avatar: player.ancestry || player.avatar || 'fox', ancestry: player.ancestry || null, appearance: clone(player.appearance || {}),
    cosmetics: clone(player.cosmetics || { owned: [], selected: { companion: null, outfit: null } }),
    equipmentVisuals: clone(player.equipmentVisuals || {}), skills: clone(player.skills || { strength: 1, focus: 1, endurance: 1 }),
    stats, hp: stats.maxHp, maxHp: stats.maxHp, focusCooldown: 0, guarding: false,
  }, player);
}

function event(state, actorId, targetId, action, damage = 0, healing = 0, extra = {}) {
  state.eventSeq = (state.eventSeq || 0) + 1;
  const entry = { id: state.eventSeq, turn: state.totalTurns ?? state.round ?? state.turns ?? 0,
    actorId, targetId, action, damage, healing, blocked: false, ...extra };
  state.events.push(entry);
  return entry;
}

function damageTo(target, damage, guarded = false) {
  const defense = Math.min(12, Math.max(0, target.stats?.defense || 0));
  const mitigated = Math.max(1, Math.round(damage) - defense);
  const taken = Math.min(target.hp, guarded ? Math.max(1, Math.ceil(mitigated * .45)) : mitigated);
  target.hp -= taken;
  return taken;
}

function tacticalNpc(fighter) {
  fighter.tacticsVersion = 1; fighter.effects = {};
  return fighter;
}
function recordTacticalAction(state, actor, result) {
  for (const entry of result.events || [{ action: result.healing ? 'potion' : 'focus', targetId: result.targetId, damage: result.damage, healing: result.healing, blocked: result.blocked }]) {
    event(state, actor.id, entry.targetId, entry.action, entry.damage || 0, entry.healing || 0,
      { blocked: Boolean(entry.blocked), abilityId: result.abilityId, effect: entry.effect || null });
  }
  if (result.log) state.log.push(...(Array.isArray(result.log) ? result.log : [result.log]));
}

function enemyFor(floor) {
  const kinds = [
    { kind: 'sentinel', name: 'Runenhüter', avatar: 'owl', pattern: ['guard', 'attack', 'heavy'] },
    { kind: 'trickster', name: 'Nebelpfote', avatar: 'cat', pattern: ['focus', 'attack', 'guard'] },
    { kind: 'brute', name: 'Steinbrecher', avatar: 'dragon', pattern: ['attack', 'heavy', 'attack'] },
  ];
  const design = kinds[(floor - 1) % kinds.length];
  const maxHp = 40 + floor * 8;
  const attackDamage = 6 + Math.ceil(floor * 1.4);
  const defense = Math.floor((floor - 1) / 4);
  const intent = design.pattern[0];
  return {
    id: 'tower-enemy', name: design.name, characterName: `${design.name} · Ebene ${floor}`,
    avatar: design.avatar, kind: design.kind, hp: maxHp, maxHp, attackDamage,
    stats: { maxHp, attackDamage, defense }, appearance: { color: ['violet', 'sky', 'rose'][(floor - 1) % 3], outfit: 'knight', emblem: 'moon' },
    equipmentVisuals: {}, intent, intentLabel: towerIntentLabel(intent), pattern: design.pattern, step: 0, guarding: false,
  };
}

function towerIntentLabel(intent) {
  return { attack: 'Bereitet einen normalen Angriff vor.', guard: 'Geht als Nächstes in Deckung.',
    heavy: 'Lädt einen schweren Schlag auf – Deckung hilft!', focus: 'Bündelt einen kräftigen Fokusstoß.' }[intent];
}

export function createTower(player) {
  const hero = snapshot(player);
  const enemy = tacticalNpc(enemyFor(1));
  return {
    tacticsVersion: 1, status: 'active', floor: 1, cleared: 0, player: hero, enemy,
    boons: [], log: [`${hero.characterName} betritt den Turm der Prüfungen.`],
    events: [], eventSeq: 0, turns: 0, totalTurns: 0, restUsed: false, pendingRewards: [],
  };
}

/** One player action and the announced enemy response; no account inventory is used. */
export function applyTowerAction(run, action, targetId) {
  check(run?.status === 'active', 'Auf dieser Ebene läuft gerade kein Kampf.');
  const tactical = run.tacticsVersion === 1;
  const ability = tactical && isTacticalAction(action);
  check(TOWER_ACTIONS.has(action) || ability, 'Diese Turmaktion ist nicht bekannt.');
  check(action !== 'focus' || run.player.focusCooldown === 0, 'Dein Fokus muss sich erst wieder aufladen.');
  check(!tactical || action !== 'focus' || run.player.energy >= 2, 'Für den Fokusstoß brauchst du 2 Ätherenergie.');
  check(action !== 'rest' || !run.restUsed, 'Die Turmquelle wurde auf dieser Ebene bereits benutzt.');
  check(action !== 'rest' || run.player.hp < run.player.maxHp, 'Deine Lebenspunkte sind bereits voll.');
  const next = clone(run);
  const { player, enemy } = next;
  next.turns++; next.totalTurns++;
  if (tactical && action === 'focus') player.energy -= 2;
  if (ability) {
    const result = executeTacticalAction({ actor: player, target: enemy, allies: [player], action, targetId });
    recordTacticalAction(next, player, result);
  } else if (action === 'attack' || action === 'focus') {
    const outcome = tactical ? applyTacticalDamage({ actor: player, target: enemy, damage: action === 'focus' ? player.stats.focusDamage : player.stats.attackDamage, guarded: enemy.guarding }) : { damage: damageTo(enemy, action === 'focus' ? player.stats.focusDamage : player.stats.attackDamage, enemy.guarding), blocked: enemy.guarding };
    const dealt = outcome.damage;
    event(next, player.id, enemy.id, action, dealt, 0, { blocked: outcome.blocked });
    enemy.guarding = false;
    next.log.push(`${player.characterName} ${action === 'focus' ? 'nutzt den Fokusstoß' : 'greift an'}: ${dealt} Schaden.`);
  } else {
    const healed = Math.min(action === 'rest' ? 20 : player.stats.guardHealing, player.maxHp - player.hp);
    player.hp += healed;
    if (action === 'rest') next.restUsed = true;
    else player.guarding = true;
    event(next, player.id, player.id, action === 'rest' ? 'potionSmall' : 'guard', 0, healed);
    next.log.push(action === 'rest' ? `Die Turmquelle heilt ${healed} LP. Sie ist auf dieser Ebene nun leer.` : `${player.characterName} schützt sich und regeneriert ${healed} LP.`);
  }
  if (tactical) { gainTacticalEnergy(player, action); finishTacticalTurn(player); }
  player.focusCooldown = action === 'focus' ? 2 : Math.max(0, player.focusCooldown - 1);
  if (enemy.hp === 0) {
    next.cleared = next.floor;
    for (const reward of TOWER_REWARDS[next.floor] || []) {
      if (!next.pendingRewards.includes(reward)) next.pendingRewards.push(reward);
    }
    next.status = next.floor === TOWER_MAX_FLOOR ? 'completed' : 'choice';
    next.log.push(`Ebene ${next.floor} geschafft! ${next.status === 'completed' ? 'Der Turm ist bezwungen. Alle Funde sind gesichert!' : 'Sichere deine Funde oder wähle einen Turmsegen für die nächste Ebene.'}`);
    next.events.at(-1).winnerId = player.id;
    return cap(next);
  }
  if (enemy.intent === 'guard') {
    enemy.guarding = true;
    event(next, enemy.id, enemy.id, 'guard');
    next.log.push(`${enemy.name} geht in Deckung. Der nächste Treffer wird abgeschwächt.`);
  } else {
    const scale = enemy.intent === 'heavy' ? 1.7 : enemy.intent === 'focus' ? 1.35 : 1;
    const outcome = tactical ? applyTacticalDamage({ actor: enemy, target: player, damage: enemy.attackDamage * scale, guarded: player.guarding }) : { damage: damageTo(player, enemy.attackDamage * scale, player.guarding), blocked: player.guarding };
    const dealt = outcome.damage;
    event(next, enemy.id, player.id, enemy.intent === 'attack' ? 'attack' : 'focus', dealt, 0, { blocked: outcome.blocked });
    player.guarding = false;
    next.log.push(`${enemy.name} ${enemy.intent === 'heavy' ? 'setzt den schweren Schlag ein' : enemy.intent === 'focus' ? 'nutzt einen Fokusstoß' : 'greift an'}: ${dealt} Schaden.`);
  }
  if (tactical) finishTacticalTurn(enemy);
  enemy.step++;
  enemy.intent = enemy.pattern[enemy.step % enemy.pattern.length];
  enemy.intentLabel = towerIntentLabel(enemy.intent);
  if (player.hp === 0 || next.turns >= 50) {
    next.status = 'lost'; next.pendingRewards = [];
    next.log.push(player.hp === 0 ? 'Dein Held zieht sich zurück. Ungesicherte Funde bleiben im Turm; deine Ausrüstung und XP sind sicher.' : 'Die Ebene schließt sich nach 50 Zügen. Ungesicherte Funde bleiben im Turm.');
  }
  return cap(next);
}

export function applyTowerChoice(run, choice) {
  check(run?.status === 'choice', 'Du kannst erst nach einer gewonnenen Ebene entscheiden.');
  check(choice === 'bank' || TOWER_BOONS.some(boon => boon.id === choice), 'Diesen Turmsegen gibt es nicht.');
  const next = clone(run);
  if (choice === 'bank') {
    next.status = 'banked'; next.log.push('Du kehrst mit deinen gesicherten Funden zurück.');
    return cap(next);
  }
  check(next.floor < TOWER_MAX_FLOOR, 'Die Spitze des Turms ist bereits erreicht.');
  if (choice === 'vigor') {
    next.player.maxHp += 18; next.player.stats.maxHp += 18;
    next.player.hp = Math.min(next.player.maxHp, next.player.hp + 25);
  } else if (choice === 'power') next.player.stats.attackDamage += 4;
  else next.player.stats.focusDamage += 5;
  next.boons.push(choice);
  next.floor++; next.turns = 0; next.restUsed = false; next.status = 'active';
  next.player.focusCooldown = 0; next.player.guarding = false;
  next.enemy = run.tacticsVersion === 1 ? tacticalNpc(enemyFor(next.floor)) : enemyFor(next.floor);
  if (run.tacticsVersion === 1) {
    next.player.effects = {};
    next.player.energy = next.player.tacticalAncestry === 'sky-nomad' ? 3 : 2;
  }
  next.log.push(`${TOWER_BOONS.find(boon => boon.id === choice).name} begleitet dich auf Ebene ${next.floor}.`);
  return cap(next);
}

function raidIntent(state) {
  state.boss.intent = state.round % 2 ? 'stampede' : 'slam';
  const alive = state.members.filter(member => member.hp > 0);
  const target = [...alive].sort((a, b) => b.hp - a.hp)[0];
  state.boss.targetId = state.boss.intent === 'slam' ? target?.id || null : null;
  if (state.tacticsVersion === 1 && state.boss.phase === 'onslaught') state.boss.intent = 'stampede';
  if (state.tacticsVersion === 1 && state.boss.phase === 'core') state.boss.intent = state.round % 2 ? 'slam' : 'stampede';
  state.boss.targetId = state.boss.intent === 'slam' ? target?.id || null : null;
  state.boss.intentLabel = state.boss.intent === 'slam'
    ? `Faustschlag gegen ${target?.characterName || 'einen Helden'} – Deckung schützt!`
    : 'Stampfen gegen die ganze Gruppe – Deckung verringert den Schaden.';
  if (state.tacticsVersion === 1 && state.boss.phase === 'onslaught') state.boss.intentLabel = 'Steinsturm gegen die ganze Gruppe: Heilung, Schutz und Deckung helfen!';
  if (state.tacticsVersion === 1 && state.boss.phase === 'core') state.boss.intentLabel = `Runenwut: ${state.boss.intent === 'slam' ? `schwerer Kernschlag gegen ${target?.characterName || 'einen Helden'}` : 'schwere Ätherwelle gegen die ganze Gruppe'} – der Kern ist verwundbar!`;
}

export function createRaid(participants) {
  check(Array.isArray(participants) && participants.length >= LOBBY_MIN && participants.length <= LOBBY_MAX,
    'Für den Runengolem braucht ihr drei bis fünf unterschiedliche Helden.');
  const members = participants.map(player => ({ ...snapshot(player), action: null }));
  check(new Set(members.map(member => member.id)).size === members.length, 'Jeder Held darf nur einmal zur Gruppe gehören.');
  const maxHp = 180 + 45 * members.length;
  const state = {
    tacticsVersion: 1, status: 'active', round: 1, members,
    boss: { id: 'rune-golem', name: 'Runengolem', characterName: 'Runengolem', avatar: 'golem', kind: 'golem',
      hp: maxHp, maxHp, shielded: true, intent: 'stampede', targetId: null, equipmentVisuals: {} },
    actions: {}, actionTargets: {}, log: ['Der Runengolem erwacht! Sonnen- und Mondrune müssen in derselben Runde von zwei Helden aktiviert werden.'],
    events: [], eventSeq: 0, runeshield: { sun: false, moon: false, broken: false },
  };
  tacticalNpc(state.boss);
  setRaidPhase(state);
  raidIntent(state);
  return state;
}

/** Queue one immutable action per living member; resolve only a complete group round. */
export function submitRaidAction(state, actorId, action, targetId) {
  check(state?.status === 'active', 'Dieser Gruppenbosskampf ist bereits beendet.');
  const member = state.members.find(candidate => candidate.id === actorId);
  check(member, 'Du gehörst nicht zu dieser Gruppe.');
  check(member.hp > 0, 'Dein Held ist in diesem Kampf bereits ausgeschieden.');
  const ability = state.tacticsVersion === 1 && isTacticalAction(action);
  check(RAID_ACTIONS.has(action) || ability, 'Diese Gruppenaktion ist nicht bekannt.');
  check(!Object.hasOwn(state.actions, actorId), 'Deine Aktion für diese Runde steht bereits fest.');
  check(action !== 'focus' || member.focusCooldown === 0, 'Dein Fokus muss sich erst wieder aufladen.');
  check(state.tacticsVersion !== 1 || action !== 'focus' || member.energy >= 2, 'Für den Fokusstoß brauchst du 2 Ätherenergie.');
  if (ability) validateTacticalAction({ actor: member, target: state.boss, allies: state.members, action, targetId });
  const next = clone(state);
  const alive = next.members.filter(candidate => candidate.hp > 0);
  if (alive.length < 2) {
    next.status = 'lost'; next.log.push('Der Runengolem kann nicht von einem einzelnen Helden bezwungen werden.');
    return cap(next);
  }
  next.actions[actorId] = action;
  if (next.tacticsVersion === 1) {
    next.actionTargets ||= {};
    if (targetId !== undefined) next.actionTargets[actorId] = targetId;
  }
  next.members.find(candidate => candidate.id === actorId).action = action;
  if (!alive.every(candidate => Object.hasOwn(next.actions, candidate.id))) return next;
  return next.tacticsVersion === 1 ? resolveTacticalRaidRound(next) : resolveRaidRoundLegacy(next);
}

function resolveRaidRoundLegacy(state) {
  const alive = state.members.filter(member => member.hp > 0);
  const sun = alive.find(member => state.actions[member.id] === 'runeSun');
  const moon = alive.find(member => state.actions[member.id] === 'runeMoon');
  const broken = Boolean(sun && moon && sun.id !== moon.id);
  state.runeshield = { sun: Boolean(sun), moon: Boolean(moon), broken };
  state.boss.shielded = !broken;
  state.log.push(`Runde ${state.round}: ${broken ? 'Sonnen- und Mondrune zerbrechen den Runenschild!' : 'Der Runenschild bleibt geschlossen. Es braucht Sonnen- und Mondrune von unterschiedlichen Helden.'}`);
  for (const member of alive) {
    const action = state.actions[member.id];
    member.guarding = action === 'guard';
    if (action === 'guard') {
      const healing = Math.min(member.stats.guardHealing, member.maxHp - member.hp);
      member.hp += healing;
      event(state, member.id, member.id, 'guard', 0, healing);
    } else if (action === 'runeSun' || action === 'runeMoon') {
      event(state, member.id, member.id, action, 0, 0, { rune: action === 'runeSun' ? 'sun' : 'moon' });
    } else {
      const base = action === 'focus' ? member.stats.focusDamage : member.stats.attackDamage;
      const damage = Math.min(state.boss.hp, broken ? base : 1);
      state.boss.hp -= damage;
      event(state, member.id, state.boss.id, action, damage, 0, { blocked: !broken });
      state.log.push(`${member.characterName} trifft den Golem für ${damage} Schaden.`);
    }
    member.focusCooldown = action === 'focus' ? 2 : Math.max(0, member.focusCooldown - 1);
  }
  if (broken && state.boss.hp > 0) {
    const damage = Math.min(state.boss.hp, 50 + 10 * (state.members.length - LOBBY_MIN));
    state.boss.hp -= damage;
    event(state, sun.id, state.boss.id, 'focus', damage, 0, { runeBreak: true });
    state.log.push(`Der Runenbruch verursacht zusätzlich ${damage} Schaden.`);
  }
  if (state.boss.hp === 0) {
    state.status = 'won';
    state.events.at(-1).winnerId = alive[0].id;
    state.log.push('Gemeinsam habt ihr den Runengolem bezwungen! Eure Trophäe, das Outfit und der Begleiter warten auf euch.');
    return cap(state);
  }
  if (state.round >= 12) {
    for (const member of alive) {
      const damage = member.hp; member.hp = 0;
      event(state, state.boss.id, member.id, 'focus', damage);
    }
    state.status = 'lost'; state.log.push('Der Golem entfesselt nach zwölf Runden seine Runenwut. Versucht gemeinsam eine neue Strategie!');
    return cap(state);
  }
  const targets = state.boss.intent === 'slam' ? alive.filter(member => member.id === state.boss.targetId) : alive;
  const baseDamage = state.boss.intent === 'slam' ? 20 + state.round * 2 : 10 + (state.round - 1) * 2;
  for (const member of targets) {
    const damage = damageTo(member, baseDamage, member.guarding);
    event(state, state.boss.id, member.id, state.boss.intent === 'slam' ? 'focus' : 'attack', damage, 0, { blocked: member.guarding });
    state.log.push(`Der Runengolem trifft ${member.characterName} für ${damage} Schaden.${member.hp === 0 ? ' Dieser Held scheidet aus.' : ''}`);
  }
  if (state.members.filter(member => member.hp > 0).length < 2) {
    state.status = 'lost'; state.log.push('Zu wenige Helden stehen noch. Der Runengolem erfordert echte Zusammenarbeit.');
    return cap(state);
  }
  state.round++;
  state.actions = {};
  for (const member of state.members) { member.action = null; member.guarding = false; }
  state.boss.shielded = true;
  raidIntent(state);
  return cap(state);
}

const RAID_PHASES = Object.freeze({
  armor: { index: 1, name: 'Runenpanzer', description: 'Sonnen- und Mondrune von zwei Helden öffnen das Runenschild für diese Runde.' },
  onslaught: { index: 2, name: 'Steinsturm', description: 'Der Runenpanzer ist zerbrochen. Schützt und heilt euch vor dem angekündigten Steinsturm.' },
  core: { index: 3, name: 'Offener Kristallkern', description: 'Der Kern erleidet 25 % mehr Schaden. Seine Runenwut kündigt besonders schwere Gegenangriffe an.' },
});

function setRaidPhase(state) {
  const ratio = state.boss.hp / state.boss.maxHp;
  const phase = ratio > .65 ? 'armor' : ratio > .3 ? 'onslaught' : 'core';
  const previous = state.boss.phase;
  const data = RAID_PHASES[phase];
  Object.assign(state.boss, { phase, phaseIndex: data.index, phaseName: data.name, phaseDescription: data.description,
    shielded: phase === 'armor', vulnerability: phase === 'core' ? 1.25 : 1 });
  if (previous && previous !== phase) state.log.push(`Neue Bossphase: ${data.name}. ${data.description}`);
}

function raidActionPriority(state, member) {
  const action = state.actions[member.id];
  if (!isTacticalAction(action)) return action === 'guard' ? 0 : 2;
  const { ability } = validateTacticalAction({ actor: member, target: state.boss, allies: state.members,
    action, targetId: state.actionTargets?.[member.id] });
  // Support and marks resolve before heavier hits, regardless of lobby join order.
  return ability.kind === 'support' ? 0 : ability.effect === 'marked' || ability.breakGuard ? 1 : 2;
}

function resolveTacticalRaidRound(state) {
  const alive = state.members.filter(member => member.hp > 0);
  const sun = alive.find(member => state.actions[member.id] === 'runeSun');
  const moon = alive.find(member => state.actions[member.id] === 'runeMoon');
  const broken = Boolean(sun && moon && sun.id !== moon.id);
  const phase = state.boss.phase || 'armor';
  const open = phase !== 'armor' || broken;
  const damageScale = phase === 'core' ? 1.25 : 1;
  const maxDamage = open ? Infinity : 1;
  state.runeshield = { sun: Boolean(sun), moon: Boolean(moon), broken };
  state.boss.shielded = !open;
  state.log.push(`Runde ${state.round}: ${phase !== 'armor' ? 'Der Runenpanzer bleibt offen. Nutzt eure Fähigkeiten gemeinsam!' : broken ? 'Sonnen- und Mondrune zerbrechen den Runenschild!' : 'Der Runenschild bleibt geschlossen. Es braucht Sonnen- und Mondrune von unterschiedlichen Helden.'}`);
  const order = alive.map((member, index) => ({ member, index, priority: raidActionPriority(state, member) }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index).map(entry => entry.member);
  for (const member of order) {
    if (state.boss.hp <= 0) break;
    const action = state.actions[member.id];
    member.guarding = action === 'guard';
    if (isTacticalAction(action)) {
      const result = executeTacticalAction({ actor: member, target: state.boss, allies: state.members,
        action, targetId: state.actionTargets?.[member.id], damageScale, maxDamage, allowFullHealth: true });
      recordTacticalAction(state, member, result);
    } else if (action === 'guard') {
      const healing = Math.min(member.stats.guardHealing, member.maxHp - member.hp);
      member.hp += healing;
      event(state, member.id, member.id, 'guard', 0, healing);
    } else if (action === 'runeSun' || action === 'runeMoon') {
      event(state, member.id, member.id, action, 0, 0, { rune: action === 'runeSun' ? 'sun' : 'moon' });
    } else {
      if (action === 'focus') member.energy -= 2;
      const base = action === 'focus' ? member.stats.focusDamage : member.stats.attackDamage;
      const result = applyTacticalDamage({ actor: member, target: state.boss, damage: base, damageScale, maxDamage });
      event(state, member.id, state.boss.id, action, result.damage, 0, { blocked: !open || result.blocked });
      state.log.push(`${member.characterName} trifft den Golem für ${result.damage} Schaden.`);
    }
    gainTacticalEnergy(member, action);
    finishTacticalTurn(member);
    member.focusCooldown = action === 'focus' ? 2 : Math.max(0, member.focusCooldown - 1);
  }
  if (broken && state.boss.hp > 0) {
    const damage = Math.min(state.boss.hp, 50 + 10 * (state.members.length - LOBBY_MIN));
    state.boss.hp -= damage;
    event(state, sun.id, state.boss.id, 'focus', damage, 0, { runeBreak: true });
    state.log.push(`Der Runenbruch verursacht zusätzlich ${damage} Schaden.`);
  }
  if (state.boss.hp === 0) {
    state.status = 'won';
    state.events.at(-1).winnerId = alive[0].id;
    state.log.push('Gemeinsam habt ihr den Runengolem bezwungen! Eure Trophäe, das Outfit und der Begleiter warten auf euch.');
    return cap(state);
  }
  if (state.round >= 12) {
    for (const member of alive) {
      const damage = member.hp; member.hp = 0;
      event(state, state.boss.id, member.id, 'focus', damage);
    }
    state.status = 'lost'; state.log.push('Der Golem entfesselt nach zwölf Runden seine Runenwut. Versucht gemeinsam eine neue Strategie!');
    return cap(state);
  }
  const targets = state.boss.intent === 'slam' ? alive.filter(member => member.id === state.boss.targetId) : alive;
  const base = state.boss.intent === 'slam' ? 20 + state.round * 2 : 10 + (state.round - 1) * 2;
  const outgoingScale = phase === 'core' ? 1.65 : phase === 'onslaught' ? 1.4 : 1;
  const sourceEffects = clone(state.boss.effects || {});
  for (const member of targets) {
    // One announced area attack is one weakened attack against the whole group.
    const source = { ...state.boss, effects: clone(sourceEffects) };
    const result = applyTacticalDamage({ actor: source, target: member, damage: base * outgoingScale, guarded: member.guarding });
    event(state, state.boss.id, member.id, state.boss.intent === 'slam' ? 'focus' : 'attack', result.damage, 0, { blocked: result.blocked });
    state.log.push(`Der Runengolem trifft ${member.characterName} für ${result.damage} Schaden.${member.hp === 0 ? ' Dieser Held scheidet aus.' : ''}`);
  }
  if (targets.length && state.boss.effects) delete state.boss.effects.weakened;
  finishTacticalTurn(state.boss);
  if (state.members.filter(member => member.hp > 0).length < 2) {
    state.status = 'lost'; state.log.push('Zu wenige Helden stehen noch. Der Runengolem erfordert echte Zusammenarbeit.');
    return cap(state);
  }
  state.round++;
  state.actions = {}; state.actionTargets = {};
  for (const member of state.members) { member.action = null; member.guarding = false; }
  setRaidPhase(state);
  raidIntent(state);
  return cap(state);
}
