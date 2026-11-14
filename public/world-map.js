import { renderMapAtmosphere, renderMapMotionControl, toggleMapAtmosphere, resetMapAtmosphere, mountMapAtmosphere } from './map-atmosphere.js';
import { renderPlayerAirship, mountPlayerAirship } from './airship-map.js';

// The painted map stays the source of geography. Markers only select a place;
// starting or continuing an adventure still uses the existing adventure screens.
export const WORLD_MAP_LOCATIONS = Object.freeze([
  { id: 'zephyrath', name: 'Zephyrath', subtitle: 'Turm der Prüfungen', x: 92, y: 35.5, mode: 'tower', symbol: '♜',
    description: 'Der alte Turm erhebt sich an der östlichen Steilküste. Seine Äthersymbole bewahren das Wissen vergangener Zeiten. Hier wartet dein Aufstieg durch zehn Prüfungen.' },
  { id: 'crystal-mines', name: 'Kristallminen', subtitle: 'Runengolem · Gruppenabenteuer', x: 65.5, y: 23.5, mode: 'golem', symbol: '⬡',
    description: 'Unter dem höchsten Berg verlaufen uralte Stollen mit leuchtenden Ätherkristallen. Die Wolkenhüter bewachen ihre Geheimnisse. Vor der alten Anlage stellt sich der Runengolem eurer Gruppe entgegen.' },
  { id: 'wandering-island', name: 'Wandelnde Insel', subtitle: 'Solo-Abenteuer im Ätherstrom', x: 61, y: 46, mode: 'island', symbol: '✧',
    description: 'Diese bewachsene Insel treibt mit kleinen Felsen im Ätherstrom. Ein Luftschiff bringt dich zu ihren Ruinen, Weggabelungen und rätselhaften Begegnungen.' },
  { id: 'zephyria', name: 'Zephyria', subtitle: 'Stadt der Ätheringenieure', x: 29.5, y: 19, mode: null, symbol: '⚙',
    description: 'Zwischen den nördlichen Gipfeln liegt die Hauptstadt der Ätheringenieure. Stein und Metall, große Zahnräder, Dampfrohre und Ätherkristalle prägen ihre Gebäude.' },
  { id: 'nebelheim', name: 'Nebelheim', subtitle: 'Höhen der Wolkenhüter', x: 54, y: 11, mode: null, symbol: '☁',
    description: 'Nebelheim liegt am höchsten Berg, verborgen in dichten Wolken und Nebelschwaden. Die Wolkenhüter schützen die Zugänge zum Äther. An der Bergspitze beginnt der Ätherstrom.' },
  { id: 'sky-rest', name: 'Himmelsruhe', subtitle: 'Bewegliche Luftschiffflotte', x: 48, y: 29.5, mode: null, symbol: '◇',
    description: 'Die Heimat der Luftnomaden besteht aus kunstvollen Luftschiffen mit bunten Segeln. Ihre Flotte bewegt sich entlang des Ätherstroms: Nur innerhalb dieses schwebenden Lichtbandes können Luftschiffe fliegen.' },
  { id: 'silverwind', name: 'Silberwind', subtitle: 'Baumkronenstadt der Ätherelfen', x: 34, y: 42, mode: null, symbol: '♧',
    description: 'In den Wäldern entlang des Ätherstroms verbergen die Ätherelfen ihre Stadt hoch in den Baumkronen. Silbernes Holz, funkelnde Kristalle und leuchtende Blumen verbinden die Häuser mit dem Wald.' },
  { id: 'lysara', name: 'Lysara', subtitle: 'Handelsstadt der grünen Ebene', x: 34, y: 52, mode: null, symbol: '⌂',
    description: 'Zwischen Bergen und Sümpfen liegt Lysara inmitten grüner Wiesen und sanfter Hügel. Am Marktplatz begegnen sich Händler und Reisende verschiedener Völker. Bäche und Gärten durchziehen die Stadt.' },
  { id: 'lyrianas-light', name: 'Lyrianas Licht', subtitle: 'Verlassener Leuchtturm der Westküste', x: 8, y: 56.5, mode: null, symbol: '✦',
    description: 'Der zerfallene Leuchtturm an der Westküste wurde einst von den Wolkenhütern errichtet. Seine Ätherkristalle wiesen Reisenden im Strom den Weg. Heute erinnern Ruinen an sein früheres Leuchten.' },
  { id: 'aether-grove', name: 'Ätherhain', subtitle: 'Heimat der Ätherdruiden', x: 45, y: 71, mode: null, symbol: '❧',
    description: 'Weiter südlich reicht der Ätherstrom über dichte Nebelwälder. Hier liegt Ätherhain, die spirituelle Hauptstadt der Druiden. Holz, Moos und Stein formen einen Ort der Ruhe und Naturverbundenheit.' },
  { id: 'aethkern', name: 'Äthkern', subtitle: 'Fürstentümer der südlichen Wüste', x: 52, y: 90, mode: null, symbol: '◈',
    description: 'Südlich der Nebelwälder liegt die Wüste der Ätherdämmerer. Ihre Fürstentümer teilen sich die Hauptstadt Äthkern und erstrecken sich von dort in die Wüste. Dunkle Metalltürme und Äthermaschinen prägen die Stadt. Bis hierher reicht der Ätherstrom.' },
].map(place => Object.freeze(place)));

