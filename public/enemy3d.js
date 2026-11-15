import * as THREE from './vendor/three.module.min.js';
import { NPC_TYPES, enemyVisualFor } from '../shared/enemies.js';

// Enemy outfits are scenery, not player equipment or ancestry bonuses.
const LOOKS = {
  bandit: { skin: 0xc69573, cloth: 0x58624c, leather: 0x70513e, trim: 0xc3ac77, metal: 0x9099a2, hair: 0x45362e, eyes: 0x362f2a },
  mage: { skin: 0xd5b5a0, cloth: 0x52638c, leather: 0x37465e, trim: 0xc7b67b, metal: 0x91b7ce, hair: 0xb7b4b3, eyes: 0x78cbd7 },
  'dark-mage': { skin: 0xc1b0b3, cloth: 0x38304e, leather: 0x24273c, trim: 0x9c7fb5, metal: 0x83799b, hair: 0x39313e, eyes: 0xc19cec },
  'tide-guardian': { skin: 0xaac4c7, cloth: 0x3c717a, leather: 0x344d62, trim: 0xc1caa0, metal: 0x779da5, hair: 0xd8ddc7, eyes: 0x88e2d4 },
  'training-warden': { skin: 0xbd8b68, cloth: 0x557267, leather: 0x947452, trim: 0xd0bf8e, metal: 0xa6a895, hair: 0x514139, eyes: 0x3d443a },
};

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .86, metalness: .03, flatShading: true, ...extra });
function mesh(parent, geometry, material, position = [0, 0, 0], scale) {
  const node = new THREE.Mesh(geometry, material); node.position.set(...position);
  if (scale) node.scale.set(...scale);
  node.castShadow = true; node.receiveShadow = true; parent.add(node); return node;
}
const box = (parent, material, position, size) => mesh(parent, new THREE.BoxGeometry(...size), material, position);
const sphere = (parent, material, position, scale) => mesh(parent, new THREE.SphereGeometry(1, 8, 6), material, position, scale);
const cylinder = (parent, material, position, top, bottom, height, sides = 8) => mesh(parent, new THREE.CylinderGeometry(top, bottom, height, sides), material, position);

function blade(arm, wood, steel, trim, practice = false) {
  const group = new THREE.Group(); group.position.set(0, -.68, .14); group.rotation.z = -.13; arm.add(group);
  box(group, wood, [0, -.04, 0], [.09, .26, .10]);
  box(group, practice ? wood : trim, [0, .12, 0], [.40, .075, .12]);
  box(group, practice ? wood : steel, [0, .49, 0], [.16, .69, .07]);
  const tip = mesh(group, new THREE.ConeGeometry(.11, .18, 4), practice ? wood : steel, [0, .92, 0]); tip.rotation.y = Math.PI / 4;
  sphere(group, trim, [0, -.19, 0], [.075, .075, .075]);
}
function shield(arm, wood, trim, steel) {
  const group = new THREE.Group(); group.position.set(0, -.56, .19); arm.add(group);
  const plate = cylinder(group, wood, [0, .05, .06], .32, .32, .10, 8); plate.rotation.x = Math.PI / 2;
  box(group, trim, [0, .05, .125], [.045, .56, .03]);
  box(group, trim, [0, .05, .13], [.56, .045, .03]);
  sphere(group, steel, [0, .05, .17], [.10, .10, .045]);
}
function staff(arm, wood, trim, jewel, dark = false) {
  const group = new THREE.Group(); group.position.set(0, -.67, .13); group.rotation.z = -.11; arm.add(group);
  cylinder(group, wood, [0, .29, 0], .038, .055, 1.54, 7);
  cylinder(group, trim, [0, .95, 0], .115, .075, .13, 7);
  const gem = mesh(group, new THREE.OctahedronGeometry(dark ? .25 : .21), jewel, [0, 1.19, 0]); gem.scale.y = 1.35;
  for (const side of [-1, 1]) {
    const prong = cylinder(group, trim, [side * .17, 1.12, 0], .025, .045, .42, 5); prong.rotation.z = side * -.35;
  }
  if (dark) {
    const ring = mesh(group, new THREE.TorusGeometry(.31, .018, 4, 18), jewel, [0, 1.19, 0]); ring.rotation.y = .28;
  }
}

