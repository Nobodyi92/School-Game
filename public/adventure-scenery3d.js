import * as THREE from './vendor/three.module.min.js';

const TAU = Math.PI * 2;
const KINDS = ['tower', 'island', 'golem'];
const ENCOUNTERS = ['route', 'combat', 'puzzle', 'event', 'camp', 'treasure', 'guardian'];
const FEATURES = ['route', 'cave', 'thorns', 'spring', 'grove', 'lighthouse', 'bay', 'ruins', 'gate', 'heart', 'bridge', 'trader', 'scout'];
const PHASES = ['choice', 'route', 'combat', 'puzzle', 'event', 'camp', 'treasure', 'guardian', 'boon', 'finish'];
const STATUSES = ['active', 'choice', 'completed', 'banked', 'lost', 'abandoned'];
const bounded = (value, max) => Math.max(1, Math.min(max, Math.floor(Number(value) || 1)));

// Renderer context describes the saved adventure; it never changes its progress.
export function normalizeAdventureEnvironment(value) {
  if (!value || !KINDS.includes(value.kind)) return null;
  return { kind: value.kind, floor: bounded(value.floor, 10), station: bounded(value.station, 7),
    phase: PHASES.includes(value.phase) ? value.phase : 'choice',
    encounterKind: ENCOUNTERS.includes(value.encounterKind) ? value.encounterKind : 'route',
    feature: FEATURES.includes(value.feature) ? value.feature : 'route',
    status: STATUSES.includes(value.status) ? value.status : 'active' };
}

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .88, flatShading: true, ...extra });
}
function mesh(parent, geometry, material, at = [0, 0, 0], scale) {
  const node = new THREE.Mesh(geometry, material); node.position.set(...at);
  if (scale) node.scale.set(...scale);
  node.receiveShadow = true; parent.add(node); return node;
}
function box(parent, material, at, size) { return mesh(parent, new THREE.BoxGeometry(...size), material, at); }
function cylinder(parent, material, at, top, bottom, height, sides = 8) {
  return mesh(parent, new THREE.CylinderGeometry(top, bottom, height, sides), material, at);
}
function instanceBoxes(parent, material, entries) {
  if (!entries.length) return;
  const node = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, entries.length);
  const transform = new THREE.Object3D();
  entries.forEach(([at, size, rotation = 0], index) => {
    transform.position.set(...at); transform.scale.set(...size); transform.rotation.set(0, rotation, 0);
    transform.updateMatrix(); node.setMatrixAt(index, transform.matrix);
  });
  node.receiveShadow = true; parent.add(node);
}
function crystal(parent, material, at, size = .4) {
  const node = mesh(parent, new THREE.OctahedronGeometry(size, 0), material, at);
  node.scale.set(.65, 1.8, .65); node.rotation.z = at[0] * .05; return node;
}
function arch(parent, at, width, height, stone, inset) {
  const group = new THREE.Group(); group.position.set(...at); parent.add(group);
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0); shape.lineTo(-width / 2, height - width / 2);
  shape.absarc(0, height - width / 2, width / 2, Math.PI, 0, true);
  shape.lineTo(width / 2, 0); shape.closePath();
  mesh(group, new THREE.ShapeGeometry(shape, 10), inset, [0, 0, -.01]);
  for (const side of [-1, 1]) box(group, stone, [side * (width / 2 + .07), (height - width / 2) / 2, .02], [.15, height - width / 2, .15]);
  const rim = mesh(group, new THREE.TorusGeometry(width / 2 + .07, .09, 4, 14, Math.PI), stone, [0, height - width / 2, .02]);
  // Upper semicircle; its open side meets the two stone uprights.
  rim.rotation.z = 0;
  return group;
}
function torch(parent, at, iron, fire) {
  cylinder(parent, iron, [at[0], at[1] - .24, at[2]], .06, .09, .48, 6);
  const flame = mesh(parent, new THREE.OctahedronGeometry(.19), fire, at); flame.scale.set(.7, 1.5, .7);
  const glow = new THREE.PointLight(0xffae58, 1.4, 3.8, 2); glow.position.set(...at); parent.add(glow);
}
function tree(parent, at, scale, wood, leaves) {
  cylinder(parent, wood, [at[0], at[1] + .45 * scale, at[2]], .08 * scale, .12 * scale, .9 * scale, 5);
  for (const [height, radius] of [[.95, .48], [1.35, .34]]) {
    mesh(parent, new THREE.ConeGeometry(radius * scale, .85 * scale, 6), leaves, [at[0], at[1] + height * scale, at[2]]);
  }
}

