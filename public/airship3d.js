import * as THREE from './vendor/three.module.min.js';
import { AIRSHIPS, SHIP_PARTS } from '../shared/airships.js';

// Procedural models use only the trusted catalogue. No external models or textures.
const BASE = { primary: '#526d7b', secondary: '#efe2bc', accent: '#e5c479' };
const DIMENSIONS = {
  windling: { length: 3.5, width: 1.02, masts: [[.1, 2.15]], cabin: .5 },
  himmelsfalter: { length: 4.5, width: 1.3, masts: [[-.72, 2.25], [.72, 2.6]], cabin: .72 },
  aetherarche: { length: 5.4, width: 1.6, masts: [[-1.35, 2.1], [0, 3.05], [1.35, 2.45]], cabin: .9 },
};
const TAU = Math.PI * 2;

function lookFor(id, slot) {
  const part = SHIP_PARTS.find(item => item.id === id && item.slot === slot);
  return part ? { ...part.colors, style: part.visualStyle } : { ...BASE, style: 'basic' };
}
function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .75, metalness: .09, flatShading: true, ...extra });
}
function mesh(parent, geometry, mat, position = [0, 0, 0], scale = null) {
  const node = new THREE.Mesh(geometry, mat);
  node.position.set(...position);
  if (scale) node.scale.set(...scale);
  parent.add(node);
  return node;
}
function box(parent, mat, position, size) { return mesh(parent, new THREE.BoxGeometry(...size), mat, position); }
function sphere(parent, mat, position, scale) { return mesh(parent, new THREE.SphereGeometry(1, 8, 5), mat, position, scale); }
function spar(parent, mat, from, to, radius = .025) {
  const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const node = mesh(parent, new THREE.CylinderGeometry(radius, radius, direction.length(), 6), mat);
  node.position.copy(start.add(end).multiplyScalar(.5));
  node.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return node;
}
function motif(parent, style, color, scale = 1) {
  const group = new THREE.Group(); group.scale.setScalar(scale); parent.add(group);
  const mat = material(color, { side: THREE.DoubleSide });
  if (style === 'gear') {
    mesh(group, new THREE.TorusGeometry(.20, .045, 4, 12), mat);
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * TAU;
      const tooth = box(group, mat, [Math.cos(angle) * .245, Math.sin(angle) * .245, 0], [.10, .10, .03]);
      tooth.rotation.z = angle;
    }
  } else if (style === 'cloud') {
    for (const [x, y, size] of [[-.16, -.03, .13], [0, .05, .18], [.17, -.03, .13]]) {
      sphere(group, mat, [x, y, 0], [size, size * .8, .035]);
    }
    mesh(group, new THREE.OctahedronGeometry(.075), mat, [0, -.22, 0]);
  } else if (style === 'dune' || style === 'sail' || style === 'basic') {
    const diamond = mesh(group, new THREE.OctahedronGeometry(.2), mat); diamond.scale.z = .2;
    for (let i = 0; i < (style === 'dune' ? 8 : 4); i++) {
      const angle = i / (style === 'dune' ? 8 : 4) * TAU;
      const ray = box(group, mat, [Math.cos(angle) * .28, Math.sin(angle) * .28, 0], [.12, .025, .025]);
      ray.rotation.z = angle;
    }
  } else {
    for (const side of [-1, 1]) {
      const leaf = sphere(group, mat, [side * .095, .01, 0], [.09, .24, .025]);
      leaf.rotation.z = side * -.55;
      if (style === 'root') spar(group, mat, [0, -.27, .015], [side * .19, -.1, .015], .025);
    }
    spar(group, mat, [0, -.28, 0], [0, .22, 0], .018);
  }
  return group;
}

