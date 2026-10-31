const app = document.querySelector('#app');
const toastElement = document.querySelector('#toast');
let state = null;
let demoMode = false;
let tab = 'overview';
let authMode = 'login';
let selectedBattleId = null;
let busy = false;
let toastTimer;
let rewardDraft = { studentId: '', xp: '50', item: false, reason: '' };
let profileDraft = null;
let lastStateJSON = '';

const skillInfo = {
  strength: { name: 'Stärke', icon: 'swords', text: 'Mehr Kraft für deinen normalen Angriff.', color: 'coral' },
  focus: { name: 'Fokus', icon: 'spark', text: 'Verstärkt deine besondere Fokus-Attacke.', color: 'purple' },
  endurance: { name: 'Ausdauer', icon: 'shield', text: 'Mehr Lebenspunkte für längere Duelle.', color: 'green' },
};

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
const e = escapeHTML;
const shortName = name => String(name || '').split(' ')[0];
const initials = name => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();

function icon(name, className = '', size = 20) {
  const paths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    swords: '<path d="m14.5 3 6.5 0 0 6.5L7 23l-6-6L14.5 3Z" transform="translate(1 -1) scale(.91)"/><path d="m3 3 6.5 0L21 15l-6 6L3 9.5V3Zm1 17 4-4m8-8 4-4M2 22l3-3m14 0 3 3"/>',
    hero: '<path d="M8 3h8l3 6-2 10-5 3-5-3L5 9l3-6Z"/><path d="m8 10 2 1m6-1-2 1m-4 5h4M9 3l3 4 3-4"/>',
    gift: '<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8H7.5a2.5 2.5 0 1 1 2.4-3.2L12 8Zm0 0h4.5a2.5 2.5 0 1 0-2.4-3.2L12 8Z"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    spark: '<path d="m12 2 2.6 6.9L22 12l-7.4 2.7L12 22l-2.8-7.3L2 12l7.2-3.1L12 2Z"/>',
    shield: '<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Z"/><path d="m8 12 3 3 5-6"/>',
    potion: '<path d="M9 3h6m-5 0v5L5 16a4 4 0 0 0 3.5 6h7a4 4 0 0 0 3.5-6l-5-8V3M7 14h10"/><path d="M9 17h.01M14 18h.01"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M2 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m0 4a5 5 0 0 1 5 5v1"/>',
    logout: '<path d="M9 3H4v18h5m6-15 6 6-6 6m-7-6h13"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm4 10v6m-4 2h8M8 5H3v3a5 5 0 0 0 5 5m8-8h5v3a5 5 0 0 1-5 5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    book: '<path d="M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-3-1-6-2-10 1Zm0 0v15"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-9.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 6 9 7 9-7"/>',
  };
  return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
}

