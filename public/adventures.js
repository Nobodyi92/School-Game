let mode = 'tower';
let selectedRaidId = null;
const seenEvents = new Map();
let animationGeneration = 0;
let animating = false;

const rewardSources = {
  'pet-firefly': 'Turm: Etage 2 schaffen und die Funde sichern.',
  'outfit-starlight': 'Turm: Etage 4 schaffen und die Funde sichern.',
  'trophy-tower-bronze': 'Turm: Etage 6 schaffen und die Funde sichern.',
  'pet-cloud': 'Turm: Etage 8 schaffen und die Funde sichern.',
  'outfit-warden': 'Den Turm bis Etage 10 bezwingen.',
  'trophy-tower-gold': 'Den Turm bis Etage 10 bezwingen.',
  'pet-rune': 'Den Runengolem gemeinsam besiegen und mitspielen.',
  'outfit-runekeeper': 'Den Runengolem gemeinsam besiegen und mitspielen.',
  'trophy-golem': 'Den Runengolem gemeinsam besiegen und mitspielen.',
};
const milestoneFloors = { 2: ['pet-firefly'], 4: ['outfit-starlight'], 6: ['trophy-tower-bronze'], 8: ['pet-cloud'], 10: ['outfit-warden', 'trophy-tower-gold'] };
const actionNames = { attack: 'Angreifen', focus: 'Fokusstoß', guard: 'Beschützen', rest: 'Verschnaufen', runeSun: 'Sonnenrune', runeMoon: 'Mondrune' };
const glyphs = { companion: '✧', outfit: '♧', trophy: '♜' };
const fallbackCatalogue = [
  ['pet-firefly', 'companion', 'Funkenlicht', '#e7b74d'], ['pet-cloud', 'companion', 'Wolkenwuschel', '#93bacc'], ['pet-rune', 'companion', 'Runenfunke', '#9b8ac8'],
  ['outfit-starlight', 'outfit', 'Sternengewand', '#9785ba'], ['outfit-warden', 'outfit', 'Turmwächter', '#c8984e'], ['outfit-runekeeper', 'outfit', 'Runenhüter', '#72a39c'],
  ['trophy-tower-bronze', 'trophy', 'Turmbezwinger', '#ba9069'], ['trophy-tower-gold', 'trophy', 'Spitze des Turms', '#d4ad50'], ['trophy-golem', 'trophy', 'Runengolem bezwungen', '#8c99b2'],
].map(([id, type, name, color]) => ({ id, type, name, color, description: rewardSources[id] }));

function adventureData(state) { return state.adventure || { tower: null, raids: [], cosmetics: { owned: [], selected: {}, catalogue: fallbackCatalogue } }; }
function catalogue(state) { return adventureData(state).cosmetics?.catalogue || fallbackCatalogue; }
function cosmetic(state, id) { return catalogue(state).find(item => item.id === id) || fallbackCatalogue.find(item => item.id === id) || { id, name: 'Abenteuerfund', type: 'trophy', color: '#bd9b5e' }; }
function selectedRaid(state) {
  const raids = adventureData(state).raids || [];
  let chosen = raids.find(raid => raid.id === selectedRaidId);
  if (!chosen) chosen = raids.find(raid => ['lobby', 'active'].includes(raid.status) && raid.state.members.some(member => member.id === state.user.id)) || null;
  if (chosen) selectedRaidId = chosen.id;
  return chosen;
}
function hpCard(fighter, e, icon) {
  const hp = Math.max(0, Number(fighter.hp) || 0), max = Math.max(1, Number(fighter.maxHp) || 1);
  return `<div class="adventure-health-card"><div><strong>${e(fighter.characterName || fighter.name)}</strong><span>${hp} / ${max} LP</span></div><div class="health-track"><span style="width:${Math.min(100, hp / max * 100)}%"></span></div></div>`;
}
function logPanel(log, e, icon) { return `<div class="adventure-log"><h3>${icon('book', '', 17)} Dein Abenteuerprotokoll</h3><ol>${(log || []).slice(-7).map(line => `<li>${e(line)}</li>`).join('') || '<li>Dein nächstes Abenteuer wartet.</li>'}</ol></div>`; }
function rewardChips(state, ids, e) { return (ids || []).map(id => { const item = cosmetic(state, id); return `<span class="cosmetic-chip">${glyphs[item.type] || '✦'} ${e(item.name)}</span>`; }).join(''); }
function button(action, title, description, symbol, attributes = '', disabled = false) {
  return `<button class="adventure-move" data-action="${action}" ${attributes} ${disabled ? 'disabled' : ''}><span>${symbol}</span><strong>${title}</strong><small>${description}</small></button>`;
}