function hullGeometry(length, width) {
  const vertices = [], indices = [], count = 14;
  for (let ring = 0; ring < 2; ring++) {
    for (let i = 0; i < count; i++) {
      const angle = i / count * TAU;
      const x = Math.cos(angle) * length * (ring ? .5 : .4);
      const z = Math.sin(angle) * width * (ring ? .5 : .12);
      vertices.push(x, ring ? 0 : -.5, z);
    }
  }
  vertices.push(0, -.5, 0);
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    indices.push(i, count + i, next, next, count + i, count + next, 2 * count, i, next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function makeShip(view) {
  const id = DIMENSIONS[view?.shipId] ? view.shipId : 'windling';
  const size = DIMENSIONS[id], mods = view?.modifications || {};
  const hullLook = lookFor(mods.hull, 'hull'), sailLook = lookFor(mods.sails, 'sails'), flagLook = lookFor(mods.flag, 'flag');
  const group = new THREE.Group();
  const timber = material(0x755643), deck = material(0xb69b71), rope = material(0xbaa683);
  const hullMat = material(hullLook.primary), trim = material(hullLook.accent, { metalness: .42 });
  const sailMat = material(sailLook.secondary, { side: THREE.DoubleSide });
  mesh(group, hullGeometry(size.length, size.width), hullMat);
  const deckMesh = mesh(group, new THREE.CylinderGeometry(1, 1, .06, 14), deck, [0, .015, 0], [size.length / 2, 1, size.width / 2]);
  deckMesh.rotation.y = Math.PI / 14;
  // Brass rails and round portholes keep every size readable in silhouette.
  for (const side of [-1, 1]) {
    spar(group, trim, [-size.length * .36, .18, side * size.width * .43], [size.length * .36, .18, side * size.width * .43], .035);
    for (let i = 0; i < (id === 'windling' ? 3 : id === 'himmelsfalter' ? 5 : 7); i++) {
      const x = (i - (id === 'windling' ? 1 : id === 'himmelsfalter' ? 2 : 3)) * .43;
      spar(group, trim, [x, .03, side * size.width * .43], [x, .21, side * size.width * .43], .017);
      const port = mesh(group, new THREE.TorusGeometry(.065, .021, 4, 10), trim, [x, -.19, side * size.width * .43]);
      port.rotation.x = .12 * side;
      sphere(group, material(0x87ded1, { emissive: 0x4cbfae, emissiveIntensity: .45 }), [x, -.19, side * size.width * .432], [.044, .044, .018]);
    }
    const decor = motif(group, hullLook.style, hullLook.accent, .6);
    decor.position.set(size.length * .35, -.16, side * size.width * .35);
    if (side < 0) decor.rotation.y = Math.PI;
  }
  box(group, hullMat, [-size.length * .3, .25, 0], [size.cabin, .48, size.width * .7]);
  box(group, trim, [-size.length * .3, .51, 0], [size.cabin + .13, .09, size.width * .82]);
  for (const side of [-1, 1]) box(group, material(0xb1e8db, { emissive: 0x399d91, emissiveIntensity: .35 }), [-size.length * .3, .29, side * size.width * .353], [size.cabin * .6, .17, .025]);
  const bowspritEnd = size.length / 2 + .5;
  spar(group, timber, [size.length * .3, .12, 0], [bowspritEnd, .45, 0], .045);
  const rudder = box(group, trim, [-size.length / 2 + .1, -.4, 0], [.23, .65, .1]); rudder.rotation.z = -.3;
  for (const [index, [x, height]] of size.masts.entries()) {
    spar(group, timber, [x, .02, 0], [x, height + .18, 0], .045);
    const sailWidth = id === 'windling' ? 1.55 : id === 'aetherarche' && index === 1 ? 1.45 : 1.2;
    const top = height - .12, bottom = height * .35;
    spar(group, trim, [x - sailWidth / 2, top, .015], [x + sailWidth / 2, top, .015], .032);
    spar(group, trim, [x - sailWidth * .43, bottom, .015], [x + sailWidth * .43, bottom, .015], .025);
    const shape = new THREE.Shape();
    shape.moveTo(-sailWidth / 2, top); shape.lineTo(sailWidth / 2, top);
    shape.quadraticCurveTo(sailWidth * .62, (top + bottom) / 2, sailWidth * .43, bottom);
    shape.quadraticCurveTo(0, bottom + .14, -sailWidth * .43, bottom);
    shape.quadraticCurveTo(-sailWidth * .35, (top + bottom) / 2, -sailWidth / 2, top);
    mesh(group, new THREE.ShapeGeometry(shape, 5), sailMat, [x, 0, .03]);
    // Colored hem panels make sail customizations visible from both sides.
    const hem = material(sailLook.primary, { side: THREE.DoubleSide });
    spar(group, hem, [x - sailWidth / 2, top, .04], [x - sailWidth * .43, bottom, .04], .035);
    spar(group, hem, [x + sailWidth / 2, top, .04], [x + sailWidth * .43, bottom, .04], .035);
    for (const side of [-1, 1]) {
      const emblem = motif(group, sailLook.style, sailLook.primary, Math.min(.85, sailWidth * .55));
      emblem.position.set(x, (top + bottom) / 2, .06 * side);
      if (side < 0) emblem.rotation.y = Math.PI;
    }
    spar(group, rope, [x, height, -.02], [-size.length * .43, .14, -size.width * .36], .012);
    spar(group, rope, [x, height, -.02], [size.length * .43, .14, -size.width * .36], .012);
  }
  const flagPoleX = -size.length * .38;
  spar(group, trim, [flagPoleX, .5, 0], [flagPoleX, 1.5, 0], .025);
  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0); flagShape.lineTo(-.75, -.06); flagShape.lineTo(-.58, -.24); flagShape.lineTo(-.75, -.46); flagShape.lineTo(0, -.4); flagShape.closePath();
  mesh(group, new THREE.ShapeGeometry(flagShape), material(flagLook.primary, { side: THREE.DoubleSide }), [flagPoleX, 1.48, 0]);
  const flagEmblem = motif(group, flagLook.style, flagLook.accent, .45); flagEmblem.position.set(flagPoleX - .3, 1.27, .025);
  // Float crystals explain how a sailing hull follows the aerial current.
  const crystalMat = material(hullLook.accent, { emissive: hullLook.accent, emissiveIntensity: .35, roughness: .3 });
  for (const x of [-size.length * .28, size.length * .28]) {
    const crystal = mesh(group, new THREE.OctahedronGeometry(.19), crystalMat, [x, -.56, 0]); crystal.scale.y = 1.6;
  }
  if (id === 'aetherarche') {
    for (const side of [-1, 1]) {
      const fin = box(group, hullMat, [-.6, -.1, side * (size.width * .5 + .28)], [1.5, .1, .6]); fin.rotation.x = side * -.2;
      spar(group, trim, [-1.25, -.08, side * (size.width * .5 + .52)], [.1, -.08, side * (size.width * .5 + .52)], .035);
    }
  }
  return group;
}

function makeFallback(host, view) {
  const ship = AIRSHIPS.find(item => item.id === view?.shipId) || AIRSHIPS[0];
  const hull = lookFor(view?.modifications?.hull, 'hull'), sail = lookFor(view?.modifications?.sails, 'sails'), flag = lookFor(view?.modifications?.flag, 'flag');
  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;min-height:280px;display:grid;place-items:center;';
  // All interpolated colors are catalogue constants; no player content enters SVG.
  wrap.innerHTML = `<svg viewBox="0 0 520 320" width="100%" style="max-height:350px" role="img" aria-label="Luftschiff-Vorschau"><ellipse cx="260" cy="280" rx="178" ry="15" fill="#7ce2cf" opacity=".09"/><path d="M75 205L445 205L392 263L133 263Z" fill="${hull.primary}" stroke="${hull.accent}" stroke-width="5"/><path d="M82 204L445 204" stroke="#d8bc88" stroke-width="10"/><path d="M${ship.id === 'windling' ? 250 : 300} 210V44" stroke="#a78055" stroke-width="7"/><path d="M185 64H365L344 182Q275 164 196 187Z" fill="${sail.secondary}" stroke="${sail.primary}" stroke-width="5"/>${ship.id === 'windling' ? '' : `<path d="M161 204V75" stroke="#a78055" stroke-width="6"/><path d="M105 91H208L197 175H117Z" fill="${sail.secondary}" stroke="${sail.primary}" stroke-width="5"/>`}${ship.id === 'aetherarche' ? `<path d="M400 204V100" stroke="#a78055" stroke-width="5"/><path d="M365 112H448L439 180H370Z" fill="${sail.secondary}" stroke="${sail.primary}" stroke-width="5"/>` : ''}<path d="M120 204V125" stroke="#d8bc88" stroke-width="5"/><path d="M120 125L60 132L74 149L60 168L120 162Z" fill="${flag.primary}" stroke="${flag.accent}" stroke-width="2"/><path d="M267 105L286 124L267 143L248 124Z" fill="${sail.primary}"/><g fill="#a6e7de" stroke="${hull.accent}" stroke-width="3"><circle cx="163" cy="233" r="9"/><circle cx="217" cy="233" r="9"/><circle cx="271" cy="233" r="9"/><circle cx="325" cy="233" r="9"/><circle cx="379" cy="233" r="9"/></g></svg>`;
  host.append(wrap); host.dataset.renderState = 'fallback';
  const status = document.createElement('p'); status.textContent = `${ship.name} · 2D-Vorschau`; status.style.cssText = 'margin:0;text-align:center;color:var(--ae-muted,#a7b8c8);font-size:.85rem;'; host.append(status);
  return { supported: false, rotate() {}, turn() {}, dispose() { wrap.remove(); status.remove(); delete host.dataset.renderState; } };
}

/** One interactive model. dispose() releases observers, listeners and GPU resources. */
export function mountAirship3D(host, shipView, opts = {}) {
  if (!host) return { supported: false, dispose() {}, rotate() {}, turn() {} };
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;min-height:280px;touch-action:pan-y;cursor:grab;';
  canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Dreidimensionales Luftschiff. Mit Ziehen oder Pfeiltasten drehen.'); canvas.tabIndex = 0;
  let gl, renderer;
  try {
    gl = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' });
    if (!gl) return makeFallback(host, shipView);
    renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true });
  } catch {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return makeFallback(host, shipView);
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15; renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, .1, 40);
  scene.add(new THREE.HemisphereLight(0xfff2d5, 0x637997, 2.3));
  const sun = new THREE.DirectionalLight(0xffe1ad, 3); sun.position.set(-3, 6, 5); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x93e8df, 1.7); rim.position.set(3, 3, -4); scene.add(rim);
  const ship = makeShip(shipView); ship.rotation.y = -.32; scene.add(ship);
  const halo = mesh(scene, new THREE.TorusGeometry(2.3, .015, 4, 60), material(0x66baaf, { transparent: true, opacity: .3 }), [0, -.85, 0]); halo.rotation.x = Math.PI / 2;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false, lost = false, visible = true, raf = 0, lastFrame = 0, yaw = -.32, drag = null, fallback = null;
  function draw() { if (!disposed && !lost) renderer.render(scene, camera); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  function schedule() { if (!raf && !disposed && !lost && visible && !document.hidden && !reduced.matches) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    if (disposed || lost || !visible || document.hidden || reduced.matches) return;
    if (now - lastFrame > 32) {
      lastFrame = now; ship.rotation.y = yaw; ship.rotation.z = Math.sin(now * .0009) * .012;
      ship.position.y = Math.sin(now * .0012) * .055; draw();
    }
    schedule();
  }
  function rotate(direction) { yaw += typeof direction === 'number' ? direction : direction === 'left' ? -.28 : .28; ship.rotation.y = yaw; draw(); }
  function resize() {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth), height = Math.max(280, Math.min(440, width * .65));
    renderer.setSize(width, height, false); canvas.style.height = `${height}px`;
    camera.aspect = width / height;
    const narrow = Math.max(1, 1.25 / camera.aspect), distance = (shipView?.shipId === 'aetherarche' ? 8.8 : 7.6) * narrow;
    camera.position.set(distance * .26, distance * .36 + .4, distance); camera.lookAt(0, 1, 0); camera.updateProjectionMatrix(); draw();
  }
  function down(event) { if (event.button !== 0 || event.isPrimary === false) return; drag = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null }; }
  function move(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 7) drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (drag.axis === 'x') { canvas.setPointerCapture?.(event.pointerId); rotate(dx * .012); drag.x = event.clientX; drag.y = event.clientY; }
  }
  function up(event) { if (drag?.id === event.pointerId) drag = null; if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId); }
  function key(event) { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); rotate(event.key === 'ArrowLeft' ? -.25 : .25); } }
  function motion() { stop(); ship.position.y = 0; ship.rotation.z = 0; draw(); schedule(); }
  function visibility() { if (document.hidden) stop(); else { draw(); schedule(); } }
  function contextLost(event) { event.preventDefault(); lost = true; stop(); canvas.hidden = true; canvas.style.display = 'none'; fallback = makeFallback(host, shipView); }
  function contextRestored() { if (disposed) return; lost = false; fallback?.dispose(); fallback = null; canvas.hidden = false; canvas.style.display = 'block'; host.dataset.renderState = 'ready'; draw(); schedule(); }
  const controls = document.createElement('div'); controls.style.cssText = 'display:flex;justify-content:center;gap:8px;margin:4px 0 8px;';
  for (const [label, amount] of [['Nach links drehen', -.28], ['Nach rechts drehen', .28]]) {
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', label);
    button.textContent = amount < 0 ? '↶' : '↷'; button.style.cssText = 'min-width:44px;min-height:44px;border:1px solid var(--ae-line,#2b3d51);border-radius:12px;background:var(--ae-surface,#141e30);color:var(--ae-text,#eef3f7);font-size:22px;';
    button.addEventListener('click', event => { event.stopPropagation(); rotate(amount); }); controls.append(button);
  }
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('keydown', key); canvas.addEventListener('webglcontextlost', contextLost); canvas.addEventListener('webglcontextrestored', contextRestored);
  document.addEventListener('visibilitychange', visibility); reduced.addEventListener('change', motion);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
  const intersectionObserver = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting !== false; if (visible) { draw(); schedule(); } else stop(); }); intersectionObserver.observe(host);
  host.append(canvas, controls); host.dataset.renderState = 'ready'; resize(); schedule();
  return {
    supported: true, rotate, turn: rotate,
    dispose() {
      if (disposed) return; disposed = true; stop(); fallback?.dispose();
      resizeObserver.disconnect(); intersectionObserver.disconnect(); document.removeEventListener('visibilitychange', visibility); reduced.removeEventListener('change', motion);
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('keydown', key); canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored);
      const geometries = new Set(), materials = new Set();
      scene.traverse(node => { if (node.geometry) geometries.add(node.geometry); for (const mat of Array.isArray(node.material) ? node.material : [node.material]) if (mat) materials.add(mat); });
      for (const geometry of geometries) geometry.dispose(); for (const mat of materials) mat.dispose();
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); controls.remove(); delete host.dataset.renderState;
    },
  };
}
