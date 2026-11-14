// Ambient effects use the same coordinates as the 1536 × 1024 illustration.
// They never receive input or change a place, route or adventure state.
let userPaused = false;
let elapsed = 0;

const prefersStillness = () => typeof window !== 'undefined'
  && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

export function toggleMapAtmosphere() { if (!prefersStillness()) userPaused = !userPaused; }
export function resetMapAtmosphere() { userPaused = false; elapsed = 0; }

export function renderMapMotionControl() {
  const reduced = prefersStillness();
  return `<button type="button" class="world-map-motion" data-action="adventure-map-motion" aria-label="Kartenanimation pausieren" aria-pressed="${userPaused}" ${reduced ? 'disabled title="Deine Einstellung für reduzierte Bewegung ist aktiv."' : ''}><span aria-hidden="true">${userPaused || reduced ? '▷' : 'Ⅱ'}</span><span data-map-motion-label>${reduced ? 'Bewegung reduziert' : userPaused ? 'Animation fortsetzen' : 'Animation pausieren'}</span></button>`;
}

function smoke(x, y, delay, wind = 16, lift = 68, size = 1) {
  return `<g class="map-chimney" transform="translate(${x} ${y}) scale(${size})">${[0, 1, 2].map(index => `<g class="map-smoke-puff" style="--phase:${delay - index * 3}s;--smoke-wind:${wind}px;--smoke-lift:${-lift}px"><ellipse cx="0" cy="-3" rx="6" ry="5"/><circle cx="-4" cy="-7" r="5"/><circle cx="4" cy="-9" r="6"/></g>`).join('')}</g>`;
}

function airship(path, seconds, start) {
  return `<g class="map-airship"><animateMotion dur="${seconds}s" begin="${start}s" repeatCount="indefinite" path="${path}"/><animate attributeName="opacity" values="0;0.95;0.95;0" keyTimes="0;0.08;0.9;1" dur="${seconds}s" begin="${start}s" repeatCount="indefinite"/><ellipse cx="0" cy="-5" rx="14" ry="6" fill="#dfbc78" stroke="#785c51" stroke-width="1.1"/><path d="M-8-9Q0-3 8-9M0-11V1M-9-1-5 7M9-1 5 7" fill="none" stroke="#f7e6c5" stroke-width="1"/><path d="m-7 6 14 0-3 5h-7Z" fill="#75535b" stroke="#e0bd89" stroke-width="1"/></g>`;
}