export function renderAdventures({ state, e, icon, heroAvatar }) {
  const data = adventureData(state);
  return `<div class="adventure-heading"><span class="eyebrow">ALLEIN LOSZIEHEN. GEMEINSAM GROSSES SCHAFFEN.</span><h1>Dein nächstes Abenteuer<span class="title-dot">.</span></h1><p>Erklimme den Turm oder schmiede einen Plan gegen den Runengolem.</p></div><div class="adventure-mode-tabs" role="tablist" aria-label="Abenteuermodus"><button role="tab" aria-selected="${mode === 'tower'}" data-action="adventure-mode" data-mode="tower">${icon('trophy')} Turm der Prüfungen <small>SOLO</small></button><button role="tab" aria-selected="${mode === 'golem'}" data-action="adventure-mode" data-mode="golem">${icon('users')} Runengolem <small>3–5 SPIELER</small></button></div>${mode === 'tower' ? renderTower(state, data.tower, e, icon, heroAvatar) : renderGolem(state, e, icon, heroAvatar)}<div class="adventure-note">${icon('gift', '', 23)}<p>Hier erspielst du Begleiter, Outfits und Trophäen. Deine schulischen XP, Ausrüstung und Tränke bleiben erhalten. Neue XP und Truhen vergibt weiterhin deine Lehrkraft.</p><button class="text-button" data-action="nav" data-tab="collection">Zur Sammlung ${icon('arrow', '', 16)}</button></div>`;
}

