import { formatMoney, shipStats, journeyDurationMs } from '../shared/airships.js';

const slots = { sails: 'Segel', hull: 'Rumpf', flag: 'Flagge' };
const statNames = { speed: 'Tempo', stability: 'Stabilität', navigation: 'Navigation' };
const statSymbols = { speed: '➜', stability: '⬡', navigation: '✧' };
const defaultNames = { sails: 'Leinensegel', hull: 'Werftrumpf', flag: 'Werftflagge' };
let inspectedShipId = null;
let selectedSlot = 'sails';
let catalogueFilter = 'all';
let destinationId = null;
let draft = null;
let latestState = null;

function dataFor(state) {
  return state.airships || { catalogue: { ships: [], parts: [], docks: [] }, owned: [], ownedParts: [], activeShipId: null, dockId: 'nebelheim', journey: null, version: 0 };
}
function ownedShip(data, id) { return data.owned.find(ship => ship.shipId === id); }
function partFor(data, id) { return data.catalogue.parts.find(part => part.id === id); }
function time(value) { return typeof value === 'number' ? value : Date.parse(value) || 0; }
function tripFor(data) { return data.journey && time(data.journey.arrivesAt) > Date.now() ? data.journey : null; }
function money(value) { return formatMoney(Math.max(0, Number(value) || 0)); }
function safeColor(value, fallback) { return /^#[\da-f]{3,8}$/i.test(value || '') ? value : fallback; }
function modificationsKey(modifications = {}) { return Object.keys(slots).map(slot => `${slot}:${modifications[slot] || ''}`).join('|'); }
function draftFor(ship, owned) {
  const key = `${ship.id}:${modificationsKey(owned?.modifications)}`;
  if (!draft || draft.key !== key) draft = { key, modifications: { sails: null, hull: null, flag: null, ...owned?.modifications } };
  return draft.modifications;
}
function bonusText(bonuses = {}) {
  return Object.entries(statNames).filter(([key]) => Number(bonuses[key]) > 0).map(([key, name]) => `+${bonuses[key]} ${name}`).join(' · ') || 'Grundausstattung';
}
function slotArt(slot, color = '#9ddfd1') {
  const drawing = slot === 'sails' ? '<path d="M29 8v44M28 12C17 19 12 30 9 40h19Zm5 2v26h20C45 33 40 24 33 14Z"/><path d="M13 47h39l-8 8H21Z"/>'
    : slot === 'hull' ? '<path d="M7 26h49L46 45H20Z"/><path d="M14 33h34M22 27v14m10-14v16m10-16v14M15 21h34"/><circle cx="31" cy="15" r="4"/>'
      : '<path d="M19 8v47M21 10h30l-9 12 9 12H21Z"/><path d="m28 22 5-5 5 5-5 5Z"/>';
  return `<svg viewBox="0 0 64 64" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawing}</svg>`;
}

// This illustration remains usable when a browser cannot create a WebGL context.
function shipArt(ship, modifications, data, e, compact = false) {
  const sails = partFor(data, modifications?.sails);
  const hull = partFor(data, modifications?.hull);
  const flag = partFor(data, modifications?.flag);
  const sailColor = safeColor(sails?.colors?.primary, '#e0dcc0');
  const hullColor = safeColor(hull?.colors?.primary, '#6c9392');
  const trim = safeColor(hull?.colors?.accent, '#e8c585');
  const flagColor = safeColor(flag?.colors?.primary, '#89d6c7');
  const large = ship.id === 'aetherarche', medium = ship.id === 'himmelsfalter';
  return `<svg class="airship-illustration ${compact ? 'compact' : ''}" viewBox="0 0 440 280" role="img" aria-label="${e(ship.name)}"><g class="airship-art-stream" fill="none" stroke="#7ce2cf" stroke-linecap="round"><path d="M20 228Q130 186 235 223T420 211" opacity=".18" stroke-width="12"/><path d="M8 248Q149 211 272 245T431 238" opacity=".3" stroke-width="2"/></g><g class="airship-art-ship"><path d="M100 180Q220 190 346 177L317 215Q221 242 131 214Z" fill="${hullColor}" stroke="${trim}" stroke-width="2"/><path d="M114 190Q219 211 333 188M138 203Q222 222 318 203" fill="none" stroke="${trim}" opacity=".5" stroke-width="2"/><path d="M152 173h148l21 13H130Z" fill="#394f60"/><path d="M201 48v142M276 86v99" stroke="${trim}" stroke-width="4"/><path d="M196 57Q135 92 123 157Q163 146 196 163Z" fill="${sailColor}" stroke="#fff5d5" stroke-opacity=".35" stroke-width="2"/><path d="M208 59v104q33-13 62-4Q253 112 208 59Z" fill="${sailColor}" opacity=".91"/><path d="M281 98v64l48-2Z" fill="${sailColor}" opacity=".8"/><path d="m202 48 54 3-16 12 17 12-55-3Z" fill="${flagColor}"/><path d="m165 105 10 17-10 17-10-17Z" fill="${safeColor(sails?.colors?.accent, '#b09560')}" opacity=".75"/><path d="M125 157 201 48l72 114M279 94l51 68" fill="none" stroke="#c5bd9d" stroke-width="1" opacity=".6"/><circle cx="162" cy="201" r="5" fill="#a0ebda"/><circle cx="200" cy="210" r="5" fill="#a0ebda"/><circle cx="241" cy="210" r="5" fill="#a0ebda"/><circle cx="280" cy="204" r="5" fill="#a0ebda"/>${medium || large ? `<path d="M107 181Q85 162 91 135q19 3 28 37M338 178q29-12 27-39-20 4-29 30" fill="${hullColor}" stroke="${trim}" stroke-width="2"/>` : ''}${large ? `<path d="M119 174 72 108h45l29 65M317 173l31-65h32l-39 70" fill="${sailColor}" opacity=".8"/><path d="M94 109v66m267-65-19 63" stroke="${trim}" stroke-width="2"/>` : ''}<path d="M138 222q83 23 176-4" fill="none" stroke="#7ce2cf" opacity=".35" stroke-width="3"/></g><g fill="#c5dfe8" opacity=".65"><circle cx="91" cy="76" r="2"/><circle cx="350" cy="66" r="2"/><path d="m364 209 3-6 3 6-3 6Z"/></g></svg>`;
}

function renderStats(ship, current, preview, e) {
  return `<div class="airship-stats" aria-label="Reisewerte des Schiffs">${Object.entries(statNames).map(([key, name]) => {
    const base = Number(ship.stats[key]) || 0;
    const actual = Number(current[key]) || base;
    const next = Number(preview[key]) || base;
    return `<div><span>${statSymbols[key]} ${name}</span><strong>${actual}${next !== actual ? `<span class="airship-stat-preview"> → ${next}</span>` : ''}</strong><small>Basis ${base}${next > base ? ` · +${next - base} Design` : ''}</small></div>`;
  }).join('')}</div><p class="airship-stats-explainer">Tempo verkürzt den Flug, Stabilität bremst Windverzögerungen und Navigation erleichtert das Anlegen.</p>`;
}

function renderDesigns(state, data, ship, owned, mods, e) {
  const inFlight = Boolean(tripFor(data));
  const ownedParts = new Set(data.ownedParts);
  const currentId = owned.modifications[selectedSlot] || null;
  const previewId = mods[selectedSlot] || null;
  const choices = [null, ...data.catalogue.parts.filter(part => part.slot === selectedSlot && ownedParts.has(part.id))];
  return `<div class="airship-design-panel"><div class="airship-design-heading"><div><span class="eyebrow">DEIN SCHIFF. DEIN STIL.</span><h3>Gestalte dein Luftschiff</h3></div><span class="airship-count">${data.ownedParts.length} / ${data.catalogue.parts.length} Designs</span></div><div class="airship-slot-tabs" role="tablist" aria-label="Schiffsteil auswählen">${Object.entries(slots).map(([slot, name]) => {
    const part = partFor(data, mods[slot]);
    return `<button class="airship-slot ${slot === selectedSlot ? 'selected' : ''}" role="tab" id="airship-slot-${slot}" aria-selected="${slot === selectedSlot}" aria-controls="airship-design-choices" data-action="airship-slot" data-slot="${slot}">${slotArt(slot)}<span><strong>${name}</strong><small>${e(part?.name || defaultNames[slot])}</small></span></button>`;
  }).join('')}</div><div class="airship-design-choices" id="airship-design-choices" role="tabpanel" aria-labelledby="airship-slot-${selectedSlot}">${choices.map(part => {
    const id = part?.id || '';
    const selected = previewId === (part?.id || null);
    const equipped = currentId === (part?.id || null);
    const color = safeColor(part?.colors?.primary, '#c7c5ac');
    return `<button class="airship-design-choice ${selected ? 'selected' : ''}" data-action="airship-preview-part" data-slot="${selectedSlot}" data-part-id="${e(id)}" aria-pressed="${selected}" ${inFlight ? 'disabled' : ''}><span class="airship-design-swatch" style="--part-color:${color}">${slotArt(selectedSlot, color)}</span><span><strong>${e(part?.name || defaultNames[selectedSlot])}</strong><small>${e(part ? bonusText(part.bonuses) : 'Kostenloses Grunddesign')}</small></span><span class="airship-choice-mark">${equipped ? '✓ Montiert' : selected ? 'Vorschau' : 'Ansehen'}</span></button>`;
  }).join('')}</div><div class="airship-design-footer"><p>${inFlight ? 'Nach der Landung kannst du dein Schiff wieder gestalten.' : 'Wähle ein Design für die Vorschau und montiere es anschließend. Deine Designs bleiben dauerhaft erhalten.'}</p><button class="button primary" data-action="airship-equip" data-ship-id="${e(ship.id)}" data-slot="${selectedSlot}" data-part-id="${e(previewId || '')}" ${inFlight || currentId === previewId ? 'disabled' : ''}>${currentId === previewId ? 'Bereits montiert' : `${slots[selectedSlot]} montieren`}</button></div></div>`;
}

function renderHangar(state, data, e, icon) {
  const ship = data.catalogue.ships.find(value => value.id === inspectedShipId) || data.catalogue.ships.find(value => value.id === data.activeShipId) || data.catalogue.ships[0];
  if (!ship) return '<section class="airship-panel"><p>Die Werft wird vorbereitet.</p></section>';
  inspectedShipId = ship.id;
  const owned = ownedShip(data, ship.id);
  const mods = draftFor(ship, owned);
  const currentStats = owned?.stats || shipStats(ship.id, owned?.modifications || {});
  const previewStats = shipStats(ship.id, mods);
  const active = ship.id === data.activeShipId;
  const inFlight = Boolean(tripFor(data));
  return `<section class="airship-panel airship-hangar" id="airship-hangar"><div class="airship-panel-heading"><div><span class="eyebrow">${owned ? 'DEIN HANGAR' : 'AUS DER WERFT VON ZEPHYRIA'}</span><h2>${e(ship.name)}</h2></div><span class="airship-badge ${active ? 'active' : ''}">${active ? '● Aktives Schiff' : owned ? '✓ In deinem Besitz' : `Ab Spielerlevel ${ship.minLevel}`}</span></div>${data.owned.length > 1 ? `<div class="airship-owned-tabs" aria-label="Eigene Schiffe">${data.owned.map(entry => { const model = data.catalogue.ships.find(value => value.id === entry.shipId); return `<button data-action="airship-inspect" data-ship-id="${e(entry.shipId)}" class="${ship.id === entry.shipId ? 'selected' : ''}" aria-pressed="${ship.id === entry.shipId}">${e(model?.name || entry.shipId)}${entry.shipId === data.activeShipId ? '<span>●</span>' : ''}</button>`; }).join('')}</div>` : ''}<div class="airship-hangar-top"><div class="airship-stage-wrap"><div class="airship-stage" data-airship-preview="${e(ship.id)}" role="group" aria-label="${e(ship.name)} in der Schiffsvorschau"><div class="airship-svg-fallback">${shipArt(ship, mods, data, e)}</div><span class="airship-stage-label">${owned ? 'DEIN LUFTSCHIFF' : 'WERFTVORSCHAU'}</span><span class="airship-stage-orbit" aria-hidden="true"></span></div><div class="airship-stage-caption"><span>${icon('spark', '', 15)} ${owned ? 'Deine Designs werden direkt am Schiff sichtbar.' : 'Dein nächstes Kapitel beginnt im Ätherstrom.'}</span><small data-airship-model-hint>Schiffsvorschau</small></div></div><div class="airship-specs"><p class="airship-description">${e(ship.description)}</p>${renderStats(ship, currentStats, previewStats, e)}${owned ? active ? `<div class="airship-current-note">${icon('check', '', 17)} ${inFlight ? 'Dein Schiff ist gerade im Ätherstrom unterwegs.' : 'Mit diesem Schiff trittst du deine nächste Reise an.'}</div>` : `<button class="button primary full" data-action="airship-select" data-ship-id="${e(ship.id)}" ${inFlight ? 'disabled' : ''}>Als aktives Schiff wählen</button>` : `<div class="airship-unowned-note"><strong>${Number(state.user.level) >= ship.minLevel ? 'Bereit für deinen ersten Flug?' : `Dein Schiff wartet ab Level ${ship.minLevel}.`}</strong><p>Verdiene Geld aus Lehrertruhen und kaufe dieses Schiff unten in der Werft.</p><a class="text-button" href="#airship-shipyard">Zur Werft ↓</a></div>`}</div></div>${owned ? renderDesigns(state, data, ship, owned, mods, e) : `<div class="airship-hangar-empty">${slotArt('sails')}<p><strong>Segel, Rumpf und Flagge gestalten.</strong><br>Ab Spielerlevel 5 findest du neue Designs in gesicherten Abenteuerbelohnungen.</p><button class="button outline small" data-action="nav" data-tab="adventures">Abenteuer entdecken ${icon('arrow', '', 15)}</button></div>`}</section>`;
}

function renderTravel(state, data, e, icon) {
  const trip = tripFor(data);
  const docks = data.catalogue.docks;
  const dock = docks.find(value => value.id === data.dockId) || docks[0];
  const activeOwned = ownedShip(data, data.activeShipId);
  const active = data.catalogue.ships.find(value => value.id === data.activeShipId);
  const destinations = docks.filter(value => value.id !== data.dockId);
  if (!destinations.some(value => value.id === destinationId)) destinationId = destinations[0]?.id || null;
  const destination = docks.find(value => value.id === destinationId);
  const duration = active && destination ? journeyDurationMs(activeOwned?.stats || shipStats(active.id, activeOwned?.modifications), data.dockId, destination.id) : 0;
  const from = docks.find(value => value.id === trip?.fromDockId);
  const to = docks.find(value => value.id === trip?.toDockId);
  const seconds = Math.max(1, Math.ceil(duration / 1000));
  return `<section class="airship-panel airship-travel"><div class="airship-panel-heading"><div><span class="eyebrow">DEM LEUCHTEN FOLGEN</span><h2>Auf dem Ätherstrom</h2></div><span class="airship-route-symbol" aria-hidden="true">✧</span></div><p class="airship-travel-intro">Luftschiffe fliegen im schwebenden Ätherstrom. Er verbindet die Häfen vom hohen Norden bis zur südlichen Wüste.</p>${trip ? `<div class="airship-voyage" data-airship-voyage><span class="airship-badge active">● Unterwegs</span><div class="airship-voyage-route"><strong>${e(from?.name || 'Abfahrtshafen')}</strong><span aria-hidden="true">→</span><strong>${e(to?.name || 'Zielhafen')}</strong></div><div class="airship-flight-track" aria-hidden="true"><span data-airship-progress data-started-at="${time(trip.startedAt)}" data-arrives-at="${time(trip.arrivesAt)}"></span></div><p data-airship-arrival="${time(trip.arrivesAt)}" role="timer">Dein Schiff nähert sich dem Ziel.</p><small>Segel, Rumpf und Flagge kannst du nach der Landung wieder wechseln.</small></div>` : `<div class="airship-current-dock"><span>${icon('grid', '', 19)}</span><div><small>DEIN AKTUELLER HAFEN</small><strong>${e(dock?.name || 'Gipfelhafen Nebelheim')}</strong></div><span class="airship-dock-dot" aria-hidden="true"></span></div><div class="airship-destinations" aria-label="Reiseziel wählen">${destinations.map(value => `<button data-action="airship-destination" data-destination-id="${e(value.id)}" class="${destinationId === value.id ? 'selected' : ''}" aria-pressed="${destinationId === value.id}"><span>${value.id === 'wandering-island' ? '◇' : value.id === 'aethkern' ? '☀' : value.id === 'aether-grove' ? '♧' : '✧'}</span><strong>${e(value.name)}</strong><span aria-hidden="true">${destinationId === value.id ? '✓' : '→'}</span></button>`).join('')}</div>${destination ? `<p class="airship-destination-description">${e(destination.description)}</p>` : ''}<div class="airship-departure"><div><small>${active ? `MIT ${e(active.name.toUpperCase())}` : 'DEIN ERSTES SCHIFF WARTET'}</small><strong>${active ? `Flugzeit etwa ${seconds} Sekunden` : 'Kaufe zuerst ein Luftschiff.'}</strong><span>Kostenlose Reise im Ätherstrom</span></div><button class="button primary" data-action="airship-travel" data-destination-id="${e(destinationId || '')}" data-version="${Number(data.version) || 0}" ${!active || !destination ? 'disabled' : ''}>Ablegen ${icon('arrow', '', 17)}</button></div>`}<div class="airship-route-note">${icon('spark', '', 17)}<p>Die wandelnde Insel zieht mit dem Strom. Vom Hafen erreichst du ihre Abenteuer über die Weltkarte.</p><button class="text-button" data-action="nav" data-tab="adventures">Zur Weltkarte ${icon('arrow', '', 14)}</button></div></section>`;
}

function renderShipyard(state, data, e, icon) {
  const level = Number(state.user.level) || 1;
  const balance = Number(state.user.wallet?.total) || 0;
  return `<section class="airship-shipyard" id="airship-shipyard"><div class="airship-section-heading"><div><span class="eyebrow">DIE WERFT VON ZEPHYRIA</span><h2>Finde dein Luftschiff</h2></div><p>Drei Größen. Ein eigener Platz im Himmel.</p></div><div class="airship-shop-grid">${data.catalogue.ships.map((ship, index) => {
    const owned = ownedShip(data, ship.id);
    const locked = level < ship.minLevel;
    const affordable = balance >= ship.price;
    const deficit = Math.max(0, ship.price - balance);
    const disabled = Boolean(owned) || locked || !affordable;
    const label = owned ? '✓ Bereits in deinem Besitz' : locked ? `Ab Spielerlevel ${ship.minLevel}` : !affordable ? `Noch ${money(deficit)} sparen` : 'Luftschiff kaufen';
    return `<article class="airship-shop-card ${owned ? 'owned' : ''} ${locked ? 'locked' : ''}"><div class="airship-shop-top"><span class="airship-badge">${['KLEIN', 'MITTEL', 'GROSS'][index] || 'LUFTSCHIFF'}</span><span class="airship-level">Level ${ship.minLevel}</span></div><button class="airship-shop-art" data-action="airship-inspect" data-ship-id="${e(ship.id)}" aria-label="${e(ship.name)} in der Vorschau ansehen">${shipArt(ship, owned?.modifications, data, e, true)}</button><h3>${e(ship.name)}</h3><p>${e(ship.description)}</p><div class="airship-shop-stats">${Object.entries(statNames).map(([key, name]) => `<span title="${name}">${statSymbols[key]} ${ship.stats[key]}<small>${name}</small></span>`).join('')}</div><div class="airship-price"><span>Einmaliger Kauf</span><strong>${e(money(ship.price))}</strong></div><button class="button ${disabled ? 'outline' : 'primary'} full" data-action="airship-buy" data-ship-id="${e(ship.id)}" ${disabled ? 'disabled' : ''}>${e(label)}${!disabled ? ` ${icon('plus', '', 16)}` : ''}</button>${owned ? `<button class="text-button airship-shop-inspect" data-action="airship-inspect" data-ship-id="${e(ship.id)}">Im Hangar ansehen ${icon('arrow', '', 14)}</button>` : `<small class="airship-purchase-note">Mit Grundsegeln, Rumpf und Flagge.</small>`}</article>`;
  }).join('')}</div></section>`;
}

function renderCatalogue(state, data, e, icon) {
  const has = new Set(data.ownedParts);
  const filtered = data.catalogue.parts.filter(part => catalogueFilter === 'all' || part.slot === catalogueFilter);
  const target = ownedShip(data, inspectedShipId);
  const inFlight = Boolean(tripFor(data));
  return `<section class="airship-parts-section"><div class="airship-section-heading"><div><span class="eyebrow">AUS DEN VÖLKERN AETHERIAS</span><h2>Entwürfe für deinen Himmel</h2></div><span class="airship-count">${has.size} / ${data.catalogue.parts.length} freigeschaltet</span></div><p class="airship-section-intro">Sichere ab Spielerlevel 5 besondere Abenteuerbelohnungen und erhalte passende Schiffsdesigns. Ein freigeschaltetes Design passt auf alle deine Schiffe.</p><div class="airship-catalogue-tabs" aria-label="Schiffsdesigns filtern">${[['all', 'Alle Designs'], ...Object.entries(slots)].map(([id, name]) => `<button class="${catalogueFilter === id ? 'selected' : ''}" data-action="airship-filter" data-filter="${id}" aria-pressed="${catalogueFilter === id}">${name}</button>`).join('')}</div><div class="airship-parts-grid">${filtered.map(part => {
    const owned = has.has(part.id);
    const equipped = target?.modifications?.[part.slot] === part.id;
    const color = safeColor(part.colors?.primary, '#9ccbc6');
    return `<article class="airship-part-card ${owned ? 'owned' : 'locked'}" style="--part-color:${color}"><div class="airship-part-top"><span class="airship-part-art">${slotArt(part.slot, color)}</span><span class="airship-part-status">${owned ? '✓ Freigeschaltet' : '✧ Zu entdecken'}</span></div><span class="airship-part-kind">${e(slots[part.slot])} · ${e(part.origin)}</span><h3>${e(part.name)}</h3><p class="airship-part-bonuses">${e(bonusText(part.bonuses))}</p><p class="airship-part-source">${e(part.source)}${!owned ? '<span>Neue Belohnung ab Spielerlevel 5 sichern</span>' : ''}</p>${owned && target ? `<button class="button outline small full" data-action="airship-preview-part" data-slot="${part.slot}" data-part-id="${e(part.id)}" data-focus-hangar="true" ${inFlight ? 'disabled' : ''}>${equipped ? 'Montiertes Design ansehen' : 'Am Schiff ausprobieren'}</button>` : `<span class="airship-part-footnote">${owned ? 'Für dein erstes Luftschiff bereit' : 'Durch Abenteuer freischalten'}</span>`}</article>`;
  }).join('')}</div><div class="airship-parts-note">${icon('spark', '', 20)}<p>Deine Designs geben Reisewerte und einen eigenen Look. Sichere Funde bleiben dauerhaft in deinem Besitz.</p><button class="text-button" data-action="nav" data-tab="adventures">Auf ins Abenteuer ${icon('arrow', '', 14)}</button></div></section>`;
}

export function renderAirships({ state, e, icon }) {
  latestState = state;
  const data = dataFor(state);
  const balance = Number(state.user.wallet?.total) || 0;
  return `<div class="airships-page"><div class="airship-page-heading"><div><span class="eyebrow">DEIN EIGENER PLATZ IM HIMMEL</span><h1>Leinen los<span class="title-dot">.</span></h1><p>Kaufe dein Luftschiff, gestalte es und folge dem Ätherstrom durch Aetheria.</p></div><div class="airship-wallet"><span class="airship-wallet-symbol" aria-hidden="true">✦</span><div><small>DEIN REISEVERMÖGEN</small><strong>${e(money(balance))}</strong><span>${balance.toLocaleString('de-DE')} Ätherlinge insgesamt</span></div></div></div><div class="airship-currency-note"><span>${icon('gift', '', 17)} Geld findest du zusätzlich in Lehrertruhen. Mit deinem Spielerlevel steigt der Betrag.</span><details><summary>Die Währung von Aetheria</summary><p>10 Ätherlinge = 1 Thal<br>100 Thal = 1 Krona = 1.000 Ätherlinge</p></details></div><div class="airship-main-grid">${renderHangar(state, data, e, icon)}${renderTravel(state, data, e, icon)}</div>${renderShipyard(state, data, e, icon)}${renderCatalogue(state, data, e, icon)}</div>`;
}

export function mountAirships({ state, register, mountAirship3D }) {
  if (typeof document === 'undefined') return;
  const data = dataFor(state);
  for (const host of document.querySelectorAll('[data-airship-preview]')) {
    const ship = data.catalogue.ships.find(value => value.id === host.dataset.airshipPreview);
    if (!ship || !mountAirship3D) continue;
    const mods = draftFor(ship, ownedShip(data, ship.id));
    const view = { ...ship, shipId: ship.id, ship, modifications: { ...mods }, parts: data.catalogue.parts };
    register(host, () => mountAirship3D(host, view, { interactive: true }));
    const hint = host.parentElement?.querySelector('[data-airship-model-hint]');
    if (hint) hint.textContent = host.dataset.renderState === 'ready' ? '3D · Zum Drehen ziehen' : 'Illustration';
  }
  updateAirshipClocks();
}

export function updateAirshipClocks() {
  if (typeof document === 'undefined') return;
  const now = Date.now();
  for (const node of document.querySelectorAll('[data-airship-arrival]')) {
    const left = Math.max(0, Math.ceil((Number(node.dataset.airshipArrival) - now) / 1000));
    node.textContent = left ? `Ankunft in ${left} ${left === 1 ? 'Sekunde' : 'Sekunden'}` : 'Angekommen · Dein Hafen wird aktualisiert.';
  }
  for (const node of document.querySelectorAll('[data-airship-progress]')) {
    const start = Number(node.dataset.startedAt), end = Number(node.dataset.arrivesAt);
    const progress = Math.max(0, Math.min(1, (now - start) / Math.max(1, end - start)));
    node.style.width = `${progress * 100}%`;
  }
}

export function resetAirshipUI() {
  inspectedShipId = null;
  selectedSlot = 'sails';
  catalogueFilter = 'all';
  destinationId = null;
  draft = null;
  latestState = null;
}

export async function handleAirshipAction(button, { api, mutate, render, toast }) {
  const action = button.dataset.action;
  if (!action?.startsWith('airship-')) return false;
  if (action === 'airship-inspect') {
    inspectedShipId = button.dataset.shipId;
    draft = null;
    render();
    document.querySelector('#airship-hangar')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return true;
  }
  if (action === 'airship-slot') {
    if (slots[button.dataset.slot] && selectedSlot !== button.dataset.slot) {
      selectedSlot = button.dataset.slot;
      draft = null;
    }
    render();
    return true;
  }
  if (action === 'airship-filter') {
    if (button.dataset.filter === 'all' || slots[button.dataset.filter]) catalogueFilter = button.dataset.filter;
    render();
    return true;
  }
  if (action === 'airship-destination') {
    destinationId = button.dataset.destinationId;
    render();
    return true;
  }
  if (action === 'airship-preview-part') {
    const data = dataFor(latestState || {});
    const ship = data.catalogue.ships.find(value => value.id === inspectedShipId);
    const owned = ownedShip(data, inspectedShipId);
    const slot = button.dataset.slot;
    const partId = button.dataset.partId || null;
    if (!ship || !owned || !slots[slot] || tripFor(data)) return true;
    if (partId && (!data.ownedParts.includes(partId) || partFor(data, partId)?.slot !== slot)) return true;
    selectedSlot = slot;
    const modifications = draftFor(ship, owned);
    Object.assign(modifications, { sails: null, hull: null, flag: null, ...owned.modifications, [slot]: partId });
    render();
    if (button.dataset.focusHangar) document.querySelector('#airship-hangar')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return true;
  }
  if (action === 'airship-buy') {
    await mutate(async () => {
      await api('/airships/buy', { shipId: button.dataset.shipId });
      inspectedShipId = button.dataset.shipId;
      draft = null;
      toast('Dein Luftschiff wartet im Hangar. Leinen los!');
    });
    return true;
  }
  if (action === 'airship-select') {
    await mutate(async () => { await api('/airships/select', { shipId: button.dataset.shipId }); toast('Dein aktives Luftschiff ist bereit.'); });
    return true;
  }
  if (action === 'airship-equip') {
    await mutate(async () => {
      await api('/airships/equip', { shipId: button.dataset.shipId, slot: button.dataset.slot, partId: button.dataset.partId || null });
      draft = null;
      toast('Dein Schiffsdesign wurde montiert.');
    });
    return true;
  }
  if (action === 'airship-travel') {
    await mutate(async () => {
      await api('/airships/travel', { destinationId: button.dataset.destinationId || button.dataset.destination, version: Number(button.dataset.version) });
      draft = null;
      toast('Leinen los! Dein Schiff folgt dem Ätherstrom.');
    });
    return true;
  }
  return false;
}
