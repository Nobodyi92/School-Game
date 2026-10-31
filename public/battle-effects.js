// Visual effects only. All battle rules and final health values come from the server.
let generation = 0;
let queue = Promise.resolve();
const jobs = new Set();
const contexts = new Set();
const ACTIONS = new Set(['attack', 'focus', 'guard', 'potionSmall', 'potion', 'potionLarge', 'surrender']);

export function isAnimating() {
  return jobs.size > 0;
}

function matchingPanel(battleId) {
  return Array.from(document.querySelectorAll('.battle-panel')).find(panel =>
    !battleId || !panel.dataset.battleId || panel.dataset.battleId === String(battleId));
}

function alive(ctx) {
  return ctx.generation === generation && ctx.panel.isConnected &&
    (!ctx.battleId || !ctx.panel.dataset.battleId || ctx.panel.dataset.battleId === String(ctx.battleId));
}

function fighter(ctx, id) {
  return ctx.panel.querySelector(id === ctx.userId ? '.fighter.self' : '.fighter.opponent');
}

function arenaController(ctx) {
  const arena = ctx.panel.querySelector('.arena-3d');
  const controller = arena?.__hero3d;
  return arena?.dataset.renderState === 'ready' && controller?.supported !== false &&
    typeof controller?.play === 'function' ? controller : null;
}

// Renderer effects and DOM feedback share one turn. Cancellation must release
// the turn even when a WebGL context disappears during an animation.
function playArenaEvent(ctx, controller, event) {
  return new Promise(resolve => {
    let settled = false;
    let timer;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ctx.waiters.delete(finish);
      ctx.controllers.delete(controller);
      resolve();
    };
    ctx.waiters.add(finish);
    ctx.controllers.add(controller);
    timer = setTimeout(() => {
      try { controller.cancel?.(); } catch { /* A lost context is already gone. */ }
      finish();
    }, 1600);
    try { Promise.resolve(controller.play(event)).catch(() => {}).finally(finish); }
    catch { finish(); }
  });
}

function visual(ctx, host, className, text = '') {
  if (!host || !alive(ctx)) return null;
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  node.setAttribute('aria-hidden', 'true');
  host.append(node);
  ctx.nodes.add(node);
  return node;
}

function animate(ctx, node, frames, options = {}) {
  if (!node || !alive(ctx) || ctx.reduced || typeof node.animate !== 'function') return Promise.resolve();
  const animation = node.animate(frames, {
    duration: 440, easing: 'cubic-bezier(.22,.7,.3,1)', fill: 'both', ...options,
  });
  ctx.animations.add(animation);
  return animation.finished.catch(() => {}).finally(() => {
    animation.cancel();
    ctx.animations.delete(animation);
  });
}

function pause(ctx, duration) {
  return new Promise(resolve => {
    let timer;
    const done = () => { clearTimeout(timer); ctx.waiters.delete(done); resolve(); };
    ctx.waiters.add(done);
    timer = setTimeout(done, duration);
  });
}

function number(ctx, host, text, tone, delay = 0) {
  const node = visual(ctx, host, `fx-number fx-${tone}`, text);
  if (ctx.reduced) return Promise.resolve();
  return animate(ctx, node, [
    { opacity: 0, transform: 'translate(-50%, 8px) scale(.8)' },
    { opacity: 1, transform: 'translate(-50%, -12px) scale(1.08)', offset: .28 },
    { opacity: 1, transform: 'translate(-50%, -23px) scale(1)', offset: .72 },
    { opacity: 0, transform: 'translate(-50%, -36px) scale(.95)' },
  ], { duration: 300, delay });
}

function ring(ctx, host, tone, delay = 0) {
  const node = visual(ctx, host, `fx-ring fx-${tone}`);
  return animate(ctx, node, [
    { opacity: 0, transform: 'scale(.55)' },
    { opacity: .95, transform: 'scale(1)', offset: .3 },
    { opacity: 0, transform: 'scale(1.55)' },
  ], { duration: 300, delay });
}