let selectedLocation = null;
let zoom = 100;
let position = { left: null, top: 0 };
let pendingCenter = null;
let pendingFocus = null;
let mounted = null;
const MIN_ZOOM = 100, MAX_ZOOM = 200, ZOOM_STEP = 25;

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function progress(place, state) {
  const data = state.adventure || {};
  if (place.mode === 'tower') {
    const run = data.tower?.state;
    if (run && ['active', 'choice'].includes(run.status)) return { active: true, label: `Etage ${run.floor || 1} von 10`, action: 'Aufstieg fortsetzen' };
    if (run?.status === 'completed') return { active: false, label: 'Turm bezwungen', action: 'Den Turm besuchen' };
    return { active: false, label: 'Solo · 10 Etagen', action: 'Zum Turm der Prüfungen' };
  }
  if (place.mode === 'island') {
    const run = data.island?.state;
    if (run?.status === 'active') return { active: true, label: `Reise läuft · ${run.cleared || 0} / 7 Stationen`, action: 'Inselreise fortsetzen' };
    if (run?.status === 'completed') return { active: false, label: 'Insel bezwungen', action: 'Die Insel besuchen' };
    return { active: false, label: 'Solo · 7 Stationen', action: 'Zur wandelnden Insel' };
  }
  if (place.mode === 'golem') {
    const raids = data.raids || [];
    const joined = raids.find(raid => ['lobby', 'active'].includes(raid.status) && raid.state?.members?.some(member => member.id === state.user?.id));
    if (joined) return { active: true, label: joined.status === 'active' ? `Gruppenkampf · Runde ${joined.state.round || 1}` : `Deine Gruppe · ${joined.state.members.length} / 5`, action: joined.status === 'active' ? 'Gruppenkampf fortsetzen' : 'Zu deiner Gruppe' };
    const open = raids.filter(raid => raid.status === 'lobby').length;
    return { active: false, label: open ? `${open} offene ${open === 1 ? 'Gruppe' : 'Gruppen'} · 3–5 Schüler` : 'Gruppe · 3–5 Schüler', action: 'Zum Runengolem' };
  }
  return { active: false, label: 'Ort in Aetheria', action: null };
}