function avatar(type = 'fox', className = '', label = '') {
  const animals = {
    fox: { bg: '#f8d5a6', body: '#e88548', ears: '<path d="m29 49-5-30 26 18m21 12 5-30-26 18" fill="#e88548"/><path d="m29 39-2-12 13 13m31-1 2-12-13 13" fill="#76463b"/>', face: '<path d="M25 48c0-20 50-20 50 0l-7 27-18 9-18-9-7-27Z" fill="#e88548"/><path d="m27 52 23 14 23-14-5 22-18 10-18-10-5-22Z" fill="#fff1dc"/><path d="m44 63 6 5 6-5Z" fill="#493933"/>', eyes: '<path d="m35 51 7 3m23-3-7 3"/>' },
    owl: { bg: '#dbd7f5', body: '#8270b3', ears: '<path d="m25 44 1-20 21 13m28 7-1-20-21 13" fill="#8270b3"/>', face: '<ellipse cx="50" cy="58" rx="28" ry="29" fill="#8270b3"/><ellipse cx="38" cy="51" rx="15" ry="17" fill="#f9f2e6"/><ellipse cx="62" cy="51" rx="15" ry="17" fill="#f9f2e6"/><path d="m44 61 6 9 6-9" fill="#eab252"/>', eyes: '<circle cx="38" cy="51" r="4" fill="#493933"/><circle cx="62" cy="51" r="4" fill="#493933"/>' },
    dragon: { bg: '#cae4d5', body: '#579980', ears: '<path d="m29 45-7-21 23 13m26 8 7-21-23 13" fill="#579980"/><path d="m40 35 10-19 10 19" fill="#e9b95e"/>', face: '<path d="M23 52c0-29 54-29 54 0v20L65 85H35L23 72V52Z" fill="#579980"/><rect x="28" y="58" width="44" height="22" rx="10" fill="#b3d1b5"/><path d="M41 68h.1M59 68h.1" stroke="#365e50" stroke-width="4"/>', eyes: '<path d="m33 49 8 2m26-2-8 2"/>' },
    cat: { bg: '#ecd9c8', body: '#9b7c68', ears: '<path d="m25 48-1-27 24 18m27 9 1-27-24 18" fill="#9b7c68"/><path d="m29 38-1-9 11 11m32-2 1-9-11 11" fill="#e9b4ad"/>', face: '<ellipse cx="50" cy="57" rx="28" ry="27" fill="#9b7c68"/><ellipse cx="50" cy="67" rx="15" ry="12" fill="#efe0cf"/><path d="m45 61 5 5 5-5Z" fill="#614841"/><path d="m28 64-12-3m12 9-12 2m56-8 12-3m-12 9 12 2" stroke="#614841" stroke-width="2"/>', eyes: '<path d="m33 51 8 2m26-2-8 2"/>' },
  };
  const a = animals[type] || animals.fox;
  return `<svg class="avatar ${className}" viewBox="0 0 100 100" ${label ? `role="img" aria-label="${e(label)}"` : 'aria-hidden="true"'}><rect x="0" y="0" width="100" height="100" rx="29" fill="${a.bg}"/><circle cx="83" cy="15" r="14" fill="white" opacity=".2"/>${a.ears}${a.face}<g fill="none" stroke="#493933" stroke-width="3" stroke-linecap="round">${a.eyes}</g><path d="M47 73q3 3 6 0" stroke="#493933" fill="none" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function toast(message, error = false) {
  clearTimeout(toastTimer);
  toastElement.innerHTML = `${icon(error ? 'shield' : 'check')}<span>${e(message)}</span>`;
  toastElement.className = `toast visible ${error ? 'error' : ''}`;
  toastTimer = setTimeout(() => toastElement.classList.remove('visible'), 4500);
}

async function api(path, body) {
  const options = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const response = await fetch(`/api${path}`, options);
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && state) { state = null; lastStateJSON = ''; renderAuth(); }
    throw new Error(data.error || 'Das hat leider nicht geklappt. Bitte versuche es erneut.');
  }
  return data;
}

async function refresh(force = false) {
  if (!state && !force) return;
  const data = await api('/state');
  const json = JSON.stringify(data);
  state = data;
  if (!profileDraft) profileDraft = { characterName: data.user.characterName || '', avatar: data.user.avatar || 'fox' };
  if (!rewardDraft.studentId && data.students.length) rewardDraft.studentId = data.students[0].id;
  if (force || (json !== lastStateJSON && !document.activeElement?.matches('input, textarea, select') && !busy)) {
    render();
    lastStateJSON = json;
  }
}

function brand() { return '<span class="brand-mark">k<span>✦</span></span><span class="brand-name">klassen<span>helden</span><small>JEDER TAG EIN ABENTEUER</small></span>'; }

function renderAuth() {
  const register = authMode === 'register';
  app.innerHTML = `<main class="auth-page"><section class="auth-story"><a class="brand" href="/" aria-label="Klassenhelden Startseite">${brand()}</a><div class="auth-copy"><span class="eyebrow"><i></i> DEIN SCHULALLTAG. DEIN ABENTEUER.</span><h1>In dir steckt<br>ein <span>Held.</span></h1><p>Gute Mitarbeit wird zu neuer Stärke.<br>Entwickle deinen Charakter und fordere<br>deine Klasse in fairen Duellen heraus.</p><div class="auth-hero-art"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="art-star star-one">✦</span><span class="art-star star-two">✧</span><span class="floating-tag tag-top">${icon('spark')} +50 Erfahrung</span><div class="hero-avatar">${avatar('fox')}</div><span class="level-floating">${icon('trophy')} Level 3</span><div class="small-avatar owl-float">${avatar('owl')}</div><div class="small-avatar dragon-float">${avatar('dragon')}</div></div><div class="auth-values"><span>${icon('shield')} Fair & rundenbasiert</span><span>${icon('book')} Von Lehrkräften belohnt</span></div></div><p class="auth-footer">Kleine Schritte im Klassenzimmer. Große Abenteuer im Spiel.</p></section><section class="auth-form-side"><div class="auth-form-wrap"><span class="pill neutral">WILLKOMMEN BEI KLASSENHELDEN</span><h2>${register ? 'Dein Abenteuer beginnt.' : 'Schön, dass du da bist.'}</h2><p class="muted">${register ? 'Erstelle einen Schüleraccount in der gemeinsamen Demoklasse.' : 'Melde dich an und entdecke deinen nächsten Schritt.'}</p><div class="auth-tabs ${demoMode ? '' : 'login-only'}" role="tablist" aria-label="Anmeldung"><button type="button" role="tab" aria-selected="${!register}" class="${!register ? 'active' : ''}" data-action="auth-mode" data-mode="login">Anmelden</button>${demoMode ? `<button type="button" role="tab" aria-selected="${register}" class="${register ? 'active' : ''}" data-action="auth-mode" data-mode="register">Schüleraccount erstellen</button>` : ''}</div><form id="auth-form">${register ? '<label for="name">Dein Name</label><input id="name" name="name" minlength="2" autocomplete="name" placeholder="z. B. Lina Sommer" required maxlength="60"><label for="characterName">Name deines Charakters</label><input id="characterName" name="characterName" placeholder="z. B. Funkenfuchs" required minlength="2" maxlength="30">' : ''}<label for="email">E-Mail-Adresse</label><input id="email" name="email" type="email" autocomplete="email" placeholder="du@deine-schule.de" required maxlength="120"><label for="password">Passwort ${register ? '<span class="label-hint">mindestens 10 Zeichen</span>' : ''}</label><input id="password" name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="${register ? '10' : '1'}" required placeholder="${register ? 'Wähle ein starkes Passwort' : 'Dein Passwort'}" maxlength="128"><p id="auth-error" class="form-error" role="alert"></p><button class="button primary full" type="submit">${register ? 'Meinen Helden erstellen' : 'Ins Abenteuer starten'}${icon('arrow')}</button></form>${renderDemoSection()}<p class="auth-note">${icon('lock', '', 15)} ${demoMode ? 'Demoumgebung · Alle Schüleraccounts teilen eine Klasse.' : 'Lehrkraftkonten werden separat bereitgestellt.'}</p></div></section></main>`;
}

function renderDemoSection() {
  return demoMode ? `<div class="demo-section"><div class="divider"><span>Erst einmal ausprobieren?</span></div><p>Entdecke die beiden Perspektiven mit Demodaten.</p><div class="demo-buttons"><button class="demo-button" data-action="demo-login" data-email="lina@demo.schule">${avatar('fox')}<span><strong>Als Schülerin</strong><small>Lina · eigener Charakter</small></span>${icon('chevron')}</button><button class="demo-button" data-action="demo-login" data-email="lehrer@demo.schule"><span class="demo-teacher">${icon('book')}</span><span><strong>Als Lehrkraft</strong><small>Belohnungen vergeben</small></span>${icon('chevron')}</button></div><button class="text-button secondary-demo" data-action="demo-login" data-email="ben@demo.schule">Als Ben anmelden, um ein Schülerduell zu spielen ${icon('arrow', '', 15)}</button></div>` : '';
}

function navItems() {
  return state.user.role === 'teacher'
    ? [{ id: 'overview', name: 'Übersicht', icon: 'grid' }, { id: 'class', name: 'Meine Klasse', icon: 'users' }, { id: 'rewards', name: 'Belohnungen', icon: 'gift' }]
    : [{ id: 'overview', name: 'Übersicht', icon: 'grid' }, { id: 'arena', name: 'Arena', icon: 'swords' }, { id: 'character', name: 'Mein Held', icon: 'hero' }, { id: 'rewards', name: 'Belohnungen', icon: 'gift' }];
}

function render() {
  if (!state) return renderAuth();
  const user = state.user;
  const teacher = user.role === 'teacher';
  const pending = state.battles.filter(b => b.status === 'pending' && b.opponentId === user.id).length;
  const items = navItems();
  if (!items.some(x => x.id === tab)) tab = 'overview';
  const currentNav = items.find(x => x.id === tab);
  app.innerHTML = `<div class="app-shell"><aside class="sidebar"><a href="/" class="brand" data-action="nav" data-tab="overview">${brand()}</a><div class="campus-switch"><span class="campus-icon">${icon('book')}</span><span><strong>${e(user.schoolName || 'Campus Nord')}</strong><small>${teacher ? 'Lehrkraftbereich' : 'Dein Schülerbereich'}</small></span><span class="online-dot" title="Verbunden"></span></div><div class="nav-label">DEIN CAMPUS</div><nav aria-label="Hauptnavigation">${items.map(item => `<button class="nav-item ${tab === item.id ? 'active' : ''}" data-action="nav" data-tab="${item.id}" ${tab === item.id ? 'aria-current="page"' : ''}>${icon(item.icon)}<span>${item.name}</span>${item.id === 'arena' && pending ? `<span class="nav-count">${pending}</span>` : ''}</button>`).join('')}</nav><div class="sidebar-note"><span class="note-icon">${icon(teacher ? 'spark' : 'book', '', 25)}</span><h3>${teacher ? 'Anerkennung, die ankommt.' : 'Dein Einsatz zählt.'}</h3><p>${teacher ? 'Mach aus guter Mitarbeit einen besonderen Moment.' : 'Erfahrung sammelst du durch gute Mitarbeit im Schulalltag.'}</p><span class="note-stars">✦<i>✧</i>✦</span></div><div class="sidebar-profile">${teacher ? `<span class="profile-initials">${e(initials(user.name))}</span>` : avatar(user.avatar)}<span><strong>${e(user.name)}</strong><small>${teacher ? 'Lehrkraft' : `Level ${user.level} · Schüleraccount`}</small></span><button class="icon-button" data-action="logout" aria-label="Abmelden" title="Abmelden">${icon('logout', '', 18)}</button></div></aside><div class="main-shell"><header class="topbar"><div class="breadcrumb">${icon('book', '', 16)}<span>${e(user.schoolName || 'Campus Nord')}</span><span>/</span><strong>${currentNav.name}</strong></div><div class="topbar-right"><span class="live-label"><i></i> Dein Abenteuer läuft</span><span class="role-badge">${demoMode ? 'Demo · ' : ''}${teacher ? 'Lehrkraft' : 'Schüler:in'}</span><button class="icon-button mobile-logout" data-action="logout" aria-label="Abmelden">${icon('logout')}</button></div></header><main id="main-content" tabindex="-1">${tab === 'overview' ? renderOverview() : tab === 'arena' ? renderArena() : tab === 'character' ? renderCharacter() : tab === 'class' ? renderClass() : renderRewardsPage()}</main><footer class="app-footer"><span>klassenhelden <i>✦</i> Gemeinsam wachsen.</span><span>Fair spielen. Stärker werden.</span></footer></div></div>`;
}

function heading(eyebrow, title, subtitle, action = '') {
  return `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}

