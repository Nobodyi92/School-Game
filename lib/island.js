import { randomInt } from 'node:crypto';
import { getCombatStats } from './combat.js';
import { ISLAND_REWARDS } from './cosmetics.js';
export { ISLAND_REWARDS } from './cosmetics.js';

export const ISLAND_LENGTH = 7;
export const ISLAND_BOONS = Object.freeze([
  { id: 'echo', name: 'Doppelblitz', description: 'Jeder zweite normale Angriff löst zusätzlich 7 Blitzschaden aus.', glyph: 'ϟ' },
  { id: 'mirror', name: 'Spiegelschild', description: 'In Deckung wirfst du 6 Schaden auf den Angreifer zurück.', glyph: '◇' },
  { id: 'vigor', name: 'Wurzelkraft', description: '+16 maximale LP und bis zu 22 LP Heilung für diese Reise.', glyph: '❧' },
  { id: 'edge', name: 'Windklinge', description: '+4 Angriff und +3 Fokus-Schaden für diese Reise.', glyph: '➶' },
  { id: 'renew', name: 'Gezeitenquelle', description: 'Erhalte sofort bis zu 28 LP zurück.', glyph: '≈' },
]);

const ROUTE_PAIRS = [['puzzle', 'combat'], ['camp', 'event'], ['combat', 'treasure'],
  ['puzzle', 'event'], ['camp', 'combat'], ['treasure', 'event']];