function detailPanel(state, e, icon) {
  const place = WORLD_MAP_LOCATIONS.find(location => location.id === selectedLocation);
  if (!place) return `<section class="world-map-detail world-map-detail-intro" aria-labelledby="world-map-detail-title"><span class="world-map-place-art" aria-hidden="true">✧</span><div><span class="eyebrow">DEIN REISEZIEL WARTET</span><h3 id="world-map-detail-title" tabindex="-1">Wohin führt dein nächstes Abenteuer?</h3><p>Wähle einen leuchtenden Ort auf der Karte oder einen Eintrag in der Ortsliste. Bei Turm, Insel und Kristallminen kannst du dein Abenteuer öffnen oder fortsetzen.</p></div></section>`;
  const info = progress(place, state);
  const shipyard = place.id === 'zephyria' ? `<button class="button primary world-map-open" data-action="nav" data-tab="airships">Zur Luftschiffwerft ${icon('arrow', '', 17)}</button>` : '';
  const dock = state.airships?.catalogue?.docks?.find(item => item.id === place.id);
  const travel = dock && state.airships?.activeShipId ? `<button class="button outline world-map-open" data-action="airship-travel" data-destination="${dock.id}" data-version="${state.airships.version}" ${state.airships.journey || state.airships.dockId === dock.id ? 'disabled' : ''}>${state.airships.dockId === dock.id && !state.airships.journey ? 'Dein Luftschiff liegt hier' : state.airships.journey ? 'Dein Luftschiff ist unterwegs' : `Zum Anleger reisen`} ${icon('arrow', '', 17)}</button>` : '';
  return `<section class="world-map-detail ${place.mode ? 'is-adventure' : ''}" data-map-detail="${place.id}" aria-labelledby="world-map-detail-title"><span class="world-map-place-art" aria-hidden="true">${place.symbol}</span><div class="world-map-detail-copy"><span class="eyebrow">${e(place.subtitle)}</span><h3 id="world-map-detail-title" tabindex="-1">${e(place.name)}</h3><p>${e(place.description)}</p><div class="world-map-detail-meta"><span class="world-map-status ${info.active ? 'is-active' : ''}">${e(info.label)}</span>${place.mode ? '<span>Begleiter · Outfits · Trophäen</span>' : '<span>Entdecke die Geschichte dieses Ortes.</span>'}</div></div>${place.mode ? `<button class="button primary world-map-open" data-action="adventure-mode" data-mode="${place.mode}">${e(info.action)} ${icon('arrow', '', 17)}</button>` : ''}${shipyard}${travel}</section>`;
}