function statCard(iconName, color, label, value, detail) {
  return `<article class="stat-card"><span class="stat-icon ${color}">${icon(iconName, '', 22)}</span><div><span class="stat-label">${label}</span><strong>${value}</strong><small>${detail}</small></div><span class="stat-decoration">✧</span></article>`;
}

function renderOverview() {
  const user = state.user;
  if (user.role === 'teacher') return renderTeacherOverview();
  const pending = state.battles.filter(b => b.status === 'pending' && b.opponentId === user.id);
  const active = state.battles.filter(b => b.status === 'active');
  return `${heading(`HEY ${e(shortName(user.name)).toUpperCase()}, SCHÖN DICH ZU SEHEN`, 'Dein nächstes Level wartet<span class="title-dot">.</span>', 'Jeder Einsatz bringt dich weiter. Was ist heute dein nächster Zug?', `<button class="button outline" data-action="nav" data-tab="character">${icon('hero')} Mein Held</button>`)}<div class="stats-grid">${statCard('spark', 'gold', 'Verfügbare Erfahrung', `${user.xp} <em>XP</em>`, `${user.totalXp} XP insgesamt verdient`)}${statCard('trophy', 'purple', 'Dein Charakterlevel', `Level ${user.level}`, 'Wachse mit deiner Mitarbeit')}${statCard('potion', 'green', 'Dein Inventar', `${user.inventory.potion} <em>Heiltränke</em>`, 'Für den richtigen Moment im Duell')}</div><div class="overview-main"><section class="arena-banner"><div class="banner-copy"><span class="banner-eyebrow">DIE ARENA WARTET AUF DICH</span><h2>Dein Held.<br>Deine Strategie.</h2><p>Fordere deine Klasse heraus.<br>Ein Zug kann alles verändern.</p><button class="button gold" data-action="nav" data-tab="arena">Arena betreten ${icon('arrow')}</button><span class="banner-footnote">${icon('shield', '', 15)} Rundenbasiert. Fair. Gemeinsam.</span></div><div class="arena-art"><span class="art-star">✦</span><div class="arena-ring"></div><div class="arena-pedestal"></div><div class="arena-hero">${avatar(user.avatar)}</div><span class="arena-level">LVL ${user.level}</span><span class="arena-mini-spark">✧</span><div class="arena-enemy">${avatar('owl')}</div><span class="arena-versus">VS</span></div></section><section class="panel next-step"><div class="section-title"><h2>Dein nächster Schritt</h2><span class="mini-icon gold">${icon('spark', '', 17)}</span></div><div class="step-art">${icon(pending.length ? 'mail' : active.length ? 'swords' : 'shield', '', 38)}<span>✦</span></div><h3>${pending.length ? 'Du wurdest herausgefordert!' : active.length ? 'Dein Duell geht weiter.' : 'Bereit für die erste Runde?'}</h3><p>${pending.length ? `${pending.length} Einladung${pending.length > 1 ? 'en warten' : ' wartet'} auf deine Antwort. Zeig, was in deinem Helden steckt.` : active.length ? 'Dein Gegenüber wartet auf den nächsten Zug. Setze deine Skills geschickt ein.' : 'Lerne im Training die Angriffe kennen. Danach kann das erste Klassenduell kommen.'}</p><button class="button ${pending.length || active.length ? 'primary' : 'outline'} full" ${pending.length || active.length ? 'data-action="nav" data-tab="arena"' : 'data-action="start-training"'}>${pending.length ? 'Einladungen ansehen' : active.length ? 'Zum Duell' : 'Trainingsduell starten'}${icon('arrow')}</button><small>Für Duelle gibt es keine zusätzlichen XP.</small></section></div><div class="overview-bottom"><section class="panel character-summary"><div class="section-title"><h2>Dein Held</h2><button class="text-button" data-action="nav" data-tab="character">Weiterentwickeln ${icon('arrow', '', 16)}</button></div><div class="character-summary-body">${avatar(user.avatar)}<div><span class="pill gold">LEVEL ${user.level}</span><h3>${e(user.characterName)}</h3><p>${e(user.name)}</p></div></div><div class="mini-skills">${Object.entries(skillInfo).map(([key, skill]) => `<div><span>${icon(skill.icon, '', 17)} ${skill.name}</span><strong>${user.skills[key]}<small>/10</small></strong></div>`).join('')}</div></section><section class="panel recent-rewards"><div class="section-title"><h2>Dein Einsatz wird belohnt</h2><button class="text-button" data-action="nav" data-tab="rewards">Alle ansehen ${icon('arrow', '', 16)}</button></div>${renderRewardList(state.rewards.slice(0, 3), true)}</section></div>`;
}