function renderTower(state, tower, e, icon, heroAvatar) {
  const run = tower?.state;
  const running = run && ['active', 'choice'].includes(run.status);
  const cleared = run?.cleared || 0;
  const route = `<div class="tower-track" aria-label="Zehn Turmetagen">${Array.from({ length: 10 }, (_, i) => { const floor = i + 1; return `<div class="tower-step ${floor <= cleared ? 'cleared' : ''} ${running && floor === run.floor ? 'current' : ''} ${milestoneFloors[floor] ? 'reward-step' : ''}" title="${e(milestoneFloors[floor] ? milestoneFloors[floor].map(id => cosmetic(state, id).name).join(', ') : `Etage ${floor}`)}"><span>${floor <= cleared ? '✓' : floor}</span><small>${milestoneFloors[floor] ? '✦' : '·'}</small></div>`; }).join('')}</div>`;
  if (!run) return `<section class="adventure-portal tower-portal"><span class="adventure-icon">♜</span><div><span class="eyebrow">EIN HELD. ZEHN ETAGEN. DEINE ENTSCHEIDUNG.</span><h2>Wie hoch traust du dich?</h2><p>Auf jeder Etage wartet ein neuer Gegner. Lies seine Absicht, wähle deine Aktionen und sammle besondere Funde. Zwischen den Kämpfen entscheidest du: Belohnungen sichern oder mit einem Bonus weiterziehen?</p><button class="button primary" data-action="tower-start">Den Turm betreten ${icon('arrow')}</button></div></section>${route}${renderMilestones(state, e)}`;
  const pending = run.pendingRewards || [];
  const statusPanel = !running ? `<section class="adventure-result ${run.status === 'lost' ? 'lost' : 'won'}"><span>${run.status === 'lost' ? '✧' : '♜'}</span><div><h2>${run.status === 'completed' ? 'Die Spitze gehört dir!' : run.status === 'banked' ? 'Sicher zurückgekehrt.' : 'Ein neuer Versuch. Ein neuer Plan.'}</h2><p>${run.status === 'lost' ? `Du hast ${cleared} Etagen gemeistert. Ungesicherte Funde dieses Versuchs sind verloren; deine bisherigen Gegenstände und XP bleiben erhalten.` : `${cleared} Etagen gemeistert. Deine gesicherten Belohnungen findest du jetzt in deiner Sammlung.`}</p><div class="pending-rewards">${run.status !== 'lost' ? rewardChips(state, pending, e) : ''}</div><div class="raid-controls"><button class="button primary" data-action="tower-start">Neuer Turmversuch ${icon('arrow')}</button><button class="button outline" data-action="nav" data-tab="collection">Sammlung ansehen</button></div></div></section>` : '';
  const arena = running && run.player && run.enemy ? `<section class="adventure-panel tower-current"><div class="section-title"><div><span class="eyebrow">TURM DER PRÜFUNGEN</span><h2>Etage ${run.floor} <span class="muted">/ 10</span></h2></div><span class="pill neutral">${run.boons?.length || 0} TURMBONI</span></div><div class="adventure-arena arena-3d" data-adventure-kind="tower" data-adventure-id="${e(tower.id)}" role="img" aria-label="Turmkampf in 3D"><div class="hero3d-fallback arena3d-fallback">${heroAvatar(run.player)}<span>VS</span>${heroAvatar(run.enemy)}</div><p class="hero3d-status" role="status">Dein Turmkampf wird geladen …</p></div><div class="adventure-health-grid">${hpCard(run.player, e, icon)}${hpCard(run.enemy, e, icon)}</div>${run.status === 'active' ? `<div class="enemy-intent">${icon('clock')}<div><strong>Nächster Zug: ${e(run.enemy.intentLabel || actionNames[run.enemy.intent] || 'Angriff')}</strong><p>${run.enemy.intent === 'heavy' ? 'Ein schwerer Treffer kündigt sich an. Deckung kann dich schützen.' : run.enemy.intent === 'guard' ? 'Dein Gegenüber geht in Deckung. Nutze die Pause geschickt.' : 'Behalte deine Lebenspunkte und deinen Fokus im Blick.'}</p></div></div><div class="adventure-actions">${button('tower-action', 'Angreifen', 'Sicherer direkter Schaden', '⚔', `data-move="attack" data-turn="${run.totalTurns || 0}" data-run-id="${e(tower.id)}"`)}${button('tower-action', 'Fokusstoß', run.player.focusCooldown ? `Noch ${run.player.focusCooldown} eigene Züge` : 'Starker Angriff mit Abklingzeit', '✦', `data-move="focus" data-turn="${run.totalTurns || 0}" data-run-id="${e(tower.id)}"`, run.player.focusCooldown > 0)}${button('tower-action', 'Deckung', 'Schützen und leicht regenerieren', '⬡', `data-move="guard" data-turn="${run.totalTurns || 0}" data-run-id="${e(tower.id)}"`)}${button('tower-action', 'Verschnaufen', run.restUsed ? 'Auf dieser Etage bereits genutzt' : 'Einmal pro Etage bis zu 20 LP', '♡', `data-move="rest" data-turn="${run.totalTurns || 0}" data-run-id="${e(tower.id)}"`, run.restUsed || run.player.hp >= run.player.maxHp)}</div>` : renderTowerChoice(state, tower, e, icon)}${logPanel(run.log, e, icon)}<button class="text-button danger-link" data-action="tower-abandon" data-run-id="${e(tower.id)}">Turmversuch aufgeben</button></section>` : '';
  return `${route}${statusPanel}${arena}${running ? `<section class="adventure-panel bank-banner"><div><span class="eyebrow">NOCH NICHT GESICHERT</span><h3>Deine Funde auf diesem Weg</h3><div class="pending-rewards">${rewardChips(state, pending, e) || '<span class="muted">Die erste Belohnung wartet auf Etage 2.</span>'}</div></div><p>Nach einem Sieg kannst du zurückkehren und diese Funde sichern. Eine Niederlage kostet nur die ungesicherten Funde dieses Versuchs.</p></section>` : ''}${renderMilestones(state, e)}`;
}

function renderTowerChoice(state, tower, e, icon) {
  const run = tower.state;
  return `<div class="tower-choice"><span class="eyebrow">ETAGE ${run.floor} GESCHAFFT</span><h3>Zurückkehren oder höher hinaus?</h3><p>Wähle einen Bonus für die nächste Etage. Deine übrigen Lebenspunkte nimmst du mit.</p><div class="tower-choice-grid">${button('tower-choice', 'Neue Kraft', '+18 maximale LP und bis zu 25 LP Heilung', '♡', `data-choice="vigor" data-floor="${run.floor}" data-run-id="${e(tower.id)}"`)}${button('tower-choice', 'Mehr Wucht', '+4 Angriff für diesen Turmversuch', '⚔', `data-choice="power" data-floor="${run.floor}" data-run-id="${e(tower.id)}"`)}${button('tower-choice', 'Klarer Fokus', '+5 Fokus-Schaden für diesen Versuch', '✦', `data-choice="focus" data-floor="${run.floor}" data-run-id="${e(tower.id)}"`)}</div><button class="button gold full" data-action="tower-choice" data-choice="bank" data-floor="${run.floor}" data-run-id="${e(tower.id)}">${icon('gift')} Mit meinen Funden zurückkehren</button></div>`;
}
function renderMilestones(state, e) {
  return `<section class="adventure-panel tower-milestones"><div class="section-title"><h2>Das wartet in den Höhen</h2><span class="pill neutral">BLEIBENDE ERINNERUNGEN</span></div><div class="adventure-summary">${Object.entries(milestoneFloors).map(([floor, ids]) => `<div><strong>Etage ${floor}</strong><span>${ids.map(id => e(cosmetic(state, id).name)).join(' + ')}</span></div>`).join('')}</div></section>`;
}