function tower(parent, env) {
  const high = env.floor > 6, summit = env.floor === 10;
  const stone = mat(high ? 0x445264 : 0x495563), lightStone = mat(high ? 0x667482 : 0x69717a);
  const dark = mat(0x222d40), gold = mat(0xc4a769, { metalness: .25 });
  const rune = mat(summit ? 0xc8a8f4 : high ? 0x8db3eb : 0x79d7d0, { emissive: high ? 0x526eae : 0x3f9b92, emissiveIntensity: .65 });
  const fire = mat(0xffd48b, { emissive: 0xfaa04b, emissiveIntensity: 1 });
  box(parent, dark, [0, -.17, -.1], [8.5, .34, 6.9]);
  const tiles = [[], []];
  for (let x = -4; x <= 4; x++) for (let z = -3; z <= 3; z++) {
    tiles[(x + z + 14) % 2].push([[x * .91, .012, z * .91], [.875, .035, .875]]);
  }
  instanceBoxes(parent, stone, tiles[0]); instanceBoxes(parent, lightStone, tiles[1]);
  const blocks = [[], []];
  for (let row = 0; row < 5; row++) for (let col = 0; col < 12; col++) {
    const x = (col - 5.5) * .73 + (row % 2 ? .19 : 0);
    blocks[(row + col) % 2].push([[x, .37 + row * .72, -3.18], [.7, .69, .34]]);
  }
  // Short side returns frame an indoor room while leaving the camera side open.
  for (const side of [-1, 1]) for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) {
    blocks[(row + col) % 2].push([[side * 4.28, .37 + row * .72, -2.8 + col * .68], [.32, .69, .65]]);
  }
  instanceBoxes(parent, stone, blocks[0]); instanceBoxes(parent, lightStone, blocks[1]);
  box(parent, lightStone, [0, 3.68, -3.13], [8.85, .24, .5]);
  for (const x of [-3.65, 3.65]) {
    cylinder(parent, lightStone, [x, 1.8, -2.85], .18, .23, 3.6, 8);
    box(parent, gold, [x, .18, -2.85], [.59, .18, .58]);
    box(parent, gold, [x, 3.46, -2.85], [.53, .14, .55]);
  }
  const window = mat(high ? 0x708ab5 : 0x365d77, { emissive: high ? 0x7087a9 : 0x2d6470, emissiveIntensity: .5 });
  for (const x of [-2.4, 2.4]) {
    arch(parent, [x, 1.15, -2.97], .9, 1.75, gold, window);
    box(parent, lightStone, [x, 1.9, -2.81], [.055, 1.42, .07]);
    box(parent, lightStone, [x, 1.85, -2.81], [.85, .055, .07]);
  }
  arch(parent, [0, .08, -2.95], 1.32, 2.65, lightStone, dark);
  for (let i = 0; i < 4; i++) box(parent, stone, [0, .06 + i * .09, -2.14 - i * .2], [1.5, .12 + i * .16, .28]);
  crystal(parent, rune, [0, 2.82, -2.72], .24);
  for (const x of [-1.42, 1.42]) torch(parent, [x, 2.12, -2.82], gold, fire);
  const cloth = mat(summit ? 0x665085 : high ? 0x3d627d : 0x39635f);
  for (const x of [-3.45, 3.45]) {
    box(parent, gold, [x, 3.12, -2.66], [.65, .07, .1]);
    box(parent, cloth, [x, 2.58, -2.64], [.53, 1, .04]);
    crystal(parent, rune, [x, 2.62, -2.59], .10);
  }
  // Ten inset markers on the threshold show the same ascent as the saved floor.
  for (let i = 0; i < 10; i++) box(parent, i < env.floor ? rune : dark, [(i - 4.5) * .32, .046, 2.35], [.19, .025, .15]);
  return { label: `Turmraum · Etage ${env.floor}`, ambient: 0xb6c5dc, background: 0x101b2a };
}