function studentName(id) { return state.students.find(s => s.id === id)?.name || (id === state.user.id ? state.user.name : 'Mitschüler:in'); }
function studentCharacter(id) { return state.students.find(s => s.id === id)?.characterName || (id === state.user.id ? state.user.characterName : 'Trainingswächter'); }

function renderTeacherOverview() {
  const total = state.rewards.reduce((sum, r) => sum + Number(r.xp || 0), 0);
  return `${heading(`WILLKOMMEN, ${e(state.user.name).toUpperCase()}`, 'Kleine Anerkennung. Große Wirkung<span class="title-dot">.</span>', 'Belohne gute Mitarbeit und lass deine Klasse über sich hinauswachsen.')}<div class="stats-grid">${statCard('users', 'purple', 'Deine Klasse', state.students.length, 'Schüler:innen am Campus')}${statCard('spark', 'gold', 'Vergebene Erfahrung', `${total} <em>XP</em>`, 'In der angezeigten Vergabehistorie')}${statCard('gift', 'green', 'Belohnungen', state.rewards.length, 'Momente der Anerkennung')}</div><div class="teacher-layout"><section class="panel reward-panel">${renderRewardForm()}</section><section class="panel class-preview"><div class="section-title"><h2>Deine Klassenhelden</h2><button class="text-button" data-action="nav" data-tab="class">Alle ansehen ${icon('arrow', '', 16)}</button></div><p class="section-description">So entwickelt sich deine Klasse.</p>${state.students.length ? state.students.slice(0, 5).map(s => `<div class="student-row">${avatar(s.avatar)}<div><strong>${e(s.name)}</strong><small>${e(s.characterName)} · Level ${s.level}</small></div><button class="icon-button gift-button" data-action="reward-student" data-id="${e(s.id)}" aria-label="${e(s.name)} belohnen">${icon('gift')}</button></div>`).join('') : emptyState('users', 'Noch keine Schüleraccounts', 'Sobald sich Schüler:innen registrieren, erscheinen sie hier.')}<div class="info-note">${icon('book')}<p>Erfahrung entsteht im Schulalltag. Du entscheidest, welcher Einsatz eine Belohnung verdient.</p></div></section></div><section class="panel"><div class="section-title"><h2>Zuletzt belohnt</h2><button class="text-button" data-action="nav" data-tab="rewards">Gesamte Historie ${icon('arrow', '', 16)}</button></div>${renderRewardList(state.rewards.slice(0, 4))}</section>`;
}

function renderRewardForm() {
  return `<div class="section-title"><h2>Eine Leistung. Eine Belohnung.</h2><span class="mini-icon gold">${icon('gift')}</span></div><p class="section-description">Zeige, dass du den Einsatz deiner Schüler:innen siehst.</p><form id="reward-form"><label for="reward-student">Wen möchtest du belohnen?</label><select id="reward-student" name="studentId" required ${!state.students.length ? 'disabled' : ''}><option value="">Schüler:in auswählen</option>${state.students.map(s => `<option value="${e(s.id)}" ${rewardDraft.studentId === s.id ? 'selected' : ''}>${e(s.name)} · ${e(s.characterName)}</option>`).join('')}</select><div class="reward-options"><div><label for="reward-xp">Erfahrungspunkte</label><div class="input-with-suffix"><input id="reward-xp" type="number" name="xp" min="0" max="100" step="1" value="${e(rewardDraft.xp)}" required><span>XP</span></div><small>0 bis 100 XP pro Vergabe</small></div><div><label for="reward-potion">Gegenstand</label><label class="item-checkbox ${rewardDraft.item ? 'selected' : ''}"><input id="reward-potion" name="item" type="checkbox" ${rewardDraft.item ? 'checked' : ''}>${icon('potion')}<span>Heiltrank<small>+1 fürs Inventar</small></span></label></div></div><label for="reward-reason">Wofür ist die Belohnung?</label><textarea id="reward-reason" name="reason" minlength="3" maxlength="160" rows="3" placeholder="z. B. Tolle Mitarbeit und eine hilfreiche Erklärung für die Klasse." required>${e(rewardDraft.reason)}</textarea><div class="form-bottom"><span>${icon('spark', '', 16)} Anerkennung macht den Unterschied.</span><button type="submit" class="button primary" ${!state.students.length ? 'disabled' : ''}>Belohnung vergeben ${icon('gift', '', 18)}</button></div></form>`;
}

