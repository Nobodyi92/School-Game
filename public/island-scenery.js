const stopKinds = { puzzle: 'Rätselinsel', combat: 'Wächterinsel', event: 'Insel der Begegnungen', camp: 'Windlager', treasure: 'Verlorene Ruinen', guardian: 'Herz der Insel' };
const positions = [[84, 202], [242, 132], [402, 214], [560, 136], [720, 216], [878, 133], [1036, 200]];
const clamp = value => Math.max(0, Math.min(7, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0));
const routeFeatures = new Map([
  ['Kristallhöhle', 'cave'], ['Dornenpfad', 'thorns'],
  ['Warmes Quellenlager', 'spring'], ['Windgeschützter Hain', 'grove'],
  ['Vergessener Leuchtturm', 'lighthouse'], ['Muschelbucht', 'bay'],
  ['Leuchtstein-Ruinen', 'ruins'], ['Das Echo-Tor', 'gate'],
  ['Wandernde Windbrücke', 'bridge'], ['Der flüsternde Wald', 'grove'],
  ['Das Herz der Insel', 'heart'],
]);
const eventFeatures = new Set(['bridge', 'trader', 'scout']);
const featureFor = (title, kind) => routeFeatures.get(title) || (kind === 'guardian' ? 'heart' : null);

// Scene position follows the secured history. Choosing another path never invents progress.
export function islandSceneFor(run = {}) {
  run = run || {};
  const cleared = clamp(run.cleared), history = run.history || [];
  const activeEncounter = run.phase !== 'route' && run.phase !== 'boon' && run.status === 'active';
  const previous = history[Math.max(0, cleared - 1)];
  const pathStep = Number(/^path-(\d+)-\d+$/.exec(run.current?.id || '')?.[1]);
  const unfinished = pathStep ? pathStep > cleared : Boolean(run.current && (run.current.kind !== previous?.kind || run.current.title !== previous?.title));
  const lostAtEncounter = run.status === 'lost' && unfinished;
  const station = run.status === 'completed' ? 7 : activeEncounter || lostAtEncounter ? Math.min(7, cleared + 1) : Math.max(1, cleared);
  const current = activeEncounter || lostAtEncounter || run.phase === 'boon' ? run.current : previous;
  const encounterKind = current?.kind || 'route';
  const title = run.status === 'completed' ? 'Das Herz der Insel' : run.encounter?.title || current?.title || 'Der Anleger im Ätherstrom';
  let subtitle = run.status === 'active' && run.phase === 'route'
    ? cleared ? 'Dein nächster Inselpfad liegt im schimmernden Strom.' : 'Dein Reise-Luftschiff erreicht die ersten schwebenden Inseln.'
    : run.phase === 'boon' ? 'Ein Windsegen begleitet dich zur nächsten Insel.'
      : run.status === 'completed' ? 'Alle sieben Inselstationen liegen hinter dir.'
        : run.status === 'banked' ? 'Deine Funde reisen sicher mit dir nach Hause.'
          : run.status !== 'active' ? 'Der Ätherstrom trägt dich zurück zum Luftschiff.'
            : `${stopKinds[encounterKind] || 'Schwebende Insel'} · Station ${station} von 7`;
  const feature = encounterKind === 'event' && eventFeatures.has(run.encounter?.id) ? run.encounter.id : featureFor(current?.title, encounterKind);
  return { kind: 'island', station, phase: run.phase || 'route', encounterKind, title, subtitle, feature };
}