function floatingIsland(parent, at, radius, seed, grass, rock) {
  const group = new THREE.Group(); group.position.set(...at); parent.add(group);
  const count = 8, vertices = [];
  for (let i = 0; i < count; i++) {
    const angle = i / count * TAU;
    const varied = radius * (1 + Math.sin(i * 8.3 + seed * 3.2) * .11);
    vertices.push(new THREE.Vector3(Math.cos(angle) * varied, -.04, Math.sin(angle) * varied * .8));
  }
  const top = [], sides = [], bottom = new THREE.Vector3(radius * .12, -radius * .77, 0);
  for (let i = 0; i < count; i++) {
    const a = vertices[i], b = vertices[(i + 1) % count];
    top.push(0, .01, 0, ...b.toArray(), ...a.toArray());
    const lowA = new THREE.Vector3(a.x * .56, -radius * .48, a.z * .57);
    const lowB = new THREE.Vector3(b.x * .56, -radius * .48, b.z * .57);
    sides.push(...a.toArray(), ...b.toArray(), ...lowA.toArray(), ...b.toArray(), ...lowB.toArray(), ...lowA.toArray(), ...lowA.toArray(), ...lowB.toArray(), ...bottom.toArray());
  }
  for (const [positions, material] of [[top, grass], [sides, rock]]) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals(); mesh(group, geometry, material);
  }
  return group;
}

function currentRibbon(parent, color, z, y, width, offset = 0) {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-9, y + .45, z - 1), new THREE.Vector3(-4, y - .2, z + .25),
    new THREE.Vector3(0, y + .15, z), new THREE.Vector3(4, y + .38, z - .55), new THREE.Vector3(9, y, z - .2),
  ]);
  const glow = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .42, depthWrite: false, toneMapped: false });
  const ribbon = mesh(parent, new THREE.TubeGeometry(path, 28, width, 4, false), glow); ribbon.position.y += offset;
  const curtain = [];
  for (let index = 0; index < 28; index++) {
    const a = path.getPoint(index / 28), b = path.getPoint((index + 1) / 28);
    const heightA = .7 + Math.sin(index * .41) * .22, heightB = .7 + Math.sin((index + 1) * .41) * .22;
    curtain.push(a.x, a.y, a.z, b.x, b.y, b.z, a.x, a.y + heightA, a.z,
      b.x, b.y, b.z, b.x, b.y + heightB, b.z, a.x, a.y + heightA, a.z);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(curtain, 3)); geometry.computeVertexNormals();
  const light = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .18, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const sheet = mesh(parent, geometry, light); sheet.position.y += offset;
  return ribbon;
}

