const rooms = [
  ['Vorhalle der Wächter', 'Massive Steinbögen schließen sich hinter dir. Fackeln weisen den Weg zur ersten Wendeltreppe.'],
  ['Halle der Funken', 'Zwischen den alten Mauern schweben kleine Lichtfunken über den Runen im Boden.'],
  ['Steinerne Wacht', 'Schwere Pfeiler tragen das Gewölbe. Hinter deinem Gegner führt eine Treppe weiter hinauf.'],
  ['Runenbibliothek', 'Leuchtende Zeichen bewahren das Wissen des Turms. Kaltes Licht fällt durch die hohen Fenster.'],
  ['Halle der Echos', 'Jeder Schritt hallt durch die hohe Kammer. Die Küste liegt bereits weit unter dir.'],
  ['Kammer der Bewährung', 'Ein Ring aus Ätherzeichen leuchtet im Stein. Die nächste Treppe wartet hinter dem Tor.'],
  ['Sternenobservatorium', 'Durch offene Bögen siehst du den Himmel. Über dir schimmern die alten Sternenrunen.'],
  ['Wolkengalerie', 'Wolken ziehen an den Fenstern vorbei. Das Licht des Äthers fällt auf den hellen Stein.'],
  ['Treppe der Dämmerung', 'Die letzte Wendung der Treppe führt zur Kuppel. Zwischen den Säulen tanzen Lichtsplitter.'],
  ['Kuppel der Prüfungen', 'Unter der großen Kuppel strahlen alle Runen des Turms. Hier endet dein Aufstieg.'],
];

export function towerRoomFor(run) {
  const floor = Math.max(1, Math.min(10, Math.trunc(Number(run?.floor) || 1)));
  const tier = floor < 4 ? 'ember' : floor < 7 ? 'rune' : 'sky';
  return { floor, name: rooms[floor - 1][0], description: rooms[floor - 1][1], tier,
    accent: { ember: '#e3b06e', rune: '#b8b1ee', sky: '#a1e5dc' }[tier] };
}

export function renderTowerExterior(run = null) {
  const room = towerRoomFor(run);
  const cleared = Math.max(0, Math.min(10, Number(run?.cleared) || 0));
  return `<svg class="tower-exterior" viewBox="0 0 300 340" aria-hidden="true"><path d="M0 296 68 264 105 278 144 253 181 277 232 259 300 296V340H0Z" fill="#23364a"/><circle cx="234" cy="55" r="24" fill="#9eb9d1" opacity=".16"/><path d="m92 83 58-72 58 72Z" fill="#424659" stroke="#ada3c0" stroke-width="2"/><path d="M94 82H207V284H94Z" fill="#344052" stroke="#8497a8" stroke-width="2"/><path d="M81 280H220V302H81Z" fill="#526074"/><path d="M101 85H117V278H101Z" fill="#48536a"/><path d="M194 85H205V278H194Z" fill="#212c40"/>${Array.from({ length: 10 }, (_, index) => {
    const floor = index + 1, y = 265 - index * 18;
    const current = run && ['active', 'choice'].includes(run.status) && floor === room.floor;
    const lit = floor <= cleared || current;
    return `<g class="tower-window ${current ? 'current' : ''}" fill="${lit ? room.accent : '#162436'}"><path d="M133 ${y}v-8a5 5 0 0 1 10 0v8Z"/><path d="M161 ${y}v-8a5 5 0 0 1 10 0v8Z"/>${current ? `<path d="m217 ${y - 4} 10-5v10Z" fill="${room.accent}"/>` : ''}</g>`;
  }).join('')}<path d="M141 283v-12a10 10 0 0 1 20 0v12" fill="#112235"/><path d="M66 306 150 291l87 16-42 17H104Z" fill="#44536a"/><path d="M36 141h53m124 66h52M27 227h57m133-106h62" stroke="#acc1d0" stroke-width="6" stroke-linecap="round" opacity=".2"/><path d="m150 20 4 9 10 1-7 7 1 10-8-5-8 5 2-10-8-7 10-1Z" fill="${room.accent}"/></svg>`;
}

export function renderTowerAscent({ run, e, rewards = {} }) {
  const room = towerRoomFor(run);
  const cleared = Math.max(0, Math.min(10, Number(run?.cleared) || 0));
  const active = run && ['active', 'choice'].includes(run.status);
  return `<section class="tower-ascent" aria-label="Dein Aufstieg durch zehn Turmetagen">${renderTowerExterior(run)}<div class="tower-ascent-copy"><span class="eyebrow">${active ? `DEIN AUFSTIEG · ETAGE ${room.floor} / 10` : 'ZEHN KAMMERN BIS ZUR KUPPEL'}</span><h3>${e(run ? room.name : 'Schritt für Schritt nach oben')}</h3><p>${e(run ? room.description : 'Steige von den Fackelhallen durch alte Runenkammern bis über die Wolken. Jede Etage ist eine neue Prüfung.')}</p><ol class="tower-track">${Array.from({ length: 10 }, (_, index) => {
    const floor = index + 1;
    const status = floor <= cleared ? 'cleared' : active && floor === room.floor ? 'current' : 'locked';
    return `<li class="tower-step ${status} ${rewards[floor] ? 'reward-step' : ''}" data-tower-step="${floor}" data-status="${status}" ${active && floor === room.floor ? 'aria-current="step"' : ''} aria-label="Etage ${floor}: ${status === 'cleared' ? 'geschafft' : status === 'current' ? 'hier bist du' : 'noch vor dir'}${rewards[floor] ? ', Sammlungsfund' : ''}" title="Etage ${floor}"><span>${status === 'cleared' ? '✓' : floor}</span><small>${rewards[floor] ? '✦' : '·'}</small></li>`;
  }).join('')}</ol><small class="tower-ascent-legend">${cleared} / 10 Etagen geschafft · ✦ Sammlungsfund</small></div></section>`;
}