function particles(ctx, host, tone, victory = false) {
  const work = [];
  const count = victory ? 10 : 6;
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2;
    const distance = victory ? 58 : 38;
    const node = visual(ctx, host, `fx-particle fx-${tone}${victory ? ' fx-confetti' : ''}`, victory && index % 3 === 0 ? '✦' : '');
    if (node) node.style.setProperty('--fx-particle-color', ['#edbd64', '#a88ad1', '#70a58c'][index % 3]);
    work.push(animate(ctx, node, [
      { opacity: 0, transform: 'translate(-50%, -50%) scale(.3)' },
      { opacity: 1, offset: .2 },
      { opacity: 0, transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance - (victory ? 10 : 0)}px)) rotate(${index * 45}deg) scale(.7)` },
    ], { duration: victory ? 320 : 360, delay: victory ? 150 : 70 }));
  }
  return Promise.all(work);
}

function focusBeam(ctx, source, destination) {
  if (!source || !destination || ctx.reduced) return Promise.resolve();
  const panel = ctx.panel.getBoundingClientRect();
  const from = source.getBoundingClientRect();
  const to = destination.getBoundingClientRect();
  const x = from.left + from.width / 2 - panel.left;
  const y = from.top + from.height / 2 - panel.top;
  const dx = to.left + to.width / 2 - panel.left - x;
  const dy = to.top + to.height / 2 - panel.top - y;
  const beam = visual(ctx, ctx.panel, 'fx-beam');
  if (!beam) return Promise.resolve();
  beam.style.left = `${x}px`;
  beam.style.top = `${y}px`;
  beam.style.width = `${Math.hypot(dx, dy)}px`;
  beam.style.setProperty('--fx-beam-angle', `${Math.atan2(dy, dx)}rad`);
  return animate(ctx, beam, [
    { opacity: 0, transform: 'rotate(var(--fx-beam-angle)) scaleX(0)' },
    { opacity: .95, transform: 'rotate(var(--fx-beam-angle)) scaleX(1)', offset: .42 },
    { opacity: 0, transform: 'rotate(var(--fx-beam-angle)) scaleX(1)' },
  ], { duration: 310, delay: 80 });
}

function healthSnapshot(ctx, events) {
  const ids = new Set(events.flatMap(event => [event.actorId, event.targetId]));
  for (const id of ids) {
    const node = fighter(ctx, id);
    const value = node?.querySelector('.health-label strong');
    const bar = node?.querySelector('.health-track > span');
    const match = value?.textContent.match(/(\d+)\s*\/\s*(\d+)/);
    const hp = Number(node?.dataset.hp ?? match?.[1]);
    const maxHp = Number(node?.dataset.maxHp ?? match?.[2]);
    if (!bar || !Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) continue;
    ctx.health.set(id, { node, bar, value, hp, maxHp, finalHp: hp, finalWidth: bar.style.width });
  }
  // The screen was rendered with final values. Reconstruct the beginning of this
  // batch so the training bot's immediate reply can be played after our action.
  for (const event of [...events].reverse()) {
    const target = ctx.health.get(event.targetId);
    const actor = ctx.health.get(event.actorId);
    if (target && event.damage) target.hp = Math.min(target.maxHp, target.hp + event.damage);
    if (actor && event.healing) actor.hp = Math.max(0, actor.hp - event.healing);
  }
  for (const health of ctx.health.values()) paintHealth(health, health.hp);
}

function paintHealth(health, hp) {
  health.hp = Math.max(0, Math.min(health.maxHp, hp));
  health.bar.style.width = `${health.hp / health.maxHp * 100}%`;
  const first = health.value?.firstChild;
  if (first?.nodeType === Node.TEXT_NODE) first.nodeValue = String(health.hp);
}

function updateHealth(ctx, event) {
  const work = [];
  const changes = new Map();
  if (event.damage) changes.set(event.targetId, -(event.damage));
  if (event.healing) changes.set(event.actorId, (changes.get(event.actorId) || 0) + event.healing);
  for (const [id, amount] of changes) {
    const health = ctx.health.get(id);
    if (!health) continue;
    const from = health.hp / health.maxHp * 100;
    paintHealth(health, health.hp + amount);
    const to = health.hp / health.maxHp * 100;
    work.push(animate(ctx, health.bar, [{ width: `${from}%` }, { width: `${to}%` }], {
      duration: 260, delay: ctx.reduced ? 0 : 150, easing: 'ease-out',
    }));
  }
  return Promise.all(work);
}

function victory(ctx, winnerId) {
  const winner = fighter(ctx, winnerId)?.querySelector('.fighter-avatar');
  if (!winner) return Promise.resolve();
  return Promise.all([
    ring(ctx, winner, 'gold', 150),
    particles(ctx, winner, 'gold', true),
    number(ctx, winner, 'Sieg! ✦', 'gold', 150),
  ]);
}

async function playEvent(ctx, event) {
  if (!alive(ctx)) return;
  const controller = arenaController(ctx);
  const actor = fighter(ctx, event.actorId)?.querySelector('.fighter-avatar');
  const target = fighter(ctx, event.targetId)?.querySelector('.fighter-avatar');
  if (!actor || !target) {
    if (controller) await playArenaEvent(ctx, controller, event);
    return;
  }
  const nodesBefore = new Set(ctx.nodes);
  const work = [updateHealth(ctx, event)];
  if (controller) work.push(playArenaEvent(ctx, controller, event));
  if (event.action === 'attack' || event.action === 'focus') {
    const direction = event.actorId === ctx.userId ? 1 : -1;
    const step = direction * Math.min(38, Math.max(14, Math.abs(target.getBoundingClientRect().left - actor.getBoundingClientRect().left) * .13));
    if (!controller) work.push(animate(ctx, actor, [
      { transform: 'translateX(0) scale(1)' },
      { transform: `translateX(${-step * .2}px) scale(.97)`, offset: .2 },
      { transform: `translateX(${step}px) scale(1.05)`, offset: .46 },
      { transform: 'translateX(0) scale(1)' },
    ], { duration: 440 }));
    if (!controller) work.push(animate(ctx, target, [
      { transform: 'translateX(0)', filter: 'brightness(1)' },
      { transform: `translateX(${direction * 6}px)`, filter: 'brightness(1.35)', offset: .2 },
      { transform: `translateX(${-direction * 4}px)`, filter: 'brightness(1)', offset: .4 },
      { transform: `translateX(${direction * 2}px)`, offset: .65 },
      { transform: 'translateX(0)', filter: 'brightness(1)' },
    ], { duration: 260, delay: 150 }));
    work.push(ring(ctx, target, event.action === 'focus' ? 'purple' : 'damage', 140));
    work.push(number(ctx, target, `−${event.damage}`, event.action === 'focus' ? 'purple' : 'damage', 150));
    if (event.action === 'focus') {
      work.push(ring(ctx, actor, 'purple'));
      if (!controller) work.push(focusBeam(ctx, actor, target));
    }
    if (event.blocked) {
      const caption = visual(ctx, target, 'fx-caption fx-blue', 'Deckung');
      work.push(animate(ctx, caption, [{ opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 0 }], { duration: 300, delay: 120 }));
    }
  } else if (event.action === 'guard') {
    const shield = visual(ctx, actor, 'fx-shield');
    work.push(animate(ctx, shield, [
      { opacity: 0, transform: 'scale(.7)' },
      { opacity: .95, transform: 'scale(1.05)', offset: .45 },
      { opacity: 0, transform: 'scale(1.14)' },
    ], { duration: 450 }));
    work.push(number(ctx, actor, event.healing ? `+${event.healing} LP` : 'Deckung', 'blue', 90));
  } else if (event.action.startsWith('potion')) {
    work.push(ring(ctx, actor, 'healing'), particles(ctx, actor, 'healing'));
    work.push(number(ctx, actor, `+${event.healing} LP`, 'healing', 70));
  }
  if (event.winnerId) work.push(victory(ctx, event.winnerId));
  if (ctx.reduced) work.push(pause(ctx, 100));
  try { await Promise.all(work); }
  finally {
    for (const node of ctx.nodes) if (!nodesBefore.has(node)) { node.remove(); ctx.nodes.delete(node); }
  }
}

function cleanup(ctx) {
  if (ctx.cleaned) return;
  ctx.cleaned = true;
  for (const controller of ctx.controllers) {
    try { controller.cancel?.(); } catch { /* App disposal can happen first. */ }
  }
  ctx.controllers.clear();
  for (const animation of ctx.animations) animation.cancel();
  for (const finish of [...ctx.waiters]) finish();
  for (const node of ctx.nodes) node.remove();
  ctx.nodes.clear();
  if (ctx.panel.isConnected && (!ctx.battleId || !ctx.panel.dataset.battleId || ctx.panel.dataset.battleId === String(ctx.battleId))) {
    for (const health of ctx.health.values()) {
      paintHealth(health, health.finalHp);
      health.bar.style.width = health.finalWidth || `${health.finalHp / health.maxHp * 100}%`;
    }
    ctx.panel.classList.remove('fx-playing');
  }
  contexts.delete(ctx);
}

/** Cancel before navigation or switching battles. Detached panels are also safe. */
export function cancelBattleEffects() {
  generation++;
  for (const ctx of contexts) cleanup(ctx);
  jobs.clear();
  queue = Promise.resolve();
}

/** Play only newly received events, after rendering the server's final state. */
export function playBattleEvents(events, { userId, battleId, finished = false } = {}) {
  const panel = matchingPanel(battleId);
  const selected = Array.isArray(events) ? events.filter(event => event && ACTIONS.has(event.action) &&
    typeof event.actorId === 'string' && typeof event.targetId === 'string').slice(-64).map(event => ({
      ...event,
      damage: Math.max(0, Math.min(10_000, Number(event.damage) || 0)),
      healing: Math.max(0, Math.min(10_000, Number(event.healing) || 0)),
    })) : [];
  if (!panel || !userId || !selected.length) return Promise.resolve();
  const token = {};
  const thisGeneration = generation;
  jobs.add(token);
  const job = queue.catch(() => {}).then(async () => {
    if (thisGeneration !== generation || !panel.isConnected) return;
    const ctx = {
      panel, userId, battleId, finished, generation: thisGeneration,
      reduced: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
      nodes: new Set(), animations: new Set(), waiters: new Set(), controllers: new Set(), health: new Map(),
    };
    if (!alive(ctx)) return;
    contexts.add(ctx);
    ctx.panel.classList.add('fx-playing');
    try {
      healthSnapshot(ctx, selected);
      for (const event of selected) {
        if (!alive(ctx)) break;
        await playEvent(ctx, event);
      }
    } finally { cleanup(ctx); }
  }).finally(() => jobs.delete(token));
  queue = job;
  return job;
}