function renderGolem(state, e, icon, heroAvatar) {
  const raids = adventureData(state).raids || [];
  const mine = raids.find(raid => ['lobby', 'active'].includes(raid.status) && raid.state.members.some(member => member.id === state.user.id));
  const selected = selectedRaid(state);
  return `<section class="adventure-portal golem-portal"><span class="adventure-icon">⬡</span><div><span class="eyebrow">NUR GEMEINSAM FÄLLT SEIN SCHILD</span><h2>Der Runengolem erwacht.</h2><p>Findet euch als drei bis fünf verschiedene Spieler zusammen. Zwei von euch müssen Sonnen- und Mondrune in derselben Runde aktivieren. Erst dann öffnet sich das Zeitfenster für eure Angriffe.</p>${!mine ? `<button class="button primary" data-action="raid-create">${icon('users')} Gruppe gründen</button>` : `<span class="pill neutral">DU HAST BEREITS EINE GRUPPE</span>`}</div></section>${selected ? renderRaid(state, selected, e, icon, heroAvatar) : ''}<section class="adventure-panel raid-group-list"><div class="section-title"><h2>Gruppen auf deinem Campus</h2><span class="pill neutral">GEMEINSAM PLANEN</span></div>${raids.filter(raid => raid.status === 'lobby').map(raid => `<article class="raid-group-card"><span class="raid-group-symbol">⬡</span><div><h3>${e(raid.state.members.find(member => member.id === raid.leaderId)?.name || 'Deine Klasse')}s Gruppe</h3><p>${raid.state.members.length} / 5 Plätze · Start ab 3 Spielern</p></div><button class="button ${mine?.id === raid.id ? 'outline' : 'primary'} small" data-action="${raid.state.members.some(member => member.id === state.user.id) ? 'raid-select' : 'raid-join'}" data-id="${e(raid.id)}" ${mine && mine.id !== raid.id || raid.state.members.length >= 5 && !raid.state.members.some(member => member.id === state.user.id) ? 'disabled' : ''}>${raid.state.members.some(member => member.id === state.user.id) ? 'Gruppe ansehen' : 'Beitreten'}</button></article>`).join('') || '<div class="adventure-empty">Noch keine offene Gruppe. Gründe die erste und lade deine Klasse zum Mitspielen ein.</div>'}<p class="section-description">Jeder spielt im eigenen Konto und Browserprofil. Die Gruppe und eure Spielzüge bleiben gespeichert, auch wenn ihr die Seite schließt.</p></section>`;
}