export function renderTowerBackdrop(run) {
  const room = towerRoomFor(run);
  return `<svg class="adventure-room-backdrop tower-room-backdrop" viewBox="0 0 1000 460" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path fill="#1d2634" d="M0 0h1000v460H0Z"/>${Array.from({ length: 6 }, (_, row) => Array.from({ length: 10 }, (_, col) => `<rect x="${col * 110 - (row % 2 ? 50 : 0)}" y="${row * 55}" width="106" height="51" rx="3" fill="${row % 2 ? '#33404c' : '#2d3745'}" stroke="#414d59"/>`).join('')).join('')}<path d="M390 302V135a110 110 0 0 1 220 0v167Z" fill="${room.tier === 'ember' ? '#182335' : '#354d67'}" stroke="#637382" stroke-width="18"/><path d="M418 301V137a82 82 0 0 1 164 0v164Z" fill="${room.tier === 'ember' ? '#3a3340' : '#73959e'}" opacity=".6"/><path d="M500 51v251M394 158h212" stroke="#667689" stroke-width="8"/><path d="m500 95 22 30-22 30-22-30Z" fill="${room.accent}" opacity=".8"/><path d="M0 313h1000v147H0Z" fill="#465064"/><path d="M0 346h1000M0 396h1000M240 313 90 460M400 313l-40 147m240-147 40 147m120-147 150 147" fill="none" stroke="#73758a" stroke-width="2"/><ellipse cx="500" cy="378" rx="223" ry="49" fill="#232d40" stroke="${room.accent}" stroke-width="3"/><ellipse cx="500" cy="378" rx="194" ry="35" fill="none" stroke="${room.accent}" opacity=".35"/>${[85, 830].map(x => `<g><path d="M${x} 32h85v282h-85Z" fill="#424958"/><path d="M${x - 11} 303h107v21h-107Zm0-273h107v20h-107Z" fill="#62697a"/><path d="M${x + 23} 203h39v13h-39Z" fill="#ab8d65"/><path d="M${x + 43} 205c-28-15-21-34-5-55-1 21 25 20 20 41-2 8-8 13-15 14Z" fill="#e3b06e" class="adventure-torch"/><path d="M${x + 44} 201c-12-9-8-20 0-29 0 10 15 18 0 29Z" fill="#ffe7a6" class="adventure-torch"/></g>`).join('')}<path d="M710 310v-13h28v-13h28v-13h28v-13h28v-13h32v65Z" fill="#82818d" stroke="#b1a2a0" stroke-width="2"/><path d="M675 61h52v22h-52M702 45v54" stroke="${room.accent}" stroke-width="3" opacity=".5"/></svg>`;
}

export function renderMineBackdrop() {
  return `<svg class="adventure-room-backdrop mine-room-backdrop" viewBox="0 0 1000 460" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path fill="#101d2a" d="M0 0h1000v460H0Z"/><path d="m0 0 186 34 37 126L76 292 0 329Zm1000 0-188 36-62 129 173 153 77-22Z" fill="#344655"/><path d="m220 0 82 153 40-83 80 43 59-93 128 124 63-88 100-56Z" fill="#283a4b"/><path d="M0 344 213 265 393 320 612 270 1000 341v119H0Z" fill="#3c4c58"/><ellipse cx="505" cy="378" rx="240" ry="49" fill="#1e333f" stroke="#6fa7ab" stroke-width="3"/>${[[120,220,70],[220,275,45],[835,210,85],[750,281,40],[910,315,35]].map(([x,y,size],index) => `<path d="m${x} ${y} ${size * .32} ${-size} ${size * .34} ${size * .22} ${-size * .08} ${size * .83}Z" fill="${index % 2 ? '#b2a3eb' : '#8ed9da'}" stroke="#dafff1" stroke-width="2" opacity=".85"/>`).join('')}<path d="M332 311v-150h24v150m290 0V161h24v150M323 163h356v-25H323Z" fill="#756c60"/><path d="M355 308 479 222h54l123 86" fill="none" stroke="#b2976d" stroke-width="7" opacity=".35"/><g fill="#ebc981"><circle cx="425" cy="371" r="12"/><path d="m425 347 0-8m0 56v8m24-32h8m-56 0h-8" stroke="#ebc981" stroke-width="4"/></g><path d="M592 356a17 17 0 1 0 0 28 18 18 0 0 1 0-28Z" fill="#c5b3f2"/></svg>`;
}