function islands(parent, env, arena) {
  const final = env.station === 7 || env.encounterKind === 'guardian';
  const grasses = [0x719a77, 0x76a68b, 0x789d85, 0x6e9e99, 0x8ca783, 0x6a9390, 0x739790];
  const grass = mat(grasses[env.station - 1]), rock = mat(final ? 0x5d637d : 0x596b7c), wood = mat(0x705544);
  const leaves = mat(env.station > 4 ? 0x5b8d83 : 0x548d70), gold = mat(0xd4bf82, { metalness: .22 });
  const glow = mat(0xa7e7db, { emissive: 0x64bfbc, emissiveIntensity: .7 });
  const stone = mat(0x9ba8a4);
  const main = floatingIsland(parent, [0, -.02, 0], arena ? 3.7 : 2.9, env.station, grass, rock);
  // Distant stepping islands share the same aerial current, not a ground river.
  const satellites = [[-5.4, .7, -4.5, 1.45], [-2.5, 1.6, -7, .9], [2.3, 1, -6.6, 1.15], [5.1, .3, -4.3, 1.6], [6.8, 1.7, -8.5, .8]];
  satellites.forEach(([x, y, z, radius], index) => {
    const fragment = floatingIsland(parent, [x, y, z], radius, index + 4, grass, rock);
    if (index % 2 === 0) tree(fragment, [0, 0, -.2], radius * .55, wood, leaves);
    else crystal(fragment, glow, [0, radius * .4, 0], radius * .22);
  });
  currentRibbon(parent, 0x70d7c6, -4.1, -1, .13);
  currentRibbon(parent, 0xa6a5ed, -5.0, -.9, .19, .3);
  currentRibbon(parent, 0xa0ebd5, -5.8, -.65, .055, .5);
  const reach = arena ? 2.55 : 1.9;
  const kind = env.encounterKind;
  if (['camp', 'event'].includes(kind) || (!final && env.station % 3 === 2)) {
    tree(main, [-reach, .02, -1.0], .95, wood, leaves);
    tree(main, [reach, .02, -1.4], .7, wood, leaves);
    if (kind === 'camp') {
      const tent = mesh(main, new THREE.ConeGeometry(.65, .8, 3), mat(0xcbb782), [reach - .5, .4, -.9]); tent.rotation.y = Math.PI / 6;
      box(main, wood, [reach - .5, .12, -.45], [.75, .24, .1]);
    }
  }
  if (['puzzle', 'treasure'].includes(kind) || env.station === 3 || env.station === 6) {
    for (const side of [-1, 1]) {
      const column = box(main, stone, [side * (reach - .35), .67, -1.35], [.45, 1.34, .43]); column.rotation.z = side * .09;
      crystal(main, glow, [side * (reach - .35), 1.45, -1.35], .19);
    }
    if (kind === 'treasure') {
      box(main, wood, [0, .24, -1.7], [.74, .44, .48]);
      box(main, gold, [0, .26, -1.43], [.12, .45, .045]);
    }
  }
  if (final) {
    arch(main, [0, .04, -2.15], 1.7, 2.8, stone, mat(0x477b82, { transparent: true, opacity: .4, emissive: 0x477b82, emissiveIntensity: .4 }));
    for (const side of [-1, 1]) crystal(main, glow, [side * 2.3, .62, -1.8], .38);
  } else if (kind === 'combat') {
    for (const side of [-1, 1]) crystal(main, glow, [side * reach, .32, -1.2], .21);
  } else if (kind === 'route') {
    for (let i = 0; i < 4; i++) box(main, gold, [(i - 1.5) * .5, .035, -1.1], [.28, .02, .16]);
  }
  // These small landmarks follow the selected route/encounter supplied by the UI.
  // They sit behind the fighters; the camera side and combat lane stay open.
  const feature = env.feature;
  if (feature === 'cave') {
    for (const side of [-1, 1]) {
      const flank = mesh(main, new THREE.DodecahedronGeometry(.95, 0), rock, [side * (arena ? 2.7 : 2.0), 1.0, -1.8], [1, 1.6, .7]);
      flank.rotation.z = side * -.15;
      crystal(main, glow, [side * (arena ? 2.3 : 1.55), .58, -1.25], .31);
    }
    const crown = mesh(main, new THREE.DodecahedronGeometry(1, 0), rock, [0, 2.5, -2.65], [arena ? 3 : 2.2, .68, .62]); crown.rotation.z = .04;
    for (const x of [-.8, .45, 1.15]) crystal(main, glow, [x, .35, -2.1], .22);
  } else if (feature === 'spring' || feature === 'bay') {
    const x = reach - .3, z = -1.35;
    cylinder(main, stone, [x, .06, z], .66, .73, .16, 10);
    cylinder(main, new THREE.MeshBasicMaterial({ color: 0x79d9cf, transparent: true, opacity: .75, toneMapped: false }), [x, .15, z], .55, .55, .025, 16);
    const rim = mesh(main, new THREE.TorusGeometry(.61, .09, 5, 14), stone, [x, .16, z]); rim.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) box(main, stone, [x + side * .55, .28, z - .35], [.18, .5, .22]);
  } else if (feature === 'lighthouse') {
    const x = -reach + .1, z = -1.3;
    cylinder(main, stone, [x, .85, z], .27, .43, 1.7, 8);
    cylinder(main, gold, [x, 1.72, z], .39, .39, .13, 8);
    cylinder(main, glow, [x, 1.93, z], .22, .22, .35, 6);
    mesh(main, new THREE.ConeGeometry(.43, .36, 8), mat(0x657a8e), [x, 2.25, z]);
    box(main, wood, [x, .33, z + .39], [.22, .57, .045]);
  } else if (feature === 'bridge') {
    const end = floatingIsland(parent, [0, .02, -5.15], .95, 29, grass, rock);
    crystal(end, glow, [0, .28, -.15], .15);
    for (let index = 0; index < 9; index++) {
      if (index === 4) continue;
      const plank = box(main, wood, [0, .10 - Math.sin(index / 8 * Math.PI) * .18, -2.2 - index * .31], [1, .07, .22]);
      plank.rotation.z = index === 5 ? -.12 : 0;
    }
    for (const side of [-1, 1]) {
      const ropePath = new THREE.CatmullRomCurve3([new THREE.Vector3(side * .52, .7, -2.2), new THREE.Vector3(side * .52, .42, -3.45), new THREE.Vector3(side * .52, .7, -4.7)]);
      mesh(main, new THREE.TubeGeometry(ropePath, 10, .025, 4, false), gold);
      for (const z of [-2.2, -4.7]) cylinder(main, wood, [side * .52, .4, z], .035, .035, .8, 5);
    }
  } else if (feature === 'trader') {
    const x = -reach + .25, z = -1.35;
    for (const side of [-1, 1]) cylinder(main, wood, [x + side * .43, .63, z], .035, .035, 1.26, 5);
    const awning = box(main, mat(0xb69464), [x, 1.32, z], [1.2, .07, .9]); awning.rotation.x = -.18;
    box(main, wood, [x, .32, z + .1], [1.0, .58, .42]);
    box(main, gold, [x, .34, z + .32], [.12, .48, .025]);
  } else if (feature === 'grove' || feature === 'thorns' || feature === 'scout') {
    tree(main, [-reach, .02, -1.5], .85, wood, leaves);
    tree(main, [reach, .02, -1.45], .72, wood, leaves);
    if (feature === 'thorns') for (const side of [-1, 1]) {
      const root = mesh(main, new THREE.ConeGeometry(.23, .85, 5), wood, [side * (reach - .2), .27, -.8]); root.rotation.z = side * -.7;
    }
  } else if (['ruins', 'gate', 'heart'].includes(feature) && !final) {
    arch(main, [0, .035, -1.85], 1.3, 2.05, stone, mat(0x477b82, { transparent: true, opacity: .25, emissive: 0x477b82, emissiveIntensity: .3 }));
  }
  for (let i = 0; i < 8; i++) {
    const x = Math.sin(i * 4.7 + env.station) * 7;
    crystal(parent, glow, [x, -.6 + Math.cos(i * 2.3) * .8, -2 - i * .6], .045 + (i % 2) * .02);
  }
  return { label: `Schwebende Inseln · Station ${env.station}`, ambient: 0xc6e9e2, background: 0x1a3449 };
}

