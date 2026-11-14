import { AETHER_ROUTE, SHIP_DOCKS, AIRSHIPS } from '../shared/airships.js';

export function renderPlayerAirship(state, e) {
  const fleet = state.airships;
  if (!fleet?.activeShipId) return '';
  const ship = AIRSHIPS.find(item => item.id === fleet.activeShipId);
  const dock = SHIP_DOCKS.find(item => item.id === fleet.dockId);
  const destination = SHIP_DOCKS.find(item => item.id === fleet.journey?.toDockId);
  const label = `${ship?.name || 'Dein Luftschiff'} · ${destination ? `unterwegs nach ${destination.name}` : dock?.name || 'Im Ätherstrom'}`;
  return `<svg class="player-airship-route" viewBox="0 0 1536 1024" aria-hidden="true"><path d="${AETHER_ROUTE}"/></svg><button class="player-airship-marker" data-action="nav" data-tab="airships" aria-label="${e(label)}. Luftschiff öffnen" title="${e(label)}" style="left:${(dock?.x || 765) / 15.36}%;top:${(dock?.y || 89) / 10.24}%"><svg viewBox="0 0 60 48" aria-hidden="true"><path d="M9 30h43l-8 11H18Z" fill="#78523e" stroke="#f0cc86" stroke-width="2"/><path d="M28 6v25M27 9 12 26h15Zm4 0 17 17H31Z" fill="#d6f0e6" stroke="#79d9cb" stroke-width="2"/><path d="M29 5h13l-5 5h-8" fill="#bca6e9"/><path d="M20 43h25" stroke="#7ce2cf" stroke-width="3" stroke-linecap="round"/></svg><span>Dein Luftschiff</span></button>`;
}

export function mountPlayerAirship(viewport, fleet) {
  const marker = viewport.querySelector('.player-airship-marker');
  const path = viewport.querySelector('.player-airship-route path');
  const stage = viewport.querySelector('.world-map-stage');
  if (!marker || !path || !fleet) return () => {};
  const from = SHIP_DOCKS.find(dock => dock.id === (fleet.journey?.fromDockId || fleet.dockId));
  const to = SHIP_DOCKS.find(dock => dock.id === fleet.journey?.toDockId) || from;
  if (!from || !to) return () => {};
  const start = Date.parse(fleet.journey?.startedAt);
  const end = Date.parse(fleet.journey?.arrivesAt);
  const length = path.getTotalLength();
  let frame = 0, disposed = false, placed = false;
  const paint = () => {
    frame = 0;
    if (disposed) return;
    if (!placed || (stage.dataset.motion === 'running' && !document.hidden)) {
      const fraction = Number.isFinite(start) && end > start ? Math.max(0, Math.min(1, (Date.now() - start) / (end - start))) : 0;
      const progress = from.progress + (to.progress - from.progress) * fraction;
      const point = path.getPointAtLength(length * progress);
      marker.style.left = `${point.x / 15.36}%`;
      marker.style.top = `${point.y / 10.24}%`;
      placed = true;
    }
    if (fleet.journey && Date.now() < end && stage.dataset.motion === 'running' && !document.hidden) frame = requestAnimationFrame(paint);
  };
  const sync = () => { cancelAnimationFrame(frame); paint(); };
  const observer = new MutationObserver(sync);
  observer.observe(stage, { attributes: true, attributeFilter: ['data-motion'] });
  document.addEventListener('visibilitychange', sync);
  sync();
  return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', sync); };
}