function trees() {
  return '<path d="M-27-8v-31M14-8v-43" stroke="#655d4d" stroke-width="5"/><path d="m-44-26 17-29 17 29Zm38-6 20-40 20 40Z" fill="#2d756b"/><path d="m-39-38 12-23 12 23Zm40-8 13-29 13 29Z" fill="#72b89b"/>';
}
function crystals() {
  return '<path d="m-22-7-9-24 10-20 10 24Zm20 1-11-35 13-27 14 31Zm25-1-8-23 10-15 9 22Z" fill="#7accca" stroke="#c1f6e7" stroke-width="1.5"/><path d="M2-67v59M-21-50l1 41m45-35-1 36" stroke="#d3fcf1" opacity=".6"/>';
}
function landmark(kind, feature = null) {
  if (feature === 'cave') return `<g class="island-landmark-cave"><path d="m-50-5 8-38 29-25 35 8 29 55Z" fill="#77929c" stroke="#b5cbc4" stroke-width="2"/><path d="M-29-6v-24q2-24 27-25 26 4 29 25v24Z" fill="#183145"/><path d="m-42-5 8-22 8 22m29-1 7-28 11 28m6-2 7-18 8 19" fill="#7bd5d1" stroke="#b9eddf" stroke-width="1.5"/><path d="M-12-43 0-50l13 7" fill="none" stroke="#9dbabc" stroke-width="3"/></g>`;
  if (feature === 'lighthouse') return '<g class="island-landmark-lighthouse"><path d="m-22-7 6-65h29l8 65Z" fill="#a4b8ae" stroke="#d8d9b6" stroke-width="2"/><path d="M-19-28h37M-17-48h32" stroke="#688a93" stroke-width="8"/><path d="M-23-72h47v-17h-47Z" fill="#b6d8cd" stroke="#e5d6a0" stroke-width="2"/><path d="m-28-90 28-13 28 13Z" fill="#637d8b"/><path d="M0-86v10" stroke="#f1db91" stroke-width="4"/><path d="m-24-79-29-10v21Zm48 0 29-10v21Z" fill="#e8d08b" opacity=".3"/><path d="M-4-7v-15h10v15" fill="#3c5e6c"/></g>';
  if (feature === 'spring') return `<g class="island-landmark-spring"><g transform="translate(-21 -3) scale(.7)">${trees()}</g><ellipse cx="7" cy="-8" rx="35" ry="13" fill="#b4c8b3" stroke="#d0d7b9" stroke-width="2"/><ellipse cx="7" cy="-10" rx="27" ry="8" fill="#78c7c5"/><path d="M-5-21q-11-10 0-20m12 15q-11-11 1-25m12 31q-9-10 0-19" fill="none" stroke="#d3efdf" stroke-width="2" stroke-linecap="round" opacity=".75"/><path d="m-39-8 7-8 6 10m58 2 6-12 9 14" fill="#9fb69f"/></g>`;
  if (feature === 'thorns') return '<g class="island-landmark-thorns"><path d="M-41-7q-6-26 2-44m15 45q-4-18-16-31m66 30q14-28 7-52m-16 51q2-22 17-34" stroke="#5f6e57" stroke-width="5" fill="none"/><path d="m-40-45-13-5 11 14m4 5 15-6-13 16m-1 5-14-2 14 13m72-42 15-7-14 18m1 2-15-5 12 15m-4 5 16-3-20 15" fill="#a6be80" stroke="#a9c49b" stroke-width="1.5"/><path d="M-21-5Q0-17 20-5" fill="none" stroke="#d4c397" stroke-width="6"/></g>';
  if (feature === 'grove' || feature === 'scout') return `<g class="island-landmark-grove">${trees()}<g transform="translate(32 1) scale(.7)">${trees()}</g>${feature === 'scout' ? '<path d="M-18-7v-10h20v10Z" fill="#d6c79c"/><path d="m-16-14 6-4 7 5" fill="none" stroke="#68887d"/>' : '<path d="m-7-6 9-8 15 8" fill="#c8ce9b"/>'}</g>`;
  if (feature === 'bay') return '<g class="island-landmark-bay"><ellipse cx="-3" cy="-7" rx="41" ry="13" fill="#d7cf9c"/><path d="M-36-5Q-7-29 23-6" fill="#68baba" stroke="#b1e0d1" stroke-width="2"/><path d="M-24-9q19-8 36 0" fill="none" stroke="#d3eee0" stroke-width="2"/><path d="M19-9v-17h24v17Z" fill="#9c794c" stroke="#e8cb85" stroke-width="2"/><path d="M20-19h22m-12-7v17" stroke="#e8cb85" stroke-width="2"/><path d="m-26-26 4-6 6 6-4 6Zm29-7 5-5 6 5-5 6Z" fill="#dfe4bf"/></g>';
  if (feature === 'gate') return '<g class="island-landmark-gate"><path d="M-37-8v-52h13v52M24-8v-52h13v52M-39-60h78v-10h-78Z" fill="#8aa49f" stroke="#c9d8bc" stroke-width="2"/><ellipse cx="0" cy="-35" rx="18" ry="29" fill="#89c5c8" fill-opacity=".28" stroke="#aee8d8" stroke-width="2"/><path d="m0-55 6 7-6 7-6-7Zm0 25 4 5-4 5-4-5Z" fill="#e8d8a0"/></g>';
  if (kind === 'puzzle') return `<path d="M-39-10h76M-35-11v-37h12v35m46 0v-37h12v37" fill="#839798" stroke="#c8d5b3" stroke-width="2"/>${crystals()}`;
  if (kind === 'treasure') return '<path d="M-34-9v-37h14v37M22-8v-59h13v58M-38-44h24m5-15h45" fill="#91a6a0" stroke="#c9d2b2" stroke-width="3"/><path d="M-9-7v-19h29v19Z" fill="#9c794c" stroke="#ebcc7d" stroke-width="2"/><path d="M-8-19h27M4-25v17" stroke="#ebcc7d" stroke-width="2"/>';
  if (kind === 'camp') return `<g transform="translate(-16 0)">${trees()}</g><path d="m0-7 23-35 26 35Z" fill="#e2c98b" stroke="#f8dfaa" stroke-width="2"/><path d="m17-8 6-17 10 17" fill="#395e62"/><path d="m-3-2 5-9 6 10Z" fill="#ffc37e"/>`;
  if (kind === 'guardian') return '<path d="M-39-7v-57h14v56M26-7v-57h14v57M-41-64h83l-12-10h-60Z" fill="#7d94a0" stroke="#bed4d3" stroke-width="2"/><path d="m-13-13 14-32 15 32Z" fill="#78cdc7"/><path d="m0-61 7 9-7 9-7-9Z" fill="#f1dc9a"/><circle cx="1" cy="-30" r="26" fill="none" stroke="#8edfd7" stroke-width="2" opacity=".55"/>';
  if (kind === 'event' && feature === 'trader') return '<path d="M-34-8v-29h67v29" fill="#755c4f"/><path d="m-43-37 11-23h61l12 23Z" fill="#cebb87" stroke="#eadba6" stroke-width="2"/><path d="M-30-36v28M30-36v28" stroke="#cfb67e" stroke-width="3"/><circle cx="-10" cy="-19" r="5" fill="#8ed8c4"/><path d="m6-24 7 13 7-13Z" fill="#b2a4e3"/>';
  if (kind === 'event') return '<path d="M-43-7q7-49 42-49T43-7" fill="none" stroke="#c4cab2" stroke-width="9"/><path d="M-45-13q46 15 91 0" fill="none" stroke="#e3d5a8" stroke-width="4"/><path d="M-32-12v-17M-18-9v-34M1-8v-40M20-10v-32M33-13v-16" stroke="#bacab9" stroke-width="2"/>';
  if (kind === 'combat') return `<g transform="translate(-22 0) scale(.65)">${trees()}</g><path d="m7-7-12-33 18-23 21 23-12 33Z" fill="#829fa7" stroke="#c1d8d1" stroke-width="2"/><path d="m8-40 5-9 6 9-5 9Z" fill="#cfb2ed"/><path d="M-26-7h60" stroke="#d9ca92" stroke-width="3"/>`;
  return '<path d="M-31-6h61M-24-8l6-14 12 14M9-7l9-19 13 19" fill="#729e96" stroke="#a5c9b2" stroke-width="2"/>';
}

