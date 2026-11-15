import { enemyVisualFor } from '../shared/enemies.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const labels = {
  bandit: 'Bandit', mage: 'Magier', 'dark-mage': 'Dunkler Magier',
  'tide-guardian': 'Gezeitenwächter', 'training-warden': 'Menschlicher Übungswächter',
};

function face({ skin = '#d0a17e', hair = '#493b38', eyes = '#302d37', beard = false, stern = false } = {}) {
  return `<ellipse cx="29" cy="51" rx="4" ry="6" fill="${skin}"/><ellipse cx="71" cy="51" rx="4" ry="6" fill="${skin}"/><path d="M29 43q0-22 21-22t21 22v15q-2 18-21 25-19-7-21-25Z" fill="${skin}"/><path d="M29 43V35q2-20 21-20t21 20v8l-8-12-10 3-10-5-7 7Z" fill="${hair}"/><path d="${stern ? 'm35 46 9 2m21-2-9 2' : 'M35 45h9m12 0h9'}" stroke="${hair}" stroke-width="2.6" stroke-linecap="round"/><g fill="${eyes}"><ellipse cx="40" cy="52" rx="2.5" ry="3.3"/><ellipse cx="60" cy="52" rx="2.5" ry="3.3"/></g><path d="m49 56-3 8h7" stroke="#936f5d" stroke-width="1.6" fill="none" stroke-linecap="round"/>${beard ? `<path d="M32 63q6 11 18 9 12 2 18-9l-4 17-14 15-14-15Z" fill="${hair}"/><path d="M41 68q9 4 18 0" stroke="#a1a69b" stroke-width="2" fill="none"/>` : '<path d="M43 71q7 3 14 0" stroke="#80594f" stroke-width="1.8" fill="none" stroke-linecap="round"/>'}`;
}

function staff(color, crystal = '#b5dcd8') {
  return `<path d="M85 99V36" stroke="${color}" stroke-width="5"/><path d="m85 17 9 15-9 16-9-16Z" fill="${crystal}" stroke="${color}" stroke-width="2"/><path d="M85 23v17" stroke="#f2f1cf" stroke-width="1.5"/>`;
}

function bandit(variant) {
  const captain = variant === 'captain', brute = variant === 'brute';
  const hood = captain ? '#674c51' : brute ? '#5a584c' : '#4a5558';
  const cloth = captain ? '#9b6357' : '#6f6a51';
  return `<path d="M14 100V85q36-27 72 0v15Z" fill="${cloth}"/><path d="m27 84 11-8 12 10 13-10 11 8-8 16H35Z" fill="#3e4143"/><path d="M22 64V39Q22 8 50 9q28-1 28 30v25l-9 13H31Z" fill="${hood}"/>${face({ skin: brute ? '#b78968' : '#d0a17e', hair: '#453b37', stern: true })}<path d="M26 45q3-28 24-28t24 28l-12-15-12 1-13 1Z" fill="${hood}"/><path d="m30 59 20 8 20-8-3 18-17 8-17-8Z" fill="#363d40"/><path d="m36 68 28 6m-27-1 21 6" stroke="#73796c" stroke-width="1.4" opacity=".7"/><path d="m26 84 43 16M32 82l43 18" stroke="#ad8b63" stroke-width="4"/><rect x="48" y="88" width="10" height="9" rx="1" fill="#c6a373"/>${captain ? '<path d="M29 38q21-13 42 0" stroke="#bd745d" stroke-width="5"/><path d="m50 24 4 5-4 5-4-5Z" fill="#dfbd7f"/>' : brute ? '<path d="M23 39v-9q27-22 54 0v9Z" fill="#85857b"/><path d="M50 20v18" stroke="#c6b697" stroke-width="3"/>' : '<path d="M23 43q4-24 16-29" stroke="#7a8d83" stroke-width="2" fill="none"/>'}<path d="m79 97 7-31 5 1-6 31Z" fill="#a7b2ae"/>`;
}