function renderRaid(state, raid, e, icon, heroAvatar) {
  const run = raid.state;
  const members = run.members || [];
  const me = members.find(member => member.id === state.user.id);
  const leader = raid.leaderId === state.user.id;
  const participant = Boolean(me);
  const active = raid.status === 'active';
  const action = run.actions?.[state.user.id] || me?.action;
  const sunPlayer = members.find(member => (run.actions?.[member.id] || member.action) === 'runeSun');
  const moonPlayer = members.find(member => (run.actions?.[member.id] || member.action) === 'runeMoon');
  const alive = me && me.hp > 0;
  const party = `<div class="raid-members">${members.map(member => `<article class="raid-member ${member.id === state.user.id ? 'is-me' : ''} ${active && member.hp <= 0 ? 'dead' : ''}"><div class="member-avatar">${heroAvatar(member)}</div><strong>${e(member.characterName || member.name)}</strong><small>${e(member.name)}${member.id === raid.leaderId ? ' · Leitung' : ''}</small>${raid.status !== 'lobby' ? `<div class="health-track"><span style="width:${Math.max(0, Math.min(100, (member.hp || 0) / Math.max(1, member.maxHp || 1) * 100))}%"></span></div><small>${Math.max(0, member.hp || 0)} / ${member.maxHp || 0} LP</small>` : ''}<span class="member-choice">${active && member.hp <= 0 ? 'Ausgeschieden' : run.actions?.[member.id] || member.action ? e(actionNames[run.actions?.[member.id] || member.action] || 'Bereit') : active ? 'Wählt einen Zug …' : 'Bereit für die Gruppe'}</span></article>`).join('')}</div>`;
  if (raid.status === 'lobby') return `<section class="adventure-panel raid-lobby"><div class="section-title"><h2>Deine Gruppe sammelt sich</h2><span class="pill gold">${members.length} / 5 SPIELER</span></div>${party}<div class="rune-instructions"><strong>Ein guter Plan beginnt vor dem ersten Zug.</strong><p>Verteilt Sonnenrune, Mondrune und Angriff. Ihr braucht mindestens drei Spielerkonten. Ein einzelner Held kann das Runenschild nicht brechen.</p></div><div class="raid-controls">${leader ? `<button class="button primary" data-action="raid-start" data-id="${e(raid.id)}" ${members.length < 3 ? 'disabled' : ''}>${members.length < 3 ? `Noch ${3 - members.length} Mitspieler fehlen` : 'Dem Runengolem gegenübertreten'} ${icon('arrow')}</button>` : '<span class="raid-waiting">Die Gruppenleitung startet, sobald ihr vollständig seid.</span>'}${participant ? `<button class="button outline" data-action="raid-leave" data-id="${e(raid.id)}">Gruppe verlassen</button>` : ''}${leader ? `<button class="text-button danger-link" data-action="raid-cancel" data-id="${e(raid.id)}">Gruppe auflösen</button>` : ''}</div></section>`;
  const boss = run.boss || { hp: 0, maxHp: 1, name: 'Runengolem' };
  const finished = ['won', 'lost', 'closed'].includes(raid.status);
  return `<section class="adventure-panel raid-battle"><div class="section-title"><div><span class="eyebrow">GEMEINSAM GEGEN DEN RUNENGOLEM</span><h2>${finished ? raid.status === 'won' ? 'Gemeinsam geschafft!' : raid.status === 'closed' ? 'Die Gruppe wurde beendet.' : 'Heute war sein Schild stärker.' : `Runde ${run.round}`}</h2></div><span class="pill ${raid.status === 'won' ? 'gold' : 'neutral'}">${finished ? raid.status === 'won' ? 'SIEG' : 'ABENTEUER BEENDET' : 'GRUPPENBOSS'}</span></div>${run.boss ? `<div class="adventure-arena arena-3d raid-arena" data-adventure-kind="raid" data-adventure-id="${e(raid.id)}" role="img" aria-label="Deine Gruppe gegen den Runengolem in 3D"><div class="hero3d-fallback arena3d-fallback"><span class="golem-fallback-symbol">⬡</span><strong>Runengolem</strong></div><p class="hero3d-status" role="status">Eure Bossarena wird geladen …</p></div><div class="raid-boss-health">${hpCard({ ...boss, characterName: 'Runengolem' }, e, icon)}<span class="boss-shield ${boss.shielded === false ? 'broken' : ''}">${icon('shield', '', 17)} ${boss.shielded === false ? 'Runenschild durchbrochen' : 'Runenschild aktiv'}</span></div>` : ''}${party}${active ? `<div class="rune-instructions"><strong><span class="rune-sun">☀ Sonnenrune</span> + <span class="rune-moon">☾ Mondrune</span> = offenes Runenschild</strong><p>Zwei unterschiedliche Spieler müssen die beiden Runen in derselben Runde aktivieren. Ohne diese Kombination verursachen Angriffe fast keinen Schaden.</p><p class="rune-plan"><span class="rune-sun">☀ ${sunPlayer ? e(sunPlayer.name) : 'Sonnenrune noch offen'}</span> <span class="rune-moon">☾ ${moonPlayer ? e(moonPlayer.name) : 'Mondrune noch offen'}</span></p>${run.runeshield?.broken ? '<small>✓ In der letzten Runde habt ihr den Runenschild gemeinsam gebrochen.</small>' : ''}</div><div class="enemy-intent">${icon('clock')}<div><strong>Der Golem plant: ${e(boss.intentLabel || (boss.intent === 'slam' ? 'einen schweren Schlag' : 'einen Stampfangriff'))}</strong><p>Deckung reduziert den Schaden. Besprecht eure nächsten Aktionen anhand der Auswahl eurer Gruppe.</p></div></div>${participant && alive && !action ? `<div class="raid-action-grid">${button('raid-action', 'Angriff', 'Schaden im Runenfenster', '⚔', `data-id="${e(raid.id)}" data-round="${run.round}" data-move="attack"`)}${button('raid-action', 'Fokusstoß', me?.focusCooldown ? `Noch ${me.focusCooldown} eigene Züge` : 'Konzentrierter Schaden', '✦', `data-id="${e(raid.id)}" data-round="${run.round}" data-move="focus"`, me?.focusCooldown > 0)}${button('raid-action', 'Deckung', 'Diesen Zug schützen', '⬡', `data-id="${e(raid.id)}" data-round="${run.round}" data-move="guard"`)}${button('raid-action', 'Sonnenrune', 'Mit Mondrune kombinieren', '☀', `data-id="${e(raid.id)}" data-round="${run.round}" data-move="runeSun"`)}${button('raid-action', 'Mondrune', 'Mit Sonnenrune kombinieren', '☾', `data-id="${e(raid.id)}" data-round="${run.round}" data-move="runeMoon"`)}</div>` : `<div class="raid-waiting">${!participant ? 'Du siehst den Kampf deiner Klasse.' : !alive ? 'Dein Held ist ausgeschieden. Deine bisherigen Beiträge zählen weiterhin.' : `Dein Zug steht: ${e(actionNames[action] || 'bereit')}. Sobald alle lebenden Spieler gewählt haben, beginnt die gemeinsame Runde.`}</div>`}${participant ? `<div class="raid-deadline"><span data-raid-deadline="${Number(run.roundDeadline) || 0}"></span><button class="button outline small" data-action="raid-advance" data-id="${e(raid.id)}" data-round="${run.round}" data-enable-at="${Number(run.roundDeadline) || 0}" ${Date.now() < (Number(run.roundDeadline) || Infinity) ? 'disabled' : ''}>Fehlende Züge in Deckung setzen</button></div>` : ''}` : `<div class="adventure-result ${raid.status === 'won' ? 'won' : 'lost'}"><div><p>${raid.status === 'won' ? 'Der Golem ist besiegt. Wer aktiv mitgespielt hat, erhält Runen-Begleiter, Outfit und Trophäe in seiner Sammlung.' : 'Ausrüstung, Tränke und schulische XP bleiben erhalten. Mit einem neuen Plan könnt ihr es erneut versuchen.'}</p><button class="button primary" data-action="nav" data-tab="collection">Zur Sammlung ${icon('arrow')}</button></div></div>`}${logPanel(run.log, e, icon)}${leader && active ? `<button class="text-button danger-link" data-action="raid-cancel" data-id="${e(raid.id)}">Gruppenkampf beenden</button>` : ''}</section>`;
}