function islandShape(kind, variant = 0, feature = null) {
  const green = ['#75b096', '#7cae9d', '#8ab29b', '#73a79e', '#82b498', '#7aaca1', '#8db7a7'][variant % 7];
  return `<path d="m-61-6 17 33 42 31 44-28 20-39-61-20Z" fill="#526b7b"/><path d="m-61-6 59 64-9-61Z" fill="#3c566c"/><path d="m-2 58 23-56 41-11-20 39Z" fill="#82939a"/><path d="m-64-10 26-24 54-5 49 28-29 24-70 2Z" fill="${green}" stroke="#acd3b8" stroke-width="1.4"/><path d="m-39-8 24-12 37-2 21 13-21 13-37-1Z" fill="#b1c694" opacity=".65"/><path d="m-15 24 4 14 7-17m22-1-5 18 11-12" stroke="#a4d5c3" stroke-width="2" fill="none" opacity=".8"/>${landmark(kind, feature)}`;
}

function shipGlyph() {
  return '<path d="M-21 9h43l-8 10h-26Z" fill="#9b7657" stroke="#efd491" stroke-width="1.5"/><path d="M-1-19v29M-5-15-20 4H-5Zm8 0V4h17Z" fill="#e5e7bc" stroke="#8fd8ce" stroke-width="1.5"/><path d="M0-20h14l-5 6H0" fill="#bea8e4"/>';
}