function face(head, look, skin, hair, eyes, hooded, cloth, trim, masked) {
  // Small round human ears, a forehead, nose and chin; no animal muzzle or tail.
  if (hooded) sphere(head, cloth, [0, .035, -.11], [.51, .62, .44]);
  sphere(head, skin, [0, -.045, .11], [.39, .48, .34]);
  if (!hooded) sphere(head, hair, [0, .27, .02], [.41, .25, .35]);
  for (const side of [-1, 1]) {
    sphere(head, skin, [side * .385, -.035, .09], [.075, .13, .07]);
    sphere(head, mat(0xe7e5dc), [side * .155, .045, .426], [.068, .062, .026]);
    sphere(head, eyes, [side * .155, .044, .449], [.035, .044, .017]);
    const brow = box(head, hair, [side * .155, .155, .418], [.15, .027, .025]); brow.rotation.z = side * -.12;
  }
  sphere(head, skin, [0, -.07, .458], [.060, .092, .073]);
  if (hooded) {
    const rim = mesh(head, new THREE.TorusGeometry(.405, .043, 5, 16), trim, [0, .015, .36]); rim.scale.set(.96, 1.25, .75);
  }
  if (masked) {
    box(head, cloth, [0, -.205, .428], [.62, .22, .075]);
    const seam = box(head, trim, [0, -.15, .469], [.58, .022, .015]); seam.rotation.z = -.045;
  } else box(head, mat(0x8c655e), [0, -.29, .419], [.13, .022, .018]);
}