export function renderWorldMap({ state = {}, e = escapeHTML, icon = () => '' } = {}) {
  const placeButtons = WORLD_MAP_LOCATIONS.map(place => {
    const info = progress(place, state);
    const selected = place.id === selectedLocation;
    const label = `${place.name}: ${place.subtitle}${info.active ? `, ${info.label}` : ''}`;
    return `<button type="button" class="world-map-pin ${place.mode ? 'is-adventure' : 'is-place'} ${info.active ? 'is-active' : ''} ${selected ? 'is-selected' : ''} ${['wandering-island', 'sky-rest'].includes(place.id) ? 'is-travelling' : ''}" style="left:${place.x}%;top:${place.y}%" data-action="adventure-map-select" data-location="${place.id}" aria-label="${e(label)}" aria-pressed="${selected}" aria-controls="world-map-detail-title"><span class="world-map-pin-core" aria-hidden="true">${place.symbol}</span><span class="world-map-pin-label" aria-hidden="true">${e(place.name)}</span>${info.active ? '<span class="world-map-running" aria-hidden="true"></span>' : ''}</button>`;
  }).join('');
  return `<section class="world-map" aria-labelledby="world-map-title"><div class="world-map-heading"><div><span class="eyebrow">VOM HÖCHSTEN GIPFEL BIS ZUR WÜSTE</span><h2 id="world-map-title">Entdecke Aetheria</h2></div><div class="world-map-controls" role="group" aria-label="Karte vergrößern und verkleinern"><button type="button" data-action="adventure-map-zoom-out" aria-label="Karte verkleinern" ${zoom === MIN_ZOOM ? 'disabled' : ''}>−</button><output aria-label="Vergrößerung">${zoom}%</output><button type="button" data-action="adventure-map-zoom-in" aria-label="Karte vergrößern" ${zoom === MAX_ZOOM ? 'disabled' : ''}>+</button><button type="button" class="world-map-reset" data-action="adventure-map-reset">Ansicht zurücksetzen</button>${renderMapMotionControl()}</div></div><p class="world-map-lore">Der Ätherstrom schimmert wie ein langes Polarlicht über dem Land. Nur in seinem Lichtband fliegen Luftschiffe und treiben die schwebenden Inseln.</p><p class="world-map-help" id="world-map-help">${icon('hero', '', 15)} Einen Ort antippen · Zum Verschieben wischen oder ziehen · Mit + und − vergrößern</p><div class="world-map-viewport" tabindex="0" role="region" aria-label="Verschiebbare Weltkarte von Aetheria" aria-describedby="world-map-help"><div class="world-map-stage" data-motion="paused" style="width:max(${zoom}%,${Math.round(880 * zoom / 100)}px)"><img class="world-map-image" src="/assets/aetheria-map.png" width="1536" height="1024" alt="Aetheria: nördliche Berge, Wälder und Ebenen, südliche Nebelwälder und Wüste. Der schwebende Ätherstrom verbindet den höchsten Gipfel mit der Wüste. Alle Orte sind zusätzlich in der Ortsliste erreichbar." draggable="false" decoding="async"><p class="world-map-image-error" hidden>Das Kartenbild konnte nicht geladen werden. Wähle dein Ziel über die Ortsliste darunter.</p>${renderMapAtmosphere()}${renderPlayerAirship(state, e)}${placeButtons}</div></div><div class="world-map-legend" aria-label="Kartenlegende"><span><i class="legend-adventure"></i> Abenteuer</span><span><i class="legend-place"></i> Orte und Städte</span><span><i class="legend-running"></i> Dein Abenteuer läuft</span></div>${detailPanel(state, e, icon)}<details class="world-map-directory" open><summary>Alle Orte und Abenteuer <span>${WORLD_MAP_LOCATIONS.length} Ziele</span></summary><div class="world-map-place-list">${WORLD_MAP_LOCATIONS.map(place => {
    const info = progress(place, state);
    return `<button type="button" class="world-map-place ${place.mode ? 'is-adventure' : ''} ${place.id === selectedLocation ? 'is-selected' : ''}" data-action="adventure-map-select" data-location="${place.id}" aria-pressed="${place.id === selectedLocation}" aria-controls="world-map-detail-title"><span class="world-map-list-symbol" aria-hidden="true">${place.symbol}</span><span class="world-map-list-copy"><strong>${e(place.name)}</strong><small>${e(place.mode ? info.label : place.subtitle)}</small></span>${info.active ? '<span class="world-map-list-active" aria-label="Dein Abenteuer läuft">●</span>' : ''}</button>`;
  }).join('')}</div></details></section>`;
}

export function handleWorldMapAction(button, { render } = {}) {
  const action = button?.dataset?.action;
  if (action === 'adventure-map-motion') {
    toggleMapAtmosphere();
    pendingFocus = action;
  } else if (action === 'adventure-map-select') {
    const id = button.dataset.location;
    if (!WORLD_MAP_LOCATIONS.some(place => place.id === id)) return false;
    selectedLocation = id;
    pendingFocus = 'detail';
  } else if (['adventure-map-zoom-in', 'adventure-map-zoom-out', 'adventure-map-reset'].includes(action)) {
    const viewport = typeof document !== 'undefined' ? document.querySelector('.world-map-viewport') : null;
    if (action === 'adventure-map-reset') {
      zoom = MIN_ZOOM;
      position = { left: null, top: 0 };
      pendingCenter = { x: .5, y: 0 };
    } else {
      if (viewport) pendingCenter = { x: (viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth, y: (viewport.scrollTop + viewport.clientHeight / 2) / viewport.scrollHeight };
      zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + (action.endsWith('zoom-in') ? ZOOM_STEP : -ZOOM_STEP)));
    }
    pendingFocus = action;
  } else return false;
  render?.();
  return true;
}