function routeIndex(run) {
  if (run?.status === 'completed') return 6;
  if (run?.status === 'lost') return islandSceneFor(run).station - 1;
  if (run?.phase === 'boon' || run?.status === 'banked') return Math.max(0, clamp(run.cleared) - 1);
  return Math.min(6, clamp(run?.cleared));
}

export function renderArchipelago(run, e, { preview = false } = {}) {
  const history = run?.history || [], currentIndex = routeIndex(run);
  const isActive = run?.status === 'active';
  const scene = islandSceneFor(run);
  const stops = positions.map(([x, y], index) => {
    const past = history[index];
    const current = Boolean(run) && index === currentIndex && (isActive || ['completed', 'banked', 'lost'].includes(run.status));
    const knownCurrent = current && run.current && (run.phase !== 'route' || run.status !== 'active');
    const kind = preview ? ['camp', 'puzzle', 'combat', 'event', 'treasure', 'camp', 'guardian'][index] : past?.kind || (knownCurrent ? run.current.kind : 'unknown');
    const state = past ? 'visited' : current ? 'current' : 'future';
    const title = past?.title || (knownCurrent ? run.current.title : current ? 'Dein nächstes Inselziel' : 'Noch im Nebel');
    const feature = kind === 'unknown' ? null : knownCurrent && !past ? scene.feature : featureFor(title, kind);
    return { x, y, index, kind, state, current, title, feature, label: past ? 'Erkundet' : current ? run?.phase === 'route' ? 'Nächstes Ziel' : 'Du bist hier' : 'Im Nebel' };
  });
  const travel = isActive && run.phase === 'route' && Number(run.cleared) > 0;
  const markerPoint = positions[currentIndex];
  const previousPoint = positions[Math.max(0, currentIndex - 1)];
  const shipPoint = travel ? [previousPoint[0] * .4 + markerPoint[0] * .6, Math.max(48, previousPoint[1] * .4 + markerPoint[1] * .6 - 42)] : [markerPoint[0] + 6, Math.max(48, markerPoint[1] - 103)];
  return `<section class="island-archipelago ${preview ? 'is-preview' : ''}" aria-label="Deine Route über sieben schwebende Inseln"><div class="island-archipelago-heading"><div><span class="eyebrow">SIEBEN INSELN IM ÄTHERSTROM</span><h3>${preview ? 'Ein neuer Horizont nach jeder Landung' : e(scene.subtitle)}</h3></div>${!preview ? `<span class="island-journey-counter">${clamp(run.cleared)} / 7 erkundet</span>` : ''}</div><div class="island-archipelago-viewport" tabindex="0" role="region" aria-label="Verschiebbare Inselroute" data-island-horizon data-island-journey-current="${currentIndex}"><div class="island-archipelago-canvas"><svg class="island-archipelago-art" viewBox="0 0 1120 340" aria-hidden="true"><defs><linearGradient id="island-route-stream" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7ce2cf" stop-opacity=".02"/><stop offset=".4" stop-color="#85cdd8" stop-opacity=".35"/><stop offset=".7" stop-color="#baadea" stop-opacity=".28"/><stop offset="1" stop-color="#7ce2cf" stop-opacity=".05"/></linearGradient></defs><g class="island-route-clouds" fill="#9acbd4" opacity=".08"><ellipse cx="160" cy="60" rx="125" ry="17"/><ellipse cx="570" cy="292" rx="168" ry="19"/><ellipse cx="990" cy="68" rx="141" ry="16"/></g><path class="island-route-stream" d="M-30 230C62 90 165 340 280 182S435 85 558 196S700 292 833 175S996 115 1152 210" fill="none" stroke="url(#island-route-stream)" stroke-width="55"/><path class="island-route-thread" d="M84 202Q167 61 242 132T402 214T560 136T720 216T878 133T1036 200" fill="none" stroke="#9bdcd4" stroke-opacity=".35" stroke-width="2" stroke-dasharray="3 9"/>${stops.map(stop => `<g class="island-journey-stop ${stop.state} ${stop.current ? 'is-current' : ''}" data-station="${stop.index + 1}" data-stop-state="${stop.state}" data-encounter-kind="${stop.kind}" data-island-feature="${stop.feature || 'unknown'}" transform="translate(${stop.x} ${stop.y})"><g class="island-fragment-art">${islandShape(stop.kind, stop.index, stop.feature)}${stop.kind === 'unknown' && !preview ? '<ellipse cx="0" cy="-25" rx="62" ry="37" fill="#233e55" opacity=".8"/><text x="0" y="-17" fill="#adc9d2" font-size="26" text-anchor="middle">?</text>' : ''}</g>${stop.current ? '<ellipse class="island-current-ring" cx="0" cy="17" rx="73" ry="24" fill="none" stroke="#e7cd8e" stroke-width="2"/>' : ''}<g transform="translate(0 73)"><circle r="13" fill="${stop.state === 'visited' ? '#315e5a' : stop.current ? '#79683d' : '#25394e'}" stroke="${stop.current ? '#edd599' : '#6b969e'}"/><text y="5" text-anchor="middle" fill="#e5f3ed" font-size="14">${stop.state === 'visited' ? '✓' : stop.index + 1}</text></g></g>`).join('')}${!preview ? `<g class="island-travel-ship" transform="translate(${shipPoint[0]} ${shipPoint[1]})"><g>${shipGlyph()}</g><text y="-30" text-anchor="middle" fill="#f2dcab" font-size="12">${travel ? 'UNTERWEGS' : 'REISE-LUFTSCHIFF'}</text></g>` : ''}<g fill="#a9ded7" opacity=".45"><path d="m311 44 4 9 4-9-4-9Zm359 9 3 7 3-7-3-7Zm395 230 4 8 4-8-4-8Z"/><circle cx="508" cy="65" r="2"/><circle cx="53" cy="291" r="2"/></g></svg><ol class="island-route-stops">${stops.map(stop => `<li class="${stop.state} ${stop.current ? 'is-current' : ''}" ${stop.current ? 'aria-current="step"' : ''}><strong>Insel ${stop.index + 1}</strong><span>${e(preview ? stopKinds[stop.kind] : stop.title)}</span><small>${preview ? 'Möglicher Schauplatz' : e(stop.label)}</small></li>`).join('')}</ol></div></div><p class="island-route-caption">${preview ? 'Wälder, Ruinen und Lichtsteine schweben als kleine Inseln im Strom. Welche Wege du findest, entscheidet jede Reise neu.' : 'Wische über die Inselroute. Helle Inseln hast du erkundet; der goldene Ring zeigt dein Ziel. Dein Luftschiff folgt dem Lichtband zwischen den Inseln.'}</p></section>`;
}

