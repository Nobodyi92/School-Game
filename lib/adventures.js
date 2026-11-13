import { getCombatStats } from './combat.js';

export const TOWER_MAX_FLOOR = 10;
export const LOBBY_MIN = 3;
export const LOBBY_MAX = 5;
export const TOWER_BOONS = Object.freeze([
  Object.freeze({ id: 'vigor', name: 'Lebensfunke', description: '+18 maximale LP und bis zu 25 LP Heilung für diesen Aufstieg.' }),
  Object.freeze({ id: 'power', name: 'Mutklinge', description: '+4 Angriffsschaden für diesen Aufstieg.' }),
  Object.freeze({ id: 'focus', name: 'Sternenfokus', description: '+5 Fokus-Schaden für diesen Aufstieg.' }),
]);

const TOWER_REWARDS = {
  2: ['pet-firefly'], 4: ['outfit-starlight'], 6: ['trophy-tower-bronze'],
  8: ['pet-cloud'], 10: ['outfit-warden', 'trophy-tower-gold'],
};
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
  return {
    id: player.id, name: player.name || 'Held', characterName: player.characterName || player.name || 'Held',
    avatar: player.ancestry || player.avatar || 'fox', ancestry: player.ancestry || null, appearance: clone(player.appearance || {}),
    cosmetics: clone(player.cosmetics || { owned: [], selected: { companion: null, outfit: null } }),
    equipmentVisuals: clone(player.equipmentVisuals || {}), skills: clone(player.skills || { strength: 1, focus: 1, endurance: 1 }),
    stats, hp: stats.maxHp, maxHp: stats.maxHp, focusCooldown: 0, guarding: false,
  };
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
  return {
    status: 'active', floor: 1, cleared: 0, player: hero, enemy: enemyFor(1),
    boons: [], log: [`${hero.characterName} betritt den Turm der Prüfungen.`],
    events: [], eventSeq: 0, turns: 0, totalTurns: 0, restUsed: false, pendingRewards: [],
  };
}

/** One player action and the announced enemy response; no account inventory is used. */
export function applyTowerAction(run, action) {
  check(run?.status === 'active', 'Auf dieser Ebene läuft gerade kein Kampf.');
  check(TOWER_ACTIONS.has(action), 'Diese Turmaktion ist nicht bekannt.');
  check(action !== 'focus' || run.player.focusCooldown === 0, 'Dein Fokus muss sich erst wieder aufladen.');
  check(action !== 'rest' || !run.restUsed, 'Die Turmquelle wurde auf dieser Ebene bereits benutzt.');
  check(action !== 'rest' || run.player.hp < run.player.maxHp, 'Deine Lebenspunkte sind bereits voll.');
  const next = clone(run);
  const { player, enemy } = next;
  next.turns++; next.totalTurns++;
  if (action === 'attack' || action === 'focus') {
    const dealt = damageTo(enemy, action === 'focus' ? player.stats.focusDamage : player.stats.attackDamage, enemy.guarding);
    event(next, player.id, enemy.id, action, dealt, 0, { blocked: enemy.guarding });
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
    const dealt = damageTo(player, enemy.attackDamage * scale, player.guarding);
    event(next, enemy.id, player.id, enemy.intent === 'attack' ? 'attack' : 'focus', dealt, 0, { blocked: player.guarding });
    player.guarding = false;
    next.log.push(`${enemy.name} ${enemy.intent === 'heavy' ? 'setzt den schweren Schlag ein' : enemy.intent === 'focus' ? 'nutzt einen Fokusstoß' : 'greift an'}: ${dealt} Schaden.`);
  }
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
  next.enemy = enemyFor(next.floor);
  next.log.push(`${TOWER_BOONS.find(boon => boon.id === choice).name} begleitet dich auf Ebene ${next.floor}.`);
  return cap(next);
}

function raidIntent(state) {
  state.boss.intent = state.round % 2 ? 'stampede' : 'slam';
  const alive = state.members.filter(member => member.hp > 0);
  const target = [...alive].sort((a, b) => b.hp - a.hp)[0];
  state.boss.targetId = state.boss.intent === 'slam' ? target?.id || null : null;
  state.boss.intentLabel = state.boss.intent === 'slam'
    ? `Faustschlag gegen ${target?.characterName || 'einen Helden'} – Deckung schützt!`
    : 'Stampfen gegen die ganze Gruppe – Deckung verringert den Schaden.';
}

export function createRaid(participants) {
  check(Array.isArray(participants) && participants.length >= LOBBY_MIN && participants.length <= LOBBY_MAX,
    'Für den Runengolem braucht ihr drei bis fünf unterschiedliche Helden.');
  const members = participants.map(player => ({ ...snapshot(player), action: null }));
  check(new Set(members.map(member => member.id)).size === members.length, 'Jeder Held darf nur einmal zur Gruppe gehören.');
  const maxHp = 180 + 45 * members.length;
  const state = {
    status: 'active', round: 1, members,
    boss: { id: 'rune-golem', name: 'Runengolem', characterName: 'Runengolem', avatar: 'golem', kind: 'golem',
      hp: maxHp, maxHp, shielded: true, intent: 'stampede', targetId: null, equipmentVisuals: {} },
    actions: {}, log: ['Der Runengolem erwacht! Sonnen- und Mondrune müssen in derselben Runde von zwei Helden aktiviert werden.'],
    events: [], eventSeq: 0, runeshield: { sun: false, moon: false, broken: false },
  };
  raidIntent(state);
  return state;
}

/** Queue one immutable action per living member; resolve only a complete group round. */
export function submitRaidAction(state, actorId, action) {
  check(state?.status === 'active', 'Dieser Gruppenbosskampf ist bereits beendet.');
  const member = state.members.find(candidate => candidate.id === actorId);
  check(member, 'Du gehörst nicht zu dieser Gruppe.');
  check(member.hp > 0, 'Dein Held ist in diesem Kampf bereits ausgeschieden.');
  check(RAID_ACTIONS.has(action), 'Diese Gruppenaktion ist nicht bekannt.');
  check(!Object.hasOwn(state.actions, actorId), 'Deine Aktion für diese Runde steht bereits fest.');
  check(action !== 'focus' || member.focusCooldown === 0, 'Dein Fokus muss sich erst wieder aufladen.');
  const next = clone(state);
  const alive = next.members.filter(candidate => candidate.hp > 0);
  if (alive.length < 2) {
    next.status = 'lost'; next.log.push('Der Runengolem kann nicht von einem einzelnen Helden bezwungen werden.');
    return cap(next);
  }
  next.actions[actorId] = action;
  next.members.find(candidate => candidate.id === actorId).action = action;
  if (!alive.every(candidate => Object.hasOwn(next.actions, candidate.id))) return next;
  return resolveRaidRound(next);
}

function resolveRaidRound(state) {
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