function renderClass() {
  return `${heading('GEMEINSAM WEITERKOMMEN', 'Deine Klassenhelden<span class="title-dot">.</span>', 'Jeder Charakter hat seine Stärken. Hier siehst du die Entwicklung deiner Klasse.')}<div class="student-grid">${state.students.map(s => `<article class="panel student-card"><div class="student-card-top">${avatar(s.avatar)}<span class="pill gold">LEVEL ${s.level}</span></div><h2>${e(s.name)}</h2><p class="muted">${e(s.characterName)}</p><div class="student-card-stat"><span>Erfahrung insgesamt</span><strong>${s.totalXp} XP</strong></div><div class="mini-skills">${Object.entries(skillInfo).map(([key, info]) => `<div><span>${icon(info.icon, '', 16)}${info.name}</span><strong>${s.skills[key]}</strong></div>`).join('')}</div><button class="button outline full" data-action="reward-student" data-id="${e(s.id)}">${icon('gift')} Leistung belohnen</button></article>`).join('') || `<section class="panel">${emptyState('users', 'Deine Klasse wartet noch', 'Neue Schüleraccounts erscheinen automatisch in dieser Übersicht.')}</section>`}</div>`;
}

function emptyState(iconName, title, text) { return `<div class="empty-state"><span>${icon(iconName, '', 26)}</span><h3>${title}</h3><p>${text}</p></div>`; }