export function renderIslandBackdrop(profile) {
  const station = Math.max(1, Math.min(7, profile?.station || 1));
  return `<svg class="island-fallback-landscape" viewBox="0 0 1000 440" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="island-stage-sky" x2="0" y2="1"><stop stop-color="#203e59"/><stop offset="1" stop-color="#102738"/></linearGradient></defs><path fill="url(#island-stage-sky)" d="M0 0h1000v440H0Z"/><path d="M-60 178C145 20 366 255 549 142S857 69 1080 138" fill="none" stroke="#8dcfc9" stroke-width="34" opacity=".14"/><path d="M-40 167C195 38 374 228 569 130S869 80 1040 114" fill="none" stroke="#b4b4e5" stroke-width="10" opacity=".25"/><g opacity=".55" transform="translate(120 147) scale(.85)">${islandShape('route', station + 1)}</g><g opacity=".6" transform="translate(840 116) scale(.65)">${islandShape('route', station + 2)}</g><g opacity=".45" transform="translate(710 225) scale(.43)">${islandShape('route', station + 3)}</g><g class="island-stage-clouds" fill="#aacfd4" opacity=".11"><ellipse cx="220" cy="266" rx="139" ry="15"/><ellipse cx="825" cy="310" rx="153" ry="18"/></g><g transform="translate(475 301) scale(3.05 1.72)">${islandShape('route', station)}</g><g transform="translate(710 258) scale(1.8)">${landmark(profile?.encounterKind, profile?.feature)}</g><path d="M350 318q95-34 201-7" stroke="#d4cd9c" stroke-width="5" fill="none" opacity=".65"/><g fill="#a2d9d1" opacity=".65"><circle cx="224" cy="64" r="2"/><circle cx="617" cy="42" r="2"/><path d="m918 244 4 8 4-8-4-8Z"/></g></svg>`;
}