export function renderMapAtmosphere() {
  const sparks = [[800,81],[763,173],[650,257],[660,334],[846,347],[999,392],[1049,479],[891,568],[1028,627],[982,716],[839,759],[752,839]];
  const rocks = [[806,550,0],[976,618,-3],[785,782,-5]];
  return `<div class="world-map-atmosphere" aria-hidden="true" style="--map-elapsed:${elapsed}s"><svg class="map-atmosphere-scene" viewBox="0 0 1536 1024" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true">
    <g class="map-aurora" fill="none" stroke-linecap="round">
      <path class="map-aurora-veil" stroke="#9ff7e7" stroke-width="13" d="M808 49C725 95 716 145 775 175C845 223 590 230 608 285S768 336 917 350C1039 366 1084 446 996 498S678 523 783 564S1124 606 1010 690S811 723 771 797L701 871"/>
      <path class="map-aurora-flow" pathLength="1000" stroke="#b6f6ec" stroke-width="3" d="M807 51C729 95 721 146 778 177C843 223 595 232 614 286S770 336 920 352C1037 367 1083 444 997 495S683 524 788 566S1120 607 1008 689S815 724 775 796L705 869"/>
      <path class="map-aurora-flow map-aurora-rose" pathLength="1000" stroke="#e7bfff" stroke-width="4" d="M815 51C743 101 732 148 785 181C845 227 608 239 625 289S775 344 925 362C1041 376 1072 447 986 501S696 531 799 571S1110 614 997 694S826 730 784 803L716 871"/>
    </g>
    <g class="map-sparks" fill="#e2fff6">${sparks.map(([x,y],index) => `<g transform="translate(${x} ${y})"><circle class="map-aether-spark" r="${index % 3 === 0 ? 2.6 : 1.8}" style="--phase:${-index * .71}s"/></g>`).join('')}</g>
    <g class="map-mist" fill="#e7f7f4"><path class="map-mist-bank" d="M178 707q58-24 116-2t110-3q40 18 13 26t-94-3q-68-12-129 4Z"/><path class="map-mist-bank map-mist-late" d="M1030 171q52-29 94-3t86-5q41 18-5 25t-88-3q-43-12-89 1Z"/></g>
    <g class="map-chimney-smoke" fill="#edf0eb">
      ${smoke(395,174,-1,19,70,.85)}${smoke(417,159,-4,21,77,1)}${smoke(461,173,-2,20,64,.8)}
      ${smoke(523,526,-3,13,46,.55)}${smoke(710,879,-5,17,65,.7)}${smoke(820,854,-1,22,79,.85)}
    </g>
    ${airship('M654 257C597 284 651 329 779 339S955 359 1000 402',52,-18)}
    ${airship('M788 568C850 592 1085 597 1042 652S939 723 884 735S795 778 755 832',62,-39)}
    <g class="map-floating-rocks">${rocks.map(([x,y,phase]) => `<g transform="translate(${x} ${y})"><g class="map-drifting-rock" style="--phase:${phase}s"><path d="m-8-3 15-2-4 15-6 5Z" fill="#72767a"/><path d="m-9-3 9-4 8 3-5 5-10 0Z" fill="#94ad77"/><path d="m-4 1 2 9 2-7" fill="none" stroke="#beb99b" stroke-width="1.2"/></g></g>`).join('')}</g>
  </svg></div>`;
}

export function mountMapAtmosphere(viewport) {
  const scene = viewport.querySelector('.map-atmosphere-scene');
  if (!scene) return () => {};
  const stage = viewport.querySelector('.world-map-stage');
  const image = viewport.querySelector('.world-map-image');
  const control = document.querySelector('[data-action="adventure-map-motion"]');
  const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let inView = !('IntersectionObserver' in window);
  let disposed = false;
  scene.pauseAnimations?.();
  scene.setCurrentTime?.(elapsed);
  const update = () => {
    if (disposed) return;
    const reduced = Boolean(preference?.matches);
    const unavailable = viewport.classList.contains('has-image-error');
    const paused = userPaused || reduced || document.hidden || !inView || unavailable;
    stage.dataset.motion = paused ? 'paused' : 'running';
    if (paused) scene.pauseAnimations?.(); else scene.unpauseAnimations?.();
    if (control) {
      control.disabled = reduced;
      control.setAttribute('aria-pressed', String(userPaused));
      control.title = reduced ? 'Deine Einstellung für reduzierte Bewegung ist aktiv.' : '';
      control.querySelector('[data-map-motion-label]').textContent = reduced ? 'Bewegung reduziert' : userPaused ? 'Animation fortsetzen' : 'Animation pausieren';
      control.firstElementChild.textContent = userPaused || reduced ? '▷' : 'Ⅱ';
    }
  };
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    inView = entries[0]?.isIntersecting === true;
    update();
  }) : null;
  observer?.observe(viewport);
  document.addEventListener('visibilitychange', update);
  preference?.addEventListener('change', update);
  image?.addEventListener('error', update);
  update();
  return () => {
    if (disposed) return;
    disposed = true;
    elapsed = scene.getCurrentTime?.() || elapsed;
    scene.pauseAnimations?.();
    observer?.disconnect();
    document.removeEventListener('visibilitychange', update);
    preference?.removeEventListener('change', update);
    image?.removeEventListener('error', update);
  };
}