function dateLabel(value) {
  if (!value) return '';
  const date = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

function renderRewardList(rewards, compact = false) {
  if (!rewards.length) return emptyState('gift', 'Der erste Erfolg kommt bestimmt.', state.user.role === 'teacher' ? 'Verteile deine erste Belohnung für gute Mitarbeit.' : 'Wenn deine Lehrkraft deinen Einsatz belohnt, siehst du es hier.');
  return `<div class="reward-list ${compact ? 'compact' : ''}">${rewards.map(r => `<article class="reward-row"><span class="reward-symbol ${r.item ? 'green' : 'gold'}">${icon(r.item ? 'potion' : 'spark', '', 21)}</span><div class="reward-description"><strong>${e(r.reason)}</strong><p>${state.user.role === 'teacher' ? `${e(r.studentName || studentName(r.studentId))} <span>·</span> ` : ''}${e(r.teacherName || 'Deine Lehrkraft')} <span>·</span> ${e(dateLabel(r.createdAt))}</p></div><div class="reward-amount">${r.xp ? `<strong>+${r.xp} XP</strong>` : ''}${r.item ? `<small>+1 Heiltrank</small>` : ''}</div></article>`).join('')}</div>`;
}

function renderRewardsPage() {
  const teacher = state.user.role === 'teacher';
  return `${heading(teacher ? 'ANERKENNUNG SICHTBAR MACHEN' : 'DAS HAST DU DIR VERDIENT', teacher ? 'Eine Klasse voller Fortschritt<span class="title-dot">.</span>' : 'Dein Einsatz zählt<span class="title-dot">.</span>', teacher ? 'Alle vergebenen Belohnungen auf einen Blick.' : 'Deine Lehrkräfte belohnen gute Mitarbeit mit Erfahrung und Gegenständen.', teacher ? '<button class="button primary" data-action="nav" data-tab="overview">Belohnung vergeben '+icon('gift')+'</button>' : '')}<section class="panel"><div class="section-title"><h2>${teacher ? 'Vergabehistorie' : 'Deine Belohnungen'}</h2><span class="pill neutral">${state.rewards.length} EINTRÄGE</span></div>${renderRewardList(state.rewards)}</section>${!teacher ? `<div class="info-note rewards-note">${icon('book', '', 24)}<p>XP und Gegenstände bekommst du von deinen Lehrkräften. Duelle sind zum gemeinsamen Spielen da und bringen keine zusätzlichen Erfahrungspunkte.</p></div>` : ''}`;
}

function renderCharacter() {
  const u = state.user;
  const progress = ((u.totalXp || 0) % 100);
  return `${heading('DEIN CHARAKTER. DEINE ENTSCHEIDUNG.', 'Hier wächst ein Held<span class="title-dot">.</span>', 'Gib deinem Charakter eine Persönlichkeit und entwickle seine Stärken.')}<div class="character-layout"><section class="panel hero-profile"><span class="pill gold">LEVEL ${u.level}</span><div class="profile-avatar">${avatar(profileDraft.avatar)}<span>✦</span></div><h2>${e(u.characterName)}</h2><p>${e(u.name)}</p><div class="xp-progress-label"><span>${progress} / 100 XP zum nächsten Level</span><strong>Lvl ${u.level + 1}</strong></div><div class="progress-track"><span style="width:${progress}%"></span></div><form id="character-form"><label for="hero-name">Charaktername</label><input id="hero-name" name="characterName" required minlength="2" maxlength="30" value="${e(profileDraft.characterName)}"><label>Wähle deinen Begleiter</label><div class="avatar-options">${[['fox', 'Fuchs'], ['owl', 'Eule'], ['dragon', 'Drache'], ['cat', 'Katze']].map(([type, name]) => `<button type="button" class="avatar-option ${profileDraft.avatar === type ? 'selected' : ''}" data-action="choose-avatar" data-avatar="${type}" aria-label="${name}" aria-pressed="${profileDraft.avatar === type}" title="${name}">${avatar(type)}</button>`).join('')}</div><button class="button outline full" type="submit">Charakter speichern ${icon('check', '', 17)}</button></form></section><div class="skills-column"><section class="skill-intro"><span class="stat-icon gold">${icon('spark', '', 25)}</span><div><h2>${u.xp} XP für deinen nächsten Schritt</h2><p>Investiere deine Erfahrung in neue Skillstufen. Dein Charakterlevel bleibt dabei erhalten.</p></div></section>${Object.entries(skillInfo).map(([key, skill]) => { const current = u.skills[key]; const cost = current * 25; return `<section class="panel skill-card"><span class="skill-icon ${skill.color}">${icon(skill.icon, '', 27)}</span><div class="skill-details"><div class="skill-heading"><h3>${skill.name}</h3><span>Stufe <strong>${current}</strong> / 10</span></div><p>${skill.text}</p><div class="skill-levels" aria-label="Stufe ${current} von 10">${Array.from({ length: 10 }, (_, i) => `<i class="${i < current ? skill.color : ''}"></i>`).join('')}</div></div><button class="button ${u.xp >= cost && current < 10 ? 'primary' : 'outline'} skill-upgrade" data-action="upgrade" data-skill="${key}" ${current >= 10 || u.xp < cost ? 'disabled' : ''}>${current >= 10 ? 'Maximum' : `${icon('plus', '', 16)} ${cost} XP`}</button></section>`; }).join('')}<section class="panel inventory-panel"><div class="section-title"><h2>Dein Inventar</h2><span class="pill neutral">FÜR DEINE DUELLE</span></div><div class="inventory-item"><span class="inventory-potion">${icon('potion', '', 31)}</span><div><h3>Heiltrank</h3><p>Heilt deinen Helden. Der Einsatz verbraucht einen Zug.</p></div><strong>×${u.inventory.potion}</strong></div></section></div></div>`;
}

function renderArena() {
  const u = state.user;
  const battles = state.battles;
  const active = battles.filter(b => b.status === 'active');
  const pending = battles.filter(b => b.status === 'pending');
  const finished = battles.filter(b => b.status === 'finished');
  let selected = battles.find(b => b.id === selectedBattleId);
  if (!selected || !['active', 'finished'].includes(selected.status)) {
    selected = active[0] || null;
    selectedBattleId = selected?.id || null;
  }
  const peers = state.students.filter(s => s.id !== u.id);
  return `${heading('EIN GUTER PLAN IST DEINE BESTE WAFFE', 'Willkommen in der Arena<span class="title-dot">.</span>', 'Greife an, verteidige dich und finde den richtigen Moment für deinen Fokus.')}<div class="arena-rules"><span>${icon('clock', '', 17)} Abwechselnd ein Zug</span><span>${icon('shield', '', 17)} Skills bestimmen deine Stärke</span><span>${icon('book', '', 17)} Keine Kampf-XP</span></div>${pending.length ? `<section class="panel invitations"><div class="section-title"><h2>Offene Herausforderungen</h2><span class="pill gold">${pending.length}</span></div>${pending.map(b => { const incoming = b.opponentId === u.id; const otherId = incoming ? b.challengerId : b.opponentId; const other = state.students.find(s => s.id === otherId); return `<div class="invitation-row">${avatar(other?.avatar || 'owl')}<div><strong>${incoming ? `${e(studentName(otherId))} fordert dich heraus.` : `Einladung an ${e(studentName(otherId))}`}</strong><small>${incoming ? 'Bereit für ein Duell? Du entscheidest.' : 'Dein Gegenüber muss die Herausforderung noch annehmen.'}</small></div>${incoming ? `<div class="invitation-actions"><button class="button outline small" data-action="respond-battle" data-id="${e(b.id)}" data-accept="false">Ablehnen</button><button class="button primary small" data-action="respond-battle" data-id="${e(b.id)}" data-accept="true">Annehmen ${icon('swords', '', 15)}</button></div>` : '<div class="invitation-actions"><span class="waiting-label">'+icon('clock', '', 16)+' Wartet auf Antwort</span><button class="button outline small" data-action="cancel-battle" data-id="'+e(b.id)+'" data-pending="true">Zurückziehen</button></div>'}</div>`; }).join('')}</section>` : ''}${active.length > 1 ? `<div class="battle-tabs" aria-label="Aktive Duelle">${active.map(b => `<button class="${selectedBattleId === b.id ? 'selected' : ''}" data-action="select-battle" data-id="${e(b.id)}">${b.type === 'training' ? 'Training' : e(studentCharacter(b.challengerId === u.id ? b.opponentId : b.challengerId))}${b.state?.turnId === u.id ? '<i></i>' : ''}</button>`).join('')}</div>` : ''}${selected?.state ? renderBattle(selected) : `<section class="training-banner"><div><span class="eyebrow">DEIN ERSTER ZUG</span><h2>Ein bisschen üben.<br>Dann groß aufspielen.</h2><p>Probiere deine Strategie gegen den Trainingswächter aus.<br>Ganz in deinem Tempo, ohne Rangliste oder Belohnungen.</p><button class="button primary" data-action="start-training">Trainingsduell starten ${icon('swords', '', 18)}</button></div><div class="training-avatar">${avatar('dragon')}<span class="training-star">✦</span><span class="training-shield">${icon('shield', '', 30)}</span></div></section>`}<section class="arena-peers"><div class="section-title"><div><span class="eyebrow">GEMEINSAM SPIELEN</span><h2>Fordere deine Klasse heraus</h2></div><span class="pill neutral">${peers.length} MITSPIELENDE</span></div><p class="section-description">Dein Gegenüber nimmt das Duell im eigenen Account an. Danach zieht ihr abwechselnd.</p><div class="opponent-grid">${peers.length ? peers.map(s => { const exists = battles.some(b => ['pending', 'active'].includes(b.status) && b.type === 'pvp' && [b.challengerId, b.opponentId].includes(s.id)); return `<article class="panel opponent-card">${avatar(s.avatar)}<div><h3>${e(s.characterName)}</h3><p>${e(s.name)} <span>·</span> Level ${s.level}</p></div><button class="button outline full" data-action="challenge" data-id="${e(s.id)}" ${exists ? 'disabled' : ''}>${icon('swords', '', 17)} ${exists ? 'Duell bereits offen' : 'Herausfordern'}</button></article>`; }).join('') : `<div class="panel">${emptyState('users', 'Deine Klasse kommt noch dazu.', 'Bis dahin wartet der Trainingswächter auf dich.')}</div>`}</div></section>${finished.length ? `<section class="panel finished-battles"><div class="section-title"><h2>Deine letzten Duelle</h2><span class="mini-icon gold">${icon('trophy')}</span></div>${finished.slice(0, 5).map(b => `<button class="finished-row" data-action="select-battle" data-id="${e(b.id)}"><span class="result-icon ${b.state?.winnerId === u.id ? 'win' : ''}">${icon(b.state?.winnerId === u.id ? 'trophy' : 'swords', '', 18)}</span><span><strong>${b.type === 'training' ? 'Training mit dem Wächter' : `Duell gegen ${e(studentName(b.challengerId === u.id ? b.opponentId : b.challengerId))}`}</strong><small>${e(dateLabel(b.createdAt))}</small></span><span class="result-label">${b.state?.winnerId === u.id ? 'Gewonnen' : b.state?.winnerId ? 'Verloren' : 'Unentschieden'}</span>${icon('chevron', '', 16)}</button>`).join('')}</section>` : ''}`;
}

function renderBattle(battle) {
  const b = battle.state;
  const me = b.fighters.find(f => f.id === state.user.id);
  const other = b.fighters.find(f => f.id !== state.user.id);
  if (!me || !other) return emptyState('swords', 'Dieses Duell ist nicht verfügbar.', 'Lade die Seite neu, um den aktuellen Stand zu erhalten.');
  const finished = battle.status === 'finished' || b.status === 'finished';
  const myTurn = !finished && b.turnId === state.user.id;
  const otherUser = state.students.find(s => s.id === other.id);
  const cooldown = me.focusCooldown || 0;
  const disabled = finished || !myTurn;
  return `<section class="battle-panel"><div class="battle-topline"><span>${icon('swords', '', 17)} ${battle.type === 'training' ? 'TRAININGSDUELL' : 'KLASSENDUELL'}</span><span>RUNDE ${b.round}</span></div><div class="battle-fighters">${fighterCard(me, state.user.avatar, true)}<div class="versus-badge">VS<span>✦</span></div>${fighterCard(other, battle.type === 'training' ? 'dragon' : otherUser?.avatar || 'owl', false)}</div><div class="turn-indicator ${finished ? 'finished' : myTurn ? 'your-turn' : ''}">${icon(finished ? 'trophy' : 'clock', '', 18)}<strong>${finished ? b.winnerId === state.user.id ? 'Stark gespielt! Dein Held gewinnt.' : b.winnerId ? `${e(other.characterName)} gewinnt dieses Duell.` : 'Ein Duell auf Augenhöhe. Unentschieden!' : myTurn ? 'Du bist am Zug. Was ist dein Plan?' : `${e(other.characterName)} ist am Zug.`}</strong>${finished ? '<small>In der Arena zählt der Spaß. XP gibt es durch schulische Mitarbeit.</small>' : !myTurn ? '<small>Der Spielstand aktualisiert sich automatisch.</small>' : ''}</div>${!finished ? `<div class="battle-actions"><button class="battle-action" data-action="battle-action" data-id="${e(battle.id)}" data-move="attack" ${disabled ? 'disabled' : ''}><span class="action-icon coral">${icon('swords', '', 23)}</span><strong>Angreifen</strong><small>Direkter Schaden</small></button><button class="battle-action" data-action="battle-action" data-id="${e(battle.id)}" data-move="focus" ${disabled || cooldown > 0 ? 'disabled' : ''}><span class="action-icon purple">${icon('spark', '', 23)}</span><strong>Fokus-Attacke</strong><small>${cooldown > 0 ? `In ${cooldown} eigenen Zügen bereit` : 'Stark, mit Abklingzeit'}</small></button><button class="battle-action" data-action="battle-action" data-id="${e(battle.id)}" data-move="guard" ${disabled ? 'disabled' : ''}><span class="action-icon blue">${icon('shield', '', 23)}</span><strong>Verteidigen</strong><small>Schützt und heilt leicht</small></button><button class="battle-action" data-action="battle-action" data-id="${e(battle.id)}" data-move="potion" ${disabled || !state.user.inventory.potion || me.hp >= me.maxHp ? 'disabled' : ''}><span class="action-icon green">${icon('potion', '', 23)}</span><strong>Heiltrank <em>×${state.user.inventory.potion}</em></strong><small>${me.hp >= me.maxHp ? 'Du bist bei voller Gesundheit' : 'Heilen statt angreifen'}</small></button></div>` : `<div class="battle-end-actions"><button class="button primary" data-action="start-training">Neues Training ${icon('arrow', '', 17)}</button><button class="button outline" data-action="dismiss-battle">Andere Gegner ansehen</button></div>`}${!finished ? `<div class="battle-surrender"><button class="text-button" data-action="cancel-battle" data-id="${e(battle.id)}">Duell aufgeben</button></div>` : ''}<div class="battle-log"><h3>${icon('book', '', 16)} Das ist passiert</h3><ol>${b.log.slice(-6).map(line => `<li>${e(line)}</li>`).join('') || '<li>Das Duell beginnt. Plane deinen ersten Zug.</li>'}</ol></div></section>`;
}

function fighterCard(f, animal, self) {
  const ratio = Math.max(0, Math.min(100, f.hp / f.maxHp * 100));
  return `<div class="fighter ${self ? 'self' : 'opponent'}"><span class="fighter-label">${self ? 'DEIN HELD' : 'DEIN GEGENÜBER'}</span><div class="fighter-avatar">${avatar(animal)}${f.guarding ? `<span class="guard-badge" title="Verteidigt">${icon('shield', '', 18)}</span>` : ''}</div><h3>${e(f.characterName)}</h3><p>${e(f.name)}</p><div class="health-label"><span>${icon('heart', '', 14)} Lebenspunkte</span><strong>${f.hp}<small> / ${f.maxHp}</small></strong></div><div class="health-track"><span class="${ratio < 30 ? 'low' : ''}" style="width:${ratio}%"></span></div></div>`;
}

function confirmDialog(title, description, confirmLabel) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'confirmation-dialog';
    dialog.setAttribute('aria-labelledby', 'confirmation-title');
    dialog.setAttribute('aria-describedby', 'confirmation-description');
    dialog.innerHTML = `<span class="confirmation-symbol">${icon('shield', '', 25)}</span><h2 id="confirmation-title">${e(title)}</h2><p id="confirmation-description">${e(description)}</p><form method="dialog"><button class="button outline" value="cancel" autofocus>Weiterspielen</button><button class="button primary" value="confirm">${e(confirmLabel)}</button></form>`;
    document.body.append(dialog);
    dialog.addEventListener('close', () => { const result = dialog.returnValue === 'confirm'; dialog.remove(); resolve(result); }, { once: true });
    dialog.showModal();
  });
}