function mage(variant, dark = false) {
  const archmage = variant === 'archmage', storm = variant === 'storm';
  const robe = dark ? '#46354f' : storm ? '#3e5b77' : '#3f6574';
  const trim = dark ? '#b08acb' : '#d6bd83';
  const skin = dark ? '#c0bdca' : '#d6b69b';
  return `<path d="M10 100V86q40-27 80 0v14Z" fill="${robe}"/><path d="m28 80 22 10 22-10-7 20H35Z" fill="${dark ? '#665078' : '#87a6ab'}"/><path d="M20 70V41Q20 5 50 6q30-1 30 35v29L65 84H35Z" fill="${robe}"/>${face({ skin, hair: dark ? '#383440' : '#c2c7ba', eyes: dark ? '#9863b9' : '#3f535c', beard: !dark, stern: dark })}<path d="M24 49q-1-32 26-36 27 4 26 36L65 33l-15-8-15 8Z" fill="${robe}"/><path d="M25 48q0-28 25-35 25 7 25 35" stroke="${trim}" stroke-width="2.2" fill="none"/><path d="m35 81 15 15 15-15" stroke="${trim}" stroke-width="3" fill="none"/><path d="m50 20 5 7-5 8-5-8Z" fill="${trim}"/>${dark ? '<path d="m34 52 9 1m14 0 9-1" stroke="#d6b2ec" stroke-width="1.5"/><path d="M32 66q18 15 36 0l-5 12-13 7-13-7Z" fill="#493b58" opacity=".85"/>' : ''}${archmage ? '<path d="M31 36h38l-5-8-8 5-6-10-6 10-8-5Z" fill="#dcc18b"/><circle cx="50" cy="34" r="3" fill="#8eced4"/>' : ''}${staff(dark ? '#7d6596' : '#ae986b', dark ? '#c3a1e5' : storm ? '#97bbec' : '#9eddd5')}`;
}

function guardian() {
  return `<path d="M12 100V84l18-13h40l18 13v16Z" fill="#386f7e"/><path d="m22 79 16 6 12-4 12 4 16-6-3 21H25Z" fill="#649398"/><path d="M25 56V33l8-14 17-9 17 9 8 14v23L64 76H36Z" fill="#6d9ca5" stroke="#b9dfd9" stroke-width="2"/><path d="M32 39q18-19 36 0v19L58 74H42L32 58Z" fill="#bdd5ce"/><path d="M32 39 50 26l18 13-11 4-7-4-7 4Z" fill="#4d7989"/><path d="m34 49 11 4m21-4-11 4" stroke="#7bf0df" stroke-width="4" stroke-linecap="round"/><path d="m50 51-4 12h8m-10 7h12" stroke="#517789" stroke-width="2" fill="none"/><path d="m50 14 6 9-6 12-6-12Z" fill="#b2e9d5"/><path d="M23 83 14 70l15-6 10 17m38 2 9-13-15-6-10 17" fill="#83c3c0" stroke="#d1e4d4" stroke-width="1.7"/><path d="m50 86 8 7-8 7-8-7Z" fill="#b3ebda"/>`;
}

function trainer() {
  return `<path d="M13 100V85q37-26 74 0v15Z" fill="#5c7183"/><path d="m32 77 18 11 18-11 7 23H25Z" fill="#976e4d"/><path d="M38 79v-9h24v9l-12 9Z" fill="#c9916c"/>${face({ skin: '#c9916c', hair: '#53423b' })}<path d="M28 38q22-14 44 0v-7q-23-15-44 0Z" fill="#c9b08b"/><path d="M34 84v16m32-16v16" stroke="#d4b68b" stroke-width="3"/><path d="M22 94h56" stroke="#503d35" stroke-width="5"/><rect x="46" y="90" width="9" height="8" fill="#b5a17e"/><path d="m81 96-6-65 4-6 5 6 4 64Z" fill="#b99167" stroke="#dec8a0" stroke-width="1.5"/><path d="m71 76 20-2" stroke="#79573d" stroke-width="5" stroke-linecap="round"/>`;
}

/** Render NPC portraits only. Player portraits and the Runengolem remain owned by their existing renderer. */
export function enemyPortrait(fighter, className = '') {
  const visual = enemyVisualFor(fighter);
  if (!visual || !Object.hasOwn(labels, visual.npcType)) return '';
  const { npcType, npcVariant } = visual;
  const background = { bandit: '#c7b395', mage: '#acc8d2', 'dark-mage': '#b8a9cc', 'tide-guardian': '#8db9ba', 'training-warden': '#d6c4a6' }[npcType];
  const art = npcType === 'bandit' ? bandit(npcVariant) : npcType === 'mage' ? mage(npcVariant)
    : npcType === 'dark-mage' ? mage(npcVariant, true) : npcType === 'tide-guardian' ? guardian() : trainer();
  const name = fighter?.characterName || fighter?.name || labels[npcType];
  const label = name === labels[npcType] ? labels[npcType] : `${name} · ${labels[npcType]}`;
  return `<svg class="avatar npc-portrait npc-portrait--${npcType} ${escapeHTML(className)}" data-npc-type="${npcType}" data-npc-variant="${escapeHTML(npcVariant)}" viewBox="0 0 100 100" role="img" aria-label="${escapeHTML(label)}"><rect width="100" height="100" rx="29" fill="${background}"/><circle cx="83" cy="15" r="16" fill="#edf4ed" opacity=".2"/>${art}</svg>`;
}