/** Return the same articulated rig shape used by the player and combat renderer. */
export function makeEnemy3D(hero = {}) {
  if (!NPC_TYPES.includes(hero.npcType)) return null;
  const descriptor = enemyVisualFor(hero);
  if (!descriptor) return null;
  const type = descriptor.npcType, variant = descriptor.npcVariant;
  const look = { ...LOOKS[type] };
  if (type === 'bandit' && variant === 'brute') Object.assign(look, { cloth: 0x714f43, leather: 0x805b41, skin: 0xb98764 });
  if (type === 'bandit' && variant === 'captain') Object.assign(look, { cloth: 0x66434c, leather: 0x3c4658, skin: 0xd1a080 });
  if (type === 'mage' && variant === 'storm') Object.assign(look, { cloth: 0x545074, trim: 0xa8c7d9, eyes: 0x9dbfee });
  if (type === 'mage' && variant === 'archmage') Object.assign(look, { cloth: 0x664c84, trim: 0xddc894, eyes: 0xafa0ed });
  if (type === 'dark-mage' && variant === 'crystal') Object.assign(look, { cloth: 0x383b55, trim: 0x9fa9c5, eyes: 0xb2c9ee });
  const isMage = type === 'mage' || type === 'dark-mage';
  const guardian = type === 'tide-guardian', trainer = type === 'training-warden';
  const root = new THREE.Group(); root.userData = { heroId: String(hero.id || type), npcType: type, npcVariant: variant };
  const rig = { root, id: String(hero.id || type), arms: [], legs: [], materials: [], base: new THREE.Vector3() };
  const skin = mat(look.skin), cloth = mat(look.cloth), leather = mat(look.leather), hair = mat(look.hair);
  const trim = mat(look.trim, { metalness: .25 }), metal = mat(look.metal, { metalness: .42, roughness: .55 });
  const eyes = mat(look.eyes, isMage || guardian ? { emissive: look.eyes, emissiveIntensity: .28 } : {});
  const glow = mat(look.eyes, { emissive: look.eyes, emissiveIntensity: .60, roughness: .35 });
  const wood = mat(trainer ? 0xb69864 : 0x67503b), boots = mat(0x3e393a);
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * .23, .65, 0); root.add(leg);
    cylinder(leg, isMage ? cloth : leather, [0, -.17, 0], .13, .13, .45, 7);
    box(leg, boots, [0, -.49, .10], [.31, .24, .42]); rig.legs.push(leg);
  }
  cylinder(root, cloth, [0, 1.21, 0], .43, isMage ? .62 : .43, isMage ? 1.55 : 1.04, 8);
  cylinder(root, leather, [0, .94, 0], .45, .45, .12, 8); box(root, trim, [0, .94, .45], [.16, .12, .035]);
  cylinder(root, skin, [0, 1.88, .02], .21, .23, .22, 8);
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .56, 1.69, 0); arm.rotation.z = side * .1; root.add(arm);
    cylinder(arm, cloth, [0, -.26, 0], isMage ? .22 : .17, .14, .62, 7);
    sphere(arm, skin, [0, -.66, .03], [.15, .17, .15]); rig.arms.push(arm);
    if (isMage || guardian) {
      const edge = box(root, trim, [side * .20, 1.48, .385], [.055, .43, .035]); edge.rotation.z = side * -.22;
    }
  }
  const head = new THREE.Group(); head.position.y = 2.25; root.add(head); rig.head = head;
  face(head, look, skin, hair, eyes, !trainer, cloth, isMage ? leather : trim, type === 'bandit');
  if (type === 'bandit') {
    box(root, leather, [0, 1.39, .32], [.69, .67, .17]);
    const strap = box(root, trim, [0, 1.39, .421], [.055, .76, .027]); strap.rotation.z = -.62;
    box(root, leather, [-.36, 1.04, .36], [.22, .28, .18]);
    if (variant === 'brute') {
      for (const side of [-1, 1]) sphere(root, metal, [side * .52, 1.72, 0], [.25, .16, .27]);
      const club = new THREE.Group(); club.position.set(0, -.66, .14); rig.arms[0].add(club);
      cylinder(club, wood, [0, .28, 0], .08, .055, .96, 6); cylinder(club, metal, [0, .67, 0], .16, .15, .32, 6);
    } else blade(rig.arms[0], wood, metal, trim);
    if (variant === 'captain') {
      shield(rig.arms[1], leather, trim, metal);
      const cape = mesh(root, new THREE.ConeGeometry(.57, 1.36, 4), cloth, [0, 1.08, -.34]); cape.scale.z = .23;
    }
  } else if (isMage) {
    const cape = mesh(root, new THREE.ConeGeometry(.63, 1.56, 5), leather, [0, 1.13, -.34]); cape.scale.z = .25;
    if (type === 'mage') {
      const cap = mesh(head, new THREE.ConeGeometry(.49, variant === 'archmage' ? .67 : .42, 7), cloth, [0, .51, -.08]); cap.rotation.z = .08;
      box(head, trim, [0, .25, .418], [.48, .06, .035]);
    } else mesh(head, new THREE.OctahedronGeometry(.075), glow, [0, .24, .419]);
    mesh(root, new THREE.OctahedronGeometry(.105), glow, [0, 1.52, .45]);
    staff(rig.arms[0], wood, trim, glow, type === 'dark-mage');
    if (variant === 'archmage') {
      for (const side of [-1, 1]) sphere(root, trim, [side * .53, 1.74, 0], [.25, .13, .28]);
    }
  } else if (guardian) {
    box(root, metal, [0, 1.41, .33], [.73, .72, .19]);
    mesh(root, new THREE.OctahedronGeometry(.18), glow, [0, 1.49, .47]);
    for (const side of [-1, 1]) {
      const crystal = mesh(root, new THREE.OctahedronGeometry(.21), metal, [side * .55, 1.77, 0]); crystal.scale.y = 1.45;
      box(head, trim, [side * .16, .042, .485], [.20, .07, .025]);
    }
    const crest = mesh(head, new THREE.OctahedronGeometry(.16), glow, [0, .48, -.01]); crest.scale.y = 1.55;
    staff(rig.arms[0], metal, trim, glow); shield(rig.arms[1], cloth, trim, metal);
  } else {
    box(root, leather, [0, 1.40, .32], [.65, .59, .16]);
    const scarf = cylinder(root, trim, [0, 1.82, .02], .26, .30, .13, 8); scarf.rotation.z = -.08;
    box(head, cloth, [0, .23, .35], [.66, .10, .13]);
    blade(rig.arms[0], wood, wood, trim, true); shield(rig.arms[1], wood, trim, metal);
  }
  const seen = new Set();
  root.traverse(node => {
    if (node.isMesh && node.material?.color && !seen.has(node.material)) {
      seen.add(node.material); rig.materials.push({ mat: node.material, color: node.material.color.clone() });
    }
  });
  return rig;
}