async function mutate(callback) {
  if (busy) return;
  busy = true;
  document.body.classList.add('is-busy');
  try {
    await callback();
    await refresh(true);
  } catch (error) { toast(error.message, true); }
  finally { busy = false; document.body.classList.remove('is-busy'); }
}

app.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  event.preventDefault();
  const action = button.dataset.action;
  if (action === 'auth-mode') { authMode = button.dataset.mode; renderAuth(); return; }
  if (action === 'nav') { tab = button.dataset.tab; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (action === 'demo-login') {
    if (busy) return;
    busy = true; button.disabled = true;
    try { await api('/auth/login', { email: button.dataset.email, password: 'Klassenhelden!2026' }); profileDraft = null; tab = 'overview'; await refresh(true); toast('Willkommen bei den Klassenhelden!'); }
    catch (error) { toast(error.message, true); button.disabled = false; }
    finally { busy = false; }
    return;
  }
  if (action === 'logout') {
    try { await api('/auth/logout', {}); state = null; profileDraft = null; lastStateJSON = ''; selectedBattleId = null; rewardDraft = { studentId: '', xp: '50', item: false, reason: '' }; renderAuth(); }
    catch (error) { toast(error.message, true); }
    return;
  }
  if (action === 'choose-avatar') { profileDraft.avatar = button.dataset.avatar; render(); return; }
  if (action === 'reward-student') { rewardDraft.studentId = button.dataset.id; tab = 'overview'; render(); document.querySelector('#reward-reason')?.focus(); return; }
  if (action === 'select-battle') { selectedBattleId = button.dataset.id; render(); document.querySelector('.battle-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (action === 'dismiss-battle') { selectedBattleId = null; render(); document.querySelector('.arena-peers')?.scrollIntoView({ behavior: 'smooth' }); return; }
  if (action === 'cancel-battle') {
    const pending = button.dataset.pending === 'true';
    const confirmed = await confirmDialog(pending ? 'Einladung zurückziehen?' : 'Dieses Duell aufgeben?', pending ? 'Dein Gegenüber kann diese Herausforderung danach nicht mehr annehmen.' : 'Das Duell endet und dein Gegenüber gewinnt. Du kannst danach jederzeit ein neues Duell starten.', pending ? 'Einladung zurückziehen' : 'Duell aufgeben');
    if (confirmed) return mutate(async () => { await api(`/battles/${encodeURIComponent(button.dataset.id)}/cancel`, {}); toast(pending ? 'Einladung zurückgezogen.' : 'Duell beendet. Auf zum nächsten Versuch!'); });
    return;
  }
  if (action === 'upgrade') return mutate(async () => { await api('/skills/upgrade', { skill: button.dataset.skill }); toast(`${skillInfo[button.dataset.skill].name} verbessert. Dein Held wächst!`); });
  if (action === 'start-training' || action === 'challenge') return mutate(async () => {
    const result = await api('/battles', { opponentId: action === 'start-training' ? 'training-bot' : button.dataset.id });
    selectedBattleId = result.battle?.id || null; tab = 'arena';
    if (action === 'challenge') toast('Herausforderung verschickt. Dein Gegenüber kann sie jetzt annehmen.');
  });
  if (action === 'respond-battle') return mutate(async () => { const accept = button.dataset.accept === 'true'; const result = await api(`/battles/${encodeURIComponent(button.dataset.id)}/respond`, { accept }); if (accept) selectedBattleId = result.battle?.id || button.dataset.id; toast(accept ? 'Das Duell beginnt. Viel Spaß!' : 'Herausforderung abgelehnt.'); });
  if (action === 'battle-action') return mutate(() => api(`/battles/${encodeURIComponent(button.dataset.id)}/actions`, { action: button.dataset.move }));
});

app.addEventListener('input', event => {
  const input = event.target;
  if (input.closest('#reward-form')) {
    if (input.name === 'item') { rewardDraft.item = input.checked; input.closest('.item-checkbox').classList.toggle('selected', input.checked); }
    else if (input.name in rewardDraft) rewardDraft[input.name] = input.value;
  }
  if (input.closest('#character-form') && input.name === 'characterName') profileDraft.characterName = input.value;
});
app.addEventListener('change', event => {
  if (event.target.closest('#reward-form') && event.target.name === 'studentId') rewardDraft.studentId = event.target.value;
});

app.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  if (form.id === 'auth-form') {
    if (busy) return;
    busy = true;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    document.querySelector('#auth-error').textContent = '';
    try {
      const values = Object.fromEntries(formData);
      await api(authMode === 'register' ? '/auth/register' : '/auth/login', values);
      profileDraft = null; tab = 'overview'; await refresh(true); toast('Schön, dass du dabei bist!');
    } catch (error) { const errorEl = document.querySelector('#auth-error'); if (errorEl) errorEl.textContent = error.message; submit.disabled = false; }
    finally { busy = false; }
  }
  if (form.id === 'reward-form') return mutate(async () => {
    await api('/rewards', { studentId: rewardDraft.studentId, xp: Number(rewardDraft.xp), item: rewardDraft.item ? 'potion' : null, reason: rewardDraft.reason });
    rewardDraft.reason = ''; toast('Belohnung vergeben. Ein schöner Moment für deinen Klassenhelden!');
  });
  if (form.id === 'character-form') return mutate(async () => { await api('/character', profileDraft); toast('Dein Charakter wurde gespeichert.'); });
});

async function boot() {
  try {
    const session = await api('/session');
    demoMode = session.demoMode === true;
    if (session.user) await refresh(true);
    else renderAuth();
  } catch (error) {
    app.innerHTML = `<div class="boot-screen"><span class="brand-mark">k<span>✦</span></span><h1>Eine kurze Abenteuerpause.</h1><p>${e(error.message)}</p><button class="button primary" id="retry-boot">Erneut versuchen</button></div>`;
    document.querySelector('#retry-boot').addEventListener('click', boot);
  }
}
setInterval(() => { if (state && !busy && !document.hidden) refresh().catch(error => { if (state) toast(error.message, true); }); }, 5000);
boot();