function mines(parent) {
  const rock = mat(0x46536c), darker = mat(0x303e56), floor = mat(0x5a6573), timber = mat(0x715e4c);
  const crystalBlue = mat(0x8cd9ec, { emissive: 0x4a8cb6, emissiveIntensity: .65, metalness: .15 });
  const crystalPurple = mat(0xbea1e8, { emissive: 0x7b5ab5, emissiveIntensity: .6 });
  cylinder(parent, darker, [0, -.27, -.2], 5.45, 5.65, .54, 10);
  cylinder(parent, floor, [0, .015, -.2], 5.32, 5.32, .04, 10);
  for (let i = 0; i < 11; i++) {
    const angle = Math.PI + i / 10 * Math.PI;
    const x = Math.cos(angle) * 5.0, z = Math.sin(angle) * 3.5 - 1.0;
    const boulder = mesh(parent, new THREE.DodecahedronGeometry(1.1 + (i % 3) * .21, 0), i % 2 ? rock : darker, [x, 1.4, z], [1, 1.65, .75]);
    boulder.rotation.set(i * .19, i * .7, i * .12);
  }
  for (const x of [-3.5, 3.5]) {
    box(parent, timber, [x, 1.8, -3.0], [.3, 3.7, .35]);
    const brace = box(parent, timber, [x * .87, 3.1, -3.0], [.23, 1.6, .25]); brace.rotation.z = Math.sign(x) * -.7;
  }
  box(parent, timber, [0, 3.65, -3.0], [7.4, .32, .4]);
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? -1 : 1;
    crystal(parent, i % 3 ? crystalBlue : crystalPurple, [side * (3.1 + (i % 3) * .5), .45 + (i % 3) * .2, -1.2 - (i % 4) * .55], .25 + (i % 3) * .12);
  }
  for (const side of [-1, 1]) {
    box(parent, crystalBlue, [side * .8, .046, -2.45], [.12, .025, .8]);
    box(parent, crystalPurple, [side * 1.1, .046, -2.45], [.25, .025, .12]);
  }
  return { label: 'Kristallminen · Kammer des Runengolems', ambient: 0xb1c8f0, background: 0x122135 };
}

/** Build a complete static diorama. The owning renderer disposes it with its scene. */
export function makeAdventureScenery(scene, value, { arena = false } = {}) {
  const environment = normalizeAdventureEnvironment(value);
  if (!environment) return null;
  const group = new THREE.Group(); group.name = `adventure-${environment.kind}`; scene.add(group);
  const look = environment.kind === 'tower' ? tower(group, environment)
    : environment.kind === 'island' ? islands(group, environment, arena) : mines(group);
  scene.background = new THREE.Color(look.background);
  return { ...look, kind: environment.kind, group };
}