export function disposeWorldMap() {
  if (mounted) mounted();
  mounted = null;
}

export function resetWorldMapState() {
  disposeWorldMap();
  resetMapAtmosphere();
  selectedLocation = null;
  zoom = MIN_ZOOM;
  position = { left: null, top: 0 };
  pendingCenter = null;
  pendingFocus = null;
}

export function mountWorldMap({ state = {} } = {}) {
  disposeWorldMap();
  if (typeof document === 'undefined') return () => {};
  const viewport = document.querySelector('.world-map-viewport');
  if (!viewport) return () => {};
  if (pendingCenter) {
    viewport.scrollLeft = pendingCenter.x * viewport.scrollWidth - viewport.clientWidth / 2;
    viewport.scrollTop = pendingCenter.y * viewport.scrollHeight - viewport.clientHeight / 2;
    pendingCenter = null;
  } else {
    viewport.scrollLeft = position.left ?? (viewport.scrollWidth - viewport.clientWidth) / 2;
    viewport.scrollTop = position.top;
  }
  const savePosition = () => { position = { left: viewport.scrollLeft, top: viewport.scrollTop }; };
  savePosition();
  const image = viewport.querySelector('.world-map-image');
  const imageError = () => {
    viewport.querySelector('.world-map-image-error').hidden = false;
    viewport.classList.add('has-image-error');
  };
  image?.addEventListener('error', imageError);
  if (image?.complete && !image.naturalWidth) imageError();
  const disposeAtmosphere = mountMapAtmosphere(viewport);
  const disposeShip = mountPlayerAirship(viewport, state.airships);
  let drag = null;
  const down = event => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('button')) return;
    drag = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, pointerId: event.pointerId };
    viewport.setPointerCapture?.(event.pointerId);
  };
  const move = event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) > 3) viewport.classList.add('is-dragging');
    viewport.scrollLeft = drag.left - (event.clientX - drag.x);
    viewport.scrollTop = drag.top - (event.clientY - drag.y);
    event.preventDefault();
  };
  const up = event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (viewport.hasPointerCapture?.(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    drag = null;
    viewport.classList.remove('is-dragging');
    savePosition();
  };
  viewport.addEventListener('scroll', savePosition, { passive: true });
  viewport.addEventListener('pointerdown', down);
  viewport.addEventListener('pointermove', move);
  viewport.addEventListener('pointerup', up);
  viewport.addEventListener('pointercancel', up);
  if (pendingFocus === 'detail') {
    const heading = document.querySelector('#world-map-detail-title');
    heading?.focus({ preventScroll: true });
    heading?.closest('.world-map-detail')?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  } else if (pendingFocus) {
    const requested = document.querySelector(`[data-action="${pendingFocus}"]`);
    const control = requested?.disabled ? document.querySelector('.world-map-controls button:not(:disabled)') : requested;
    control?.focus({ preventScroll: true });
  }
  pendingFocus = null;
  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    disposeShip();
    disposeAtmosphere();
    savePosition();
    viewport.removeEventListener('scroll', savePosition);
    viewport.removeEventListener('pointerdown', down);
    viewport.removeEventListener('pointermove', move);
    viewport.removeEventListener('pointerup', up);
    viewport.removeEventListener('pointercancel', up);
    image?.removeEventListener('error', imageError);
    if (drag && viewport.hasPointerCapture?.(drag.pointerId)) viewport.releasePointerCapture(drag.pointerId);
    if (mounted === cleanup) mounted = null;
  };
  mounted = cleanup;
  return cleanup;
}