export function renderCollection({ state, e, icon }) {
  const all = catalogue(state);
  const collection = adventureData(state).cosmetics || state.user.cosmetics || {};
  const owned = collection.owned || [];
  const selected = collection.selected || {};
  const totals = ['companion', 'outfit', 'trophy'].map(type => [type, all.filter(item => item.type === type), owned.filter(id => all.some(item => item.id === id && item.type === type)).length]);
  return `<div class="adventure-heading collection-header"><span class="eyebrow">DEINE GESCHICHTEN. DEINE ERINNERUNGEN.</span><h1>Deine Sammlung<span class="title-dot">.</span></h1><p>Begleiter und Outfits begleiten deinen Helden. Trophäen erzählen, was du gemeistert hast.</p></div><div class="collection-summary">${totals.map(([type, items, count]) => `<article><span>${glyphs[type]}</span><strong>${count} / ${items.length}</strong><small>${type === 'companion' ? 'Begleiter' : type === 'outfit' ? 'Outfits' : 'Trophäen'}</small></article>`).join('')}</div>${totals.map(([type, items]) => `<section class="collection-section"><div class="section-title"><h2>${type === 'companion' ? 'Kleine Begleiter, große Abenteuer' : type === 'outfit' ? 'Ein Look mit Geschichte' : 'Deine Trophäen'}</h2><span class="pill neutral">${type === 'trophy' ? 'DAUERHAFT FREIGESCHALTET' : 'REIN OPTISCH'}</span></div><div class="cosmetic-grid">${items.map(item => { const has = owned.includes(item.id); const equipped = selected[type] === item.id; const safeColor = /^#[a-f\d]{3,8}$/i.test(item.color || '') ? item.color : '#a28bbd'; return `<article class="cosmetic-card ${has ? 'owned' : 'locked'} ${equipped ? 'equipped' : ''} ${type === 'trophy' ? 'trophy-card' : ''}" data-cosmetic-id="${e(item.id)}" style="--cosmetic-color:${safeColor}"><div class="cosmetic-art" aria-hidden="true">${item.id === 'pet-cloud' ? '☁' : item.id === 'pet-firefly' ? '✧' : item.id === 'pet-rune' ? '⬡' : glyphs[type]}</div><span class="cosmetic-status">${equipped ? '✓ Ausgewählt' : has ? '✓ Freigeschaltet' : 'Noch zu entdecken'}</span><h3>${e(item.name)}</h3><p>${e(item.description || rewardSources[item.id] || '')}</p><small class="cosmetic-source">${e(rewardSources[item.id] || 'Als Abenteuerbelohnung freischaltbar.')}</small>${type !== 'trophy' ? `<button class="button ${equipped ? 'outline' : 'primary'} full" data-action="cosmetic-equip" data-type="${type}" data-id="${e(item.id)}" data-clear="${equipped}" ${has ? '' : 'disabled'}>${equipped ? 'Auswahl aufheben' : type === 'companion' ? 'Begleiter auswählen' : 'Outfit anziehen'}</button>` : `<span class="cosmetic-trophy-label">${has ? 'Dein Erfolg bleibt.' : 'Dein nächstes Ziel.'}</span>`}</article>`; }).join('')}</div></section>`).join('')}<div class="adventure-note">${icon('shield', '', 22)}<p>Begleiter und Abenteuer-Outfits geben keine zusätzlichen Kampfboni. Deine Fähigkeiten und Ausrüstung bestimmen weiterhin deine Stärke.</p><button class="text-button" data-action="nav" data-tab="adventures">Neue Abenteuer ${icon('arrow', '', 16)}</button></div>`;
}

export function mountAdventure3D({ state, mountArena3D, mountRaid3D, register }) {
  for (const host of document.querySelectorAll('.adventure-arena[data-adventure-kind]')) {
    if (host.dataset.adventureKind === 'tower') {
      const tower = adventureData(state).tower;
      if (tower?.id !== host.dataset.adventureId || !tower.state.player || !tower.state.enemy) continue;
      register(host, () => mountArena3D(host, [tower.state.player, tower.state.enemy], { userId: state.user.id, interactive: false }));
    } else {
      const raid = (adventureData(state).raids || []).find(value => value.id === host.dataset.adventureId);
      if (!raid?.state.boss) continue;
      register(host, () => mountRaid3D(host, raid.state.members, raid.state.boss, { userId: state.user.id }));
    }
  }
}

export function adventureEventCandidates(state) {
  const result = new Map();
  const tower = adventureData(state).tower;
  const sources = [...(tower ? [{ id: `tower:${tower.id}`, state: tower.state }] : []), ...(adventureData(state).raids || []).map(raid => ({ id: `raid:${raid.id}`, state: raid.state }))];
  for (const source of sources) {
    const previous = seenEvents.get(source.id);
    if (previous !== undefined) result.set(source.id, (source.state.events || []).filter(event => event.id > previous));
    seenEvents.set(source.id, Number(source.state.eventSeq) || 0);
  }
  return result;
}
export function adventureIsAnimating() { return animating; }
export function cancelAdventureAnimations() {
  animationGeneration++;
  for (const host of document.querySelectorAll('.adventure-arena')) host.__hero3d?.cancel?.();
  document.body.classList.remove('is-adventure-animating');
  animating = false;
}
export function resetAdventureState() { cancelAdventureAnimations(); seenEvents.clear(); selectedRaidId = null; mode = 'tower'; }
export async function animateAdventures(candidates) {
  const host = document.querySelector('.adventure-arena');
  if (!host) return;
  const events = candidates.get(`${host.dataset.adventureKind}:${host.dataset.adventureId}`) || [];
  if (!events.length) return;
  const stamp = ++animationGeneration;
  animating = true;
  document.body.classList.add('is-adventure-animating');
  host.setAttribute('aria-busy', 'true');
  try {
    for (const event of events) {
      if (stamp !== animationGeneration || !host.isConnected) break;
      const controller = host.__hero3d;
      if (!controller?.supported) continue;
      let timer;
      try { await Promise.race([controller.play(event), new Promise(resolve => { timer = setTimeout(resolve, 1600); })]); }
      catch { /* The text log remains available if a graphics context is lost. */ }
      finally { clearTimeout(timer); }
    }
  } finally {
    host.removeAttribute('aria-busy');
    if (stamp === animationGeneration) { animating = false; document.body.classList.remove('is-adventure-animating'); }
  }
}
export function updateAdventureClocks() {
  const now = Date.now();
  for (const node of document.querySelectorAll('[data-raid-deadline]')) {
    const deadline = Number(node.dataset.raidDeadline);
    if (!deadline) { node.textContent = ''; continue; }
    const left = Math.max(0, Math.ceil((deadline - now) / 1000));
    node.textContent = left ? `Fehlende Züge können in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} in Deckung gesetzt werden.` : 'Wenn jemand fehlt, könnt ihr die Runde mit Deckung für fehlende Züge fortsetzen.';
  }
  for (const button of document.querySelectorAll('[data-enable-at]')) button.disabled = !Number(button.dataset.enableAt) || now < Number(button.dataset.enableAt);
}

export async function handleAdventureAction(button, { api, mutate, render, toast, confirmDialog }) {
  const action = button.dataset.action;
  if (action === 'adventure-mode') { cancelAdventureAnimations(); mode = button.dataset.mode; render(); return true; }
  if (action === 'raid-select') { cancelAdventureAnimations(); selectedRaidId = button.dataset.id; render(); return true; }
  if (action === 'tower-start') { await mutate(async () => { await api('/tower/start', {}); mode = 'tower'; toast('Der Turm öffnet seine Tore. Viel Erfolg!'); }); return true; }
  if (action === 'tower-action') { await mutate(() => api('/tower/action', { action: button.dataset.move, turn: Number(button.dataset.turn), runId: button.dataset.runId })); return true; }
  if (action === 'tower-choice') {
    if (button.dataset.choice === 'bank' && !await confirmDialog('Mit deinen Funden zurückkehren?', 'Du sicherst die bisher entdeckten Belohnungen und beendest diesen Turmversuch.', 'Funde sichern')) return true;
    await mutate(() => api('/tower/choice', { choice: button.dataset.choice, floor: Number(button.dataset.floor), runId: button.dataset.runId })); return true;
  }
  if (action === 'tower-abandon') {
    if (await confirmDialog('Diesen Turmversuch aufgeben?', 'Ungesicherte Funde dieses Versuchs gehen verloren. Dein bisheriger Spielstand und deine Ausrüstung bleiben erhalten.', 'Versuch aufgeben')) await mutate(() => api('/tower/abandon', { runId: button.dataset.runId }));
    return true;
  }
  if (action === 'raid-create') { await mutate(async () => { const result = await api('/raids', {}); selectedRaidId = result.raid?.id || null; toast('Deine Gruppe ist offen. Andere Schüler können jetzt beitreten.'); }); return true; }
  const routes = { 'raid-join': 'join', 'raid-start': 'start', 'raid-action': 'action', 'raid-advance': 'advance', 'raid-leave': 'leave', 'raid-cancel': 'cancel' };
  if (routes[action]) {
    if (action === 'raid-cancel' && !await confirmDialog('Diese Gruppe beenden?', 'Das gemeinsame Abenteuer endet für die ganze Gruppe. Eure bisherigen Gegenstände und XP bleiben erhalten.', 'Gruppe beenden')) return true;
    if (action === 'raid-leave' && !await confirmDialog('Diese Gruppe verlassen?', 'Dein Platz wird wieder frei. Die anderen Spieler können weitere Schüler aufnehmen.', 'Gruppe verlassen')) return true;
    await mutate(async () => {
      const body = action === 'raid-action' ? { action: button.dataset.move, round: Number(button.dataset.round) } : action === 'raid-advance' ? { round: Number(button.dataset.round) } : {};
      const result = await api(`/raids/${encodeURIComponent(button.dataset.id)}/${routes[action]}`, body);
      if (action === 'raid-join' || action === 'raid-start') selectedRaidId = result.raid?.id || button.dataset.id;
      if (action === 'raid-leave') selectedRaidId = null;
    }); return true;
  }
  if (action === 'cosmetic-equip') { await mutate(async () => { await api('/cosmetics/equip', { type: button.dataset.type, id: button.dataset.clear === 'true' ? null : button.dataset.id }); toast(button.dataset.clear === 'true' ? 'Auswahl aufgehoben.' : 'Dein neuer Abenteuer-Look ist ausgewählt.'); }); return true; }
  return false;
}