const ROUTES = {
  puzzle: [['Leuchtstein-Ruinen', 'Entschlüssle die Zeichen. Ein guter Einfall bringt Sternsplitter und neue Kraft.'], ['Das Echo-Tor', 'Ein altes Tor stellt deinen Spürsinn auf die Probe.']],
  combat: [['Kristallhöhle', 'Ein Wächter versperrt den Weg. Ein Sieg bringt Splitter und eine Reisefähigkeit.'], ['Dornenpfad', 'Hier wartet ein Gegner. Lies seine Absicht und wähle deinen Moment.']],
  camp: [['Warmes Quellenlager', 'Sicherer Halt: Entscheide zwischen Heilung und einer neuen Reisefähigkeit.'], ['Windgeschützter Hain', 'Eine Pause zum Durchatmen oder eine Gelegenheit, stärker zu werden.']],
  event: [['Wandernde Windbrücke', 'Eine überraschende Begegnung. Wäge mögliche Gewinne und Risiken ab.'], ['Der flüsternde Wald', 'Nicht jeder Umweg ist ein Verlust. Triff eine Entscheidung.']],
  treasure: [['Muschelbucht', 'Ein Inselfund: Wähle Sternsplitter oder eine vorübergehende Fähigkeit.'], ['Vergessener Leuchtturm', 'Zwischen alten Seekarten wartet etwas Nützliches für deine Reise.']],
  guardian: [['Das Herz der Insel', 'Letzte Station: Bezwinge den Gezeitenwächter und sichere alle Funde.']],
};
const clampLog = run => { run.log = run.log.slice(-30); run.events = run.events.slice(-64); return run; };
const check = (valid, message) => { if (!valid) throw new Error(message); };
const draw = (rng, max) => {
  const value = rng(max);
  check(Number.isInteger(value) && value >= 0 && value < max, 'Ungültiger Insel-Zufallswert.');
  return value;
};
function shuffle(values, rng) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = draw(rng, i + 1); [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function requireActive(run, phase = null) {
  check(run?.status === 'active', 'Diese Inselreise ist bereits beendet.');
  if (phase) check(run.phase === phase, 'Diese Aktion passt nicht zur aktuellen Station.');
}
function emit(run, actorId, targetId, action, damage = 0, healing = 0, extra = {}) {
  run.eventSeq++;
  run.events.push({ id: run.eventSeq, turn: run.version, actorId, targetId, action, damage, healing, blocked: false, ...extra });
}
function heal(run, amount) {
  const gained = Math.min(amount, run.player.maxHp - run.player.hp);
  run.player.hp += gained;
  return gained;
}
function harm(target, amount, guarded = false) {
  const reduced = Math.max(1, Math.round(amount) - Math.min(12, target.stats?.defense || 0));
  const damage = Math.min(target.hp, guarded ? Math.max(1, Math.ceil(reduced * .45)) : reduced);
  target.hp -= damage;
  return damage;
}
function choicesFor(run, rng) {
  const kinds = run.cleared === ISLAND_LENGTH - 1 ? ['guardian'] : run.routeDeck[run.cleared];
  return shuffle(kinds, rng).map((kind, index) => {
    const [title, description] = ROUTES[kind][draw(rng, ROUTES[kind].length)];
    return { id: `path-${run.cleared + 1}-${index}`, kind, title, description };
  });
}
function offersFor(run, rng) {
  const pool = ISLAND_BOONS.filter(boon => !['echo', 'mirror'].includes(boon.id) || !run.boons.includes(boon.id));
  return shuffle(pool, rng).slice(0, 2).map(boon => ({ ...boon }));
}
function lose(run, message) {
  run.status = 'lost'; run.phase = 'finish'; run.pendingRewards = []; run.choices = [];
  run.lastOutcome = { tone: 'danger', title: 'Die Insel bringt dich zurück.', text: message };
  run.log.push(message);
}
function finishStation(run, rng, offerBoon = false) {
  run.cleared++;
  const node = run.current;
  run.history.push({ step: run.cleared, kind: node.kind, title: node.title, outcome: run.lastOutcome?.title || 'Geschafft' });
  for (const id of ISLAND_REWARDS[run.cleared] || []) if (!run.pendingRewards.includes(id)) run.pendingRewards.push(id);
  if (run.cleared === ISLAND_LENGTH) {
    run.status = 'completed'; run.phase = 'finish'; run.choices = [];
    run.lastOutcome = { tone: 'success', title: 'Du hast das Herz der Insel erreicht!', text: 'Alle Inselbelohnungen sind jetzt dauerhaft in deiner Sammlung gesichert.' };
    run.log.push('Der Gezeitenwächter gibt den Weg frei. Deine Reise ist vollendet und alle Funde sind gesichert.');
  } else if (offerBoon) {
    run.phase = 'boon'; run.offers = offersFor(run, rng); run.choices = [];
  } else {
    run.phase = 'route'; run.choices = choicesFor(run, rng); run.enemy = null;
  }
  run.encounter = null;
}

export function createIsland(player, rng = randomInt) {
  check(player && typeof player.id === 'string' && player.id.length > 0, 'Ein Held braucht eine gültige Kennung.');
  const stats = getCombatStats(player);
  const run = {
    status: 'active', phase: 'route', version: 0, cleared: 0,
    player: { id: player.id, name: player.name, characterName: player.characterName || player.name,
      avatar: player.ancestry || player.avatar || 'fox', ancestry: player.ancestry || null, appearance: structuredClone(player.appearance || {}),
      equipmentVisuals: structuredClone(player.equipmentVisuals || {}), cosmetics: structuredClone(player.cosmetics || {}),
      stats, hp: stats.maxHp, maxHp: stats.maxHp, focusCooldown: 0, guarding: false },
    routeDeck: shuffle(ROUTE_PAIRS.map(pair => [...pair]), rng),
    choices: [], current: null, encounter: null, enemy: null, offers: [],
    fragments: 0, boons: [], history: [], pendingRewards: [], combatTurns: 0, attacks: 0, springUsed: false,
    events: [], eventSeq: 0, lastOutcome: null, log: ['Dein Luftschiff setzt dich auf der wandelnden Insel ab. Jeder Weg ist eine neue Entscheidung.'],
  };
  run.choices = choicesFor(run, rng);
  return run;
}

function puzzleFor(rng) {
  const variant = draw(rng, 3);
  if (variant === 0) {
    const start = 2 + draw(rng, 7), jump = 2 + draw(rng, 4), answer = start + jump * 3;
    const values = shuffle([answer, answer - 1, answer + jump], rng);
    return { title: 'Die Leuchtsteinfolge', text: `${start} · ${start + jump} · ${start + jump * 2} · ? Welche Zahl öffnet das Tor?`,
      options: values.map((value, index) => ({ id: `answer-${index}`, label: String(value), hint: 'Wähle die nächste Zahl in der Folge.' })),
      correctOption: `answer-${values.indexOf(answer)}`, explanation: `Die Folge wächst jedes Mal um ${jump}. Gesucht war ${answer}.` };
  }
  if (variant === 1) {
    const count = 3 + draw(rng, 5), answer = count * 2;
    const values = shuffle([answer, count + 2, answer + 2], rng);
    return { title: 'Die Muschelwaage', text: `Eine blaue Muschel wiegt so viel wie zwei weiße. Wie viele weiße Muscheln gleichen ${count} blaue aus?`,
      options: values.map((value, index) => ({ id: `answer-${index}`, label: `${value} weiße Muscheln`, hint: 'Überlege, wie die beiden Sorten zusammenhängen.' })),
      correctOption: `answer-${values.indexOf(answer)}`, explanation: `${count} mal zwei sind ${answer} weiße Muscheln.` };
  }
  const symbols = ['☀', '☾', '✦'];
  const shift = draw(rng, 3), cycle = [...symbols.slice(shift), ...symbols.slice(0, shift)];
  const values = shuffle(symbols, rng);
  return { title: 'Das Zeichenrad', text: `${cycle.join(' · ')} · ${cycle[0]} · ${cycle[1]} · ? Welches Zeichen setzt das Muster fort?`,
    options: values.map((value, index) => ({ id: `answer-${index}`, label: value, hint: 'Das Muster wiederholt sich.' })),
    correctOption: `answer-${values.indexOf(cycle[2])}`, explanation: `Die drei Zeichen wiederholen sich. Als Nächstes folgt ${cycle[2]}.` };
}
function eventFor(rng) {
  const events = [
    { id: 'bridge', title: 'Die Brücke im Wind', text: 'Die Inselstücke treiben auseinander. Du kannst springen oder über den sicheren Steg gehen.',
      options: [{ id: 'jump', label: 'Den Sprung wagen', hint: '50 %: +3 Splitter. Sonst verlierst du 12 LP.' },
        { id: 'safe', label: 'Den sicheren Steg nehmen', hint: '+1 Splitter, kein Lebenspunkteverlust.' }] },
    { id: 'trader', title: 'Der Muschelhändler', text: 'Ein reisender Händler bietet Hilfe gegen Sternsplitter an. Sie gelten nur für diese Reise.',
      options: [{ id: 'trade-boon', label: 'Einen Windsegen kaufen', hint: 'Kostet 2 Splitter. Wähle danach eine Reisefähigkeit.', cost: 2 },
        { id: 'trade-heal', label: 'Eine Quelle kaufen', hint: 'Kostet 1 Splitter und heilt bis zu 22 LP.', cost: 1 },
        { id: 'leave', label: 'Freundlich weiterziehen', hint: 'Kostenlos. Du erhältst einen Sternsplitter.' }] },
    { id: 'scout', title: 'Die gestrandete Späherin', text: 'Eine Späherin bittet dich, ihre Seekarten aus einem Dornengestrüpp zu holen.',
      options: [{ id: 'help', label: 'Die Karten retten', hint: 'Du verlierst 8 LP und bekommst 3 Sternsplitter.' },
        { id: 'guide', label: 'Einen sicheren Weg zeigen', hint: '+1 Splitter. Keine Verletzung.' }] },
  ];
  return structuredClone(events[draw(rng, events.length)]);
}
function enemyFor(step, guardian = false) {
  const hp = guardian ? 88 : 34 + step * 6;
  return { id: 'island-enemy', avatar: guardian ? 'dragon' : step % 2 ? 'owl' : 'cat',
    name: guardian ? 'Gezeitenwächter' : 'Kristallwächter', characterName: guardian ? 'Gezeitenwächter' : 'Kristallwächter',
    hp, maxHp: hp, stats: { defense: guardian ? 2 : 0 }, attackDamage: guardian ? 13 : 6 + step,
    appearance: { color: guardian ? 'mint' : 'sky', outfit: 'knight', emblem: 'moon' }, equipmentVisuals: {},
    pattern: guardian ? ['attack', 'heavy', 'guard'] : ['guard', 'attack', 'heavy'], step: 0,
    intent: guardian ? 'attack' : 'guard', intentLabel: guardian ? 'Ein normaler Angriff steht bevor.' : 'Der Wächter geht als Nächstes in Deckung.', guarding: false };
}

export function chooseIsland(run, choice, rng = randomInt) {
  requireActive(run);
  check(typeof choice === 'string', 'Bitte einen Inselweg oder eine Möglichkeit auswählen.');
  const next = structuredClone(run); next.version++;
  if (run.phase === 'route') {
    const route = run.choices.find(option => option.id === choice);
    check(route, 'Diesen Weg gibt es an dieser Weggabelung nicht.');
    next.current = { ...route }; next.lastOutcome = null; next.enemy = null;
    next.log.push(`Station ${run.cleared + 1}: Du wählst ${route.title}.`);
    if (route.kind === 'combat' || route.kind === 'guardian') {
      next.phase = 'combat'; next.enemy = enemyFor(run.cleared + 1, route.kind === 'guardian');
      next.combatTurns = 0; next.springUsed = false; next.player.focusCooldown = 0; next.player.guarding = false;
    } else {
      next.phase = route.kind;
      next.encounter = route.kind === 'puzzle' ? puzzleFor(rng) : route.kind === 'event' ? eventFor(rng)
        : { title: route.title, text: route.kind === 'camp' ? 'Die Insel gibt dir eine Atempause. Was brauchst du jetzt?' : 'Du findest eine Muscheltruhe mit Vorräten für diese Reise.',
          options: route.kind === 'camp' ? [{ id: 'heal', label: 'An der Quelle ausruhen', hint: 'Heilt bis zu 28 LP.' },
            { id: 'boon', label: 'Dem Wind lauschen', hint: 'Wähle eine neue Reisefähigkeit.' }]
            : [{ id: 'fragments', label: 'Sternsplitter einsammeln', hint: '+3 Splitter und bis zu 8 LP Heilung.' },
              { id: 'boon', label: 'Einen Windsegen bergen', hint: '+1 Splitter und eine Reisefähigkeit.' }] };
    }
  } else if (run.phase === 'boon') {
    const boon = run.offers.find(option => option.id === choice);
    check(boon, 'Diese Reisefähigkeit wird hier nicht angeboten.');
    if (choice === 'edge') { next.player.stats.attackDamage += 4; next.player.stats.focusDamage += 3; }
    if (choice === 'vigor') { next.player.maxHp += 16; next.player.stats.maxHp += 16; heal(next, 22); }
    if (choice === 'renew') heal(next, 28);
    next.boons.push(choice); next.offers = []; next.phase = 'route'; next.enemy = null;
    next.choices = choicesFor(next, rng);
    next.lastOutcome = { tone: 'success', title: `${boon.name} begleitet dich.`, text: 'Dieser Vorteil gilt nur bis zum Ende deiner Inselreise.' };
    next.log.push(`Du wählst ${boon.name}.`);
  } else {
    check(['puzzle', 'event', 'camp', 'treasure'].includes(run.phase), 'Beende zuerst den aktuellen Kampf.');
    const option = run.encounter.options.find(option => option.id === choice);
    check(option, 'Diese Möglichkeit steht hier nicht zur Auswahl.');
    check(next.fragments >= (option.cost || 0), 'Dafür fehlen dir noch Sternsplitter.');
    next.fragments -= option.cost || 0;
    let offerBoon = false, text = '', title = 'Station geschafft.', tone = 'success';
    if (run.phase === 'puzzle') {
      if (choice === run.encounter.correctOption) { next.fragments += 2; heal(next, 6); title = 'Das Tor leuchtet auf!'; text = '+2 Sternsplitter und bis zu 6 LP. '; }
      else { next.player.hp = Math.max(0, next.player.hp - 8); title = 'Das Tor öffnet einen Umweg.'; text = 'Du verlierst 8 LP, darfst aber weiterreisen. '; tone = 'warning'; }
      text += run.encounter.explanation;
    } else if (run.phase === 'camp') {
      if (choice === 'heal') { text = `Die Quelle schenkt dir ${heal(next, 28)} LP.`; title = 'Neue Kraft geschöpft.'; }
      else { offerBoon = true; title = 'Der Wind trägt einen Segen.'; text = 'Wähle gleich deine Reisefähigkeit.'; }
    } else if (run.phase === 'treasure') {
      next.fragments += choice === 'fragments' ? 3 : 1;
      if (choice === 'fragments') heal(next, 8); else offerBoon = true;
      title = 'Ein Fund aus der Muschelbucht!'; text = choice === 'fragments' ? '+3 Sternsplitter und bis zu 8 LP.' : '+1 Sternsplitter und eine Reisefähigkeit.';
    } else if (run.encounter.id === 'bridge') {
      if (choice === 'safe') { next.fragments++; text = 'Du erhältst einen Sternsplitter und kommst unverletzt an.'; }
      else if (draw(rng, 2) === 0) { next.fragments += 3; title = 'Ein perfekter Sprung!'; text = '+3 Sternsplitter.'; }
      else { next.player.hp = Math.max(0, next.player.hp - 12); title = 'Der Wind erwischt dich.'; text = 'Du landest auf der anderen Seite, verlierst dabei aber 12 LP.'; tone = 'warning'; }
    } else if (run.encounter.id === 'trader') {
      offerBoon = choice === 'trade-boon';
      if (choice === 'trade-heal') text = `Der Händler heilt ${heal(next, 22)} LP.`;
      else if (choice === 'leave') { next.fragments++; text = 'Zum Abschied schenkt dir der Händler einen Sternsplitter.'; }
      else text = 'Wähle deinen gekauften Windsegen.';
    } else {
      next.fragments += choice === 'help' ? 3 : 1;
      if (choice === 'help') next.player.hp = Math.max(0, next.player.hp - 8);
      text = choice === 'help' ? 'Die geretteten Karten bringen dir 3 Splitter; die Dornen kosten 8 LP.' : 'Dein Rat hilft: +1 Sternsplitter, ohne Verletzung.';
    }
    next.lastOutcome = { title, text, tone }; next.log.push(`${title} ${text}`);
    if (next.player.hp === 0) lose(next, 'Du bist erschöpft. Ungesicherte Inselbelohnungen bleiben zurück; deine bisherigen Gegenstände sind sicher.');
    else finishStation(next, rng, offerBoon);
  }
  return clampLog(next);
}

export function actOnIsland(run, action, rng = randomInt) {
  requireActive(run, 'combat');
  check(['attack', 'focus', 'guard', 'spring'].includes(action), 'Diese Inselaktion ist nicht bekannt.');
  check(action !== 'focus' || run.player.focusCooldown === 0, 'Dein Fokus muss sich erst wieder aufladen.');
  check(action !== 'spring' || !run.springUsed, 'Die Notquelle wurde in diesem Kampf bereits benutzt.');
  check(action !== 'spring' || run.player.hp < run.player.maxHp, 'Deine Lebenspunkte sind bereits voll.');
  const next = structuredClone(run); next.version++; next.combatTurns++;
  const { player, enemy } = next;
  if (action === 'attack' || action === 'focus') {
    const damage = harm(enemy, action === 'focus' ? player.stats.focusDamage : player.stats.attackDamage, enemy.guarding);
    emit(next, player.id, enemy.id, action, damage, 0, { blocked: enemy.guarding }); enemy.guarding = false;
    next.log.push(`${player.characterName} trifft für ${damage} Schaden.`);
    if (action === 'attack') {
      next.attacks++;
      if (next.boons.includes('echo') && next.attacks % 2 === 0 && enemy.hp > 0) {
        const bonus = harm(enemy, 7); emit(next, player.id, enemy.id, 'focus', bonus);
        next.log.push(`Doppelblitz springt über: weitere ${bonus} Schaden!`);
      }
    }
  } else {
    const healing = heal(next, action === 'spring' ? 20 : player.stats.guardHealing);
    if (action === 'spring') next.springUsed = true; else player.guarding = true;
    emit(next, player.id, player.id, action === 'spring' ? 'potionSmall' : 'guard', 0, healing);
    next.log.push(action === 'spring' ? `Die Notquelle heilt ${healing} LP.` : `Du gehst in Deckung und regenerierst ${healing} LP.`);
  }
  player.focusCooldown = action === 'focus' ? 2 : Math.max(0, player.focusCooldown - 1);
  if (enemy.hp > 0) {
    if (enemy.intent === 'guard') { enemy.guarding = true; emit(next, enemy.id, enemy.id, 'guard'); next.log.push(`${enemy.name} geht in Deckung.`); }
    else {
      const guarded = player.guarding;
      const damage = harm(player, enemy.attackDamage * (enemy.intent === 'heavy' ? 1.6 : 1), guarded);
      emit(next, enemy.id, player.id, enemy.intent === 'heavy' ? 'focus' : 'attack', damage, 0, { blocked: guarded });
      next.log.push(`${enemy.name} trifft dich für ${damage} Schaden.`);
      if (guarded && next.boons.includes('mirror')) {
        const reflected = harm(enemy, 6); emit(next, player.id, enemy.id, 'focus', reflected);
        next.log.push(`Dein Spiegelschild wirft ${reflected} Schaden zurück.`);
      }
      player.guarding = false;
    }
    enemy.step++; enemy.intent = enemy.pattern[enemy.step % enemy.pattern.length];
    enemy.intentLabel = enemy.intent === 'heavy' ? 'Ein schwerer Schlag wird aufgeladen – Deckung hilft!' : enemy.intent === 'guard' ? 'Der Wächter geht als Nächstes in Deckung.' : 'Ein normaler Angriff steht bevor.';
  }
  if (player.hp === 0 || (next.combatTurns >= 40 && enemy.hp > 0)) {
    lose(next, player.hp === 0 ? 'Dein Held zieht sich zurück. Nur ungesicherte Funde dieser Reise gehen verloren.' : 'Der Weg versinkt nach 40 Zügen im Nebel. Deine bisherigen Gegenstände bleiben sicher.');
  } else if (enemy.hp === 0) {
    next.fragments += 2;
    next.lastOutcome = { tone: 'success', title: `${enemy.name} gibt den Weg frei.`, text: '+2 Sternsplitter. Wähle einen Windsegen für den weiteren Weg.' };
    next.log.push(next.lastOutcome.title); next.events.at(-1).winnerId = player.id;
    finishStation(next, rng, true);
  }
  return clampLog(next);
}

export function endIsland(run, abandon = false) {
  requireActive(run);
  check(abandon || (['route', 'boon'].includes(run.phase) && run.cleared > 0), 'Du kannst deine Funde erst nach einer abgeschlossenen Station sichern.');
  const next = structuredClone(run); next.version++;
  if (abandon) lose(next, 'Du verlässt die Insel. Ungesicherte Funde dieser Reise bleiben zurück.');
  else {
    next.status = 'banked'; next.phase = 'finish'; next.choices = [];
    next.lastOutcome = { tone: 'success', title: 'Mit deinen Funden zurückgekehrt.', text: 'Deine Inselbelohnungen sind dauerhaft in der Sammlung gesichert.' };
    next.log.push('Du kehrst mit den gesicherten Funden zum Luftschiff zurück.');
  }
  return clampLog(next);
}

/** Do not send future routes or a puzzle's solution to the browser. */
export function islandPublicState(run) {
  const state = structuredClone(run);
  delete state.routeDeck;
  if (state.encounter) delete state.encounter.correctOption;
  if (state.phase === 'puzzle' && state.encounter) delete state.encounter.explanation;
  return state;
}
