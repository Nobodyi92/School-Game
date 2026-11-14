import * as THREE from './vendor/three.module.min.js';
import { isAncestry } from './ancestries.js';

// All models are built locally from geometry. No models, textures or user data
// leave the browser; appearance and equipment come from the server's snapshots.
const PALETTES = {
  amber: [0xc59545, 0xf3d99e], violet: [0x8972b1, 0xe0d7f2],
  mint: [0x589e85, 0xd0e5d6], rose: [0xb96d85, 0xf0d4dc], sky: [0x628fb6, 0xd7e6f4],
};
const RARITY_COLORS = { common: 0xa6ae9c, rare: 0x548fc7, epic: 0x9c65c4, legendary: 0xe4b653 };
const FUR = { fox: 0xdf8c48, owl: 0x9582b1, dragon: 0x65a88c, cat: 0xb0947a };
const PEOPLE = {
  'aether-elf': { skin: 0xe9cbb6, hair: 0xe2e6cf, eyes: 0x69d3b3, scale: [.88, 1.05, .90] },
  'aether-engineer': { skin: 0xc89570, hair: 0x75503c, eyes: 0x71523c, scale: [1.07, .87, 1.02] },
  'cloud-warden': { skin: 0xc8deed, hair: 0xf2f7fc, eyes: 0x9bcbea, scale: [.95, 1.02, .95] },
  'sky-nomad': { skin: 0xb87c59, hair: 0x513d3a, eyes: 0x504c42, scale: [.96, 1, .96] },
  'aether-druid': { skin: 0xb4ba84, hair: 0x57744d, eyes: 0x9fd885, scale: [.95, 1.03, .96] },
  'aether-dusk': { skin: 0xc4a078, hair: 0x373343, eyes: 0x78d3c9, scale: [1.07, .98, 1.03] },
};
const COSMETIC_OUTFITS = {
  'outfit-starlight': [0x4c568f, 0xb9c7f4],
  'outfit-warden': [0x347e6c, 0xa5d7bf],
  'outfit-runekeeper': [0x7852a7, 0xd0b1ef],
  'outfit-pathfinder': [0x358e83, 0xf1ddaa],
};
const TAU = Math.PI * 2;

function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .79, metalness: .03, flatShading: true, ...extra });
}

function addMesh(parent, geometry, mat, position = [0, 0, 0], scale = null) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function sphere(parent, mat, position, scale, radius = 1, detail = 8) {
  return addMesh(parent, new THREE.SphereGeometry(radius, detail, 6), mat, position, scale);
}
function box(parent, mat, position, scale) {
  return addMesh(parent, new THREE.BoxGeometry(...scale), mat, position);
}
function cone(parent, mat, position, radius, height, sides = 5) {
  return addMesh(parent, new THREE.ConeGeometry(radius, height, sides), mat, position);
}
function cylinder(parent, mat, position, top, bottom, height, sides = 10) {
  return addMesh(parent, new THREE.CylinderGeometry(top, bottom, height, sides), mat, position);
}

function disposeObject(object) {
  const geometries = new Set();
  const materials = new Set();
  object.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const mat of (Array.isArray(node.material) ? node.material : [node.material])) if (mat) materials.add(mat);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const mat of materials) mat.dispose();
  object.removeFromParent();
}

function starGeometry(radius = .12, depth = .025) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 5;
    const length = i % 2 ? radius * .45 : radius;
    const x = Math.cos(angle) * length, y = Math.sin(angle) * length;
    if (i) shape.lineTo(x, y); else shape.moveTo(x, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
}

function equipmentFor(hero) {
  const items = new Map((hero.inventory?.items || []).map(item => [item.id, item]));
  return Object.fromEntries(['helmet', 'chest', 'hand1', 'hand2', 'necklace', 'ring'].map(slot =>
    [slot, hero.equipmentVisuals?.[slot] || items.get(hero.equipment?.[slot]) || null]));
}

function makeWeapon(parent, item, direction) {
  const group = new THREE.Group();
  group.position.set(0, -.68, .13);
  group.rotation.z = direction * -.15;
  parent.add(group);
  const color = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
  const metal = material(color, { metalness: .48, roughness: .34 });
  const gold = material(0xe9c46e, { metalness: .45 });
  if (item.type === 'shield') {
    const shield = cylinder(group, metal, [0, .15, .12], .34, .30, .12, 6);
    shield.rotation.x = Math.PI / 2;
    const boss = cylinder(group, gold, [0, .15, .21], .11, .11, .06, 8);
    boss.rotation.x = Math.PI / 2;
    box(group, gold, [0, .15, .19], [.045, .45, .04]);
  } else if (item.templateId?.includes('rune')) {
    cylinder(group, material(0x826846), [0, .27, 0], .035, .045, 1.3, 6);
    const gem = addMesh(group, new THREE.OctahedronGeometry(.19), metal, [0, 1.02, 0]);
    gem.rotation.z = .2;
    cylinder(group, gold, [0, .82, 0], .10, .06, .13, 6);
  } else {
    box(group, material(0x6b4c39), [0, -.03, 0], [.09, .29, .10]);
    box(group, gold, [0, .12, 0], [.42, .07, .12]);
    box(group, metal, [0, .49, 0], [.14, .69, .06]);
    const tip = cone(group, metal, [0, .91, 0], .10, .19, 4);
    tip.rotation.y = Math.PI / 4;
    sphere(group, gold, [0, -.20, 0], [.09, .09, .09]);
  }
}

function selectedCosmetic(hero, type) {
  const selected = hero.cosmetics?.selected?.[type];
  return Array.isArray(hero.cosmetics?.owned) && hero.cosmetics.owned.includes(selected) ? selected : null;
}

function makeCompanion(parent, id) {
  if (!['pet-firefly', 'pet-cloud', 'pet-rune', 'pet-tide'].includes(id)) return null;
  const group = new THREE.Group();
  group.position.set(.99, 1.64, .14);
  group.userData.cosmetic = id;
  parent.add(group);
  const eyes = material(0x343044);
  if (id === 'pet-tide') {
    const water = material(0x71cec6, { emissive: 0x246c78, emissiveIntensity: .35, transparent: true, opacity: .92 });
    sphere(group, water, [0, 0, 0], [.22, .25, .19]);
    const crest = cone(group, water, [.02, .22, 0], .14, .24, 7); crest.rotation.z = -.35;
    for (const side of [-1, 1]) {
      sphere(group, eyes, [side * .075, .02, .17], [.027, .037, .018]);
      sphere(group, material(0xd8f7e7), [side * .075 + .008, .034, .184], [.009, .012, .009]);
      sphere(group, water, [side * .28, -.08, 0], [.12, .07, .05]);
    }
    const tide = addMesh(group, new THREE.TorusGeometry(.31, .018, 5, 20), material(0xc7eee4));
    tide.rotation.x = 1.25;
  } else if (id === 'pet-cloud') {
    const cloud = material(0xe2eef6);
    sphere(group, cloud, [0, 0, 0], [.25, .18, .18]);
    sphere(group, cloud, [-.16, -.04, 0], [.16, .13, .14]);
    sphere(group, cloud, [.16, -.04, 0], [.17, .13, .14]);
    sphere(group, cloud, [-.07, .10, 0], [.18, .16, .16]);
    for (const side of [-1, 1]) sphere(group, eyes, [side * .075, -.015, .17], [.025, .035, .016]);
    const tear = cone(group, material(0xa5cce5), [0, -.25, .02], .035, .16, 5);
    tear.rotation.z = -.12;
  } else if (id === 'pet-firefly') {
    const light = material(0xf1cf66, { emissive: 0xb29a36, emissiveIntensity: .65 });
    sphere(group, light, [0, 0, 0], [.14, .17, .13]);
    for (const side of [-1, 1]) {
      const wing = sphere(group, material(0xe4f1e6, { transparent: true, opacity: .78 }),
        [side * .15, .03, -.02], [.16, .08, .025]);
      wing.rotation.z = side * .45;
      sphere(group, eyes, [side * .047, .03, .12], [.02, .026, .014]);
    }
    const halo = addMesh(group, new THREE.TorusGeometry(.25, .012, 4, 18), light);
    halo.rotation.y = .45;
  } else {
    const stone = material(0x9d82d0, { emissive: 0x644097, emissiveIntensity: .45, metalness: .15 });
    const rune = addMesh(group, new THREE.OctahedronGeometry(.22), stone);
    rune.rotation.z = Math.PI / 5;
    box(group, material(0xf4d88a, { emissive: 0xa88a31, emissiveIntensity: .4 }), [0, .015, .19], [.045, .20, .025]);
    box(group, material(0xf4d88a), [.04, .055, .19], [.12, .035, .025]);
    const halo = addMesh(group, new THREE.TorusGeometry(.32, .015, 4, 20), material(0xc4b4e5));
    halo.rotation.x = .55;
  }
  return { group, y: group.position.y };
}

function makeGolem(hero = {}) {
  const root = new THREE.Group();
  root.userData.heroId = String(hero.id || 'rune-golem');
  const stone = material(0x7c878e, { roughness: .94 });
  const darkStone = material(0x505a68);
  const pale = material(0xb0b6bc);
  const rune = material(0xa993df, { emissive: 0x7654b0, emissiveIntensity: .85 });
  const gold = material(0xe4c575, { emissive: 0x8c7231, emissiveIntensity: .4 });
  const rig = { root, id: String(hero.id || 'rune-golem'), arms: [], legs: [], materials: [], base: new THREE.Vector3(), golem: true };
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * .39, .78, 0); root.add(leg);
    box(leg, stone, [0, -.20, 0], [.55, .75, .55]);
    box(leg, darkStone, [0, -.62, .12], [.65, .24, .78]);
    box(leg, rune, [0, -.18, .285], [.07, .40, .03]);
    rig.legs.push(leg);
    const arm = new THREE.Group(); arm.position.set(side * .97, 2.0, 0); root.add(arm);
    sphere(arm, pale, [0, -.03, 0], [.40, .38, .42], 1, 5);
    box(arm, stone, [0, -.45, 0], [.53, .72, .54]);
    box(arm, darkStone, [0, -.94, .08], [.63, .42, .66]);
    box(arm, rune, [0, -.40, .29], [.08, .40, .03]);
    rig.arms.push(arm);
  }
  box(root, stone, [0, 1.55, 0], [1.45, 1.35, .86]);
  box(root, darkStone, [0, 1.35, .45], [1.10, .28, .08]);
  const heart = addMesh(root, new THREE.OctahedronGeometry(.28), rune, [0, 1.79, .51]);
  heart.rotation.z = .3;
  for (const side of [-1, 1]) box(root, gold, [side * .46, 1.80, .46], [.06, .44, .04]);
  const head = new THREE.Group(); head.position.y = 2.60; root.add(head); rig.head = head;
  box(head, pale, [0, 0, 0], [.92, .77, .78]);
  for (const side of [-1, 1]) {
    box(head, darkStone, [side * .23, .06, .405], [.28, .15, .035]);
    box(head, rune, [side * .23, .07, .43], [.19, .06, .025]);
    const horn = cone(head, darkStone, [side * .40, .52, -.10], .14, .44, 4);
    horn.rotation.z = side * -.45;
  }
  box(head, darkStone, [0, -.19, .41], [.34, .06, .035]);
  const crown = addMesh(head, starGeometry(.14), gold, [0, .27, .41]); crown.rotation.z = .2;
  if (hero.shielded) {
    const ward = addMesh(root, new THREE.TorusGeometry(1.29, .026, 5, 32),
      material(0xb699df, { emissive: 0x7b56ac, emissiveIntensity: .8, transparent: true, opacity: .78 }), [0, 1.57, .10]);
    ward.rotation.x = Math.PI / 7;
    rig.ward = ward;
  }
  const seen = new Set();
  root.traverse(node => { if (node.isMesh && node.material?.color && !seen.has(node.material)) {
    seen.add(node.material); rig.materials.push({ mat: node.material, color: node.material.color.clone() });
  } });
  return rig;
}

function makePerson(head, body, type, skin, coat, pale, gold) {
  const look = PEOPLE[type];
  const hair = material(look.hair);
  const eyes = material(look.eyes, { emissive: look.eyes, emissiveIntensity: .35 });
  sphere(head, skin, [0, 0, 0], [.43, .55, .40]);
  sphere(head, hair, [0, .30, -.06], [.46, .33, .39]);
  for (const side of [-1, 1]) {
    sphere(head, skin, [side * .43, .015, 0], [.09, .15, .08]);
    sphere(head, eyes, [side * .17, .045, .37], [.055, .068, .031]);
    sphere(head, material(0xffffff), [side * .17 - .015, .066, .394], [.016, .021, .01]);
    const brow = box(head, hair, [side * .17, .17, .365], [.14, .032, .035]);
    brow.rotation.z = side * -.10;
    sphere(head, hair, [side * .36, .10, -.03], [.10, .36, .30]);
  }
  sphere(head, skin, [0, -.075, .40], [.065, .095, .08]);
  const mouth = material(0x8d665f);
  box(head, mouth, [0, -.28, .355], [.13, .025, .022]);
  if (type === 'aether-elf') {
    for (const side of [-1, 1]) {
      const ear = cone(head, skin, [side * .53, .10, -.015], .115, .43, 3);
      ear.rotation.z = side * -1.08;
      sphere(head, hair, [side * .34, -.24, -.16], [.12, .52, .25]);
    }
    const circlet = addMesh(head, new THREE.TorusGeometry(.43, .018, 5, 20), gold, [0, .21, 0]);
    circlet.rotation.x = Math.PI / 2;
    addMesh(head, new THREE.OctahedronGeometry(.095), eyes, [0, .19, .40]);
  } else if (type === 'aether-engineer') {
    for (const side of [-1, 1]) {
      addMesh(head, new THREE.TorusGeometry(.115, .038, 5, 12), gold, [side * .18, .28, .36]);
      sphere(head, material(0x91c1ce, { metalness: .4 }), [side * .18, .28, .36], [.09, .09, .025]);
    }
    box(head, gold, [0, .28, .38], [.13, .04, .04]);
    box(body, material(0x71513b), [-.39, 1.0, .31], [.20, .32, .14]);
    cylinder(body, gold, [-.39, 1.20, .32], .035, .035, .28, 6);
    addMesh(body, new THREE.TorusGeometry(.12, .04, 5, 8), gold, [.35, 1.10, .40]);
  } else if (type === 'cloud-warden') {
    for (let i = 0; i < 7; i++) {
      const angle = i / 7 * TAU;
      sphere(head, hair, [Math.cos(angle) * .34, .41 + (i % 2) * .09, Math.sin(angle) * .24], [.24, .20, .22]);
    }
    for (const side of [-1, 1]) {
      sphere(body, material(0xe3f3fc, { transparent: true, opacity: .42 }), [side * .53, .72, -.10], [.27, .13, .26]);
      addMesh(body, new THREE.OctahedronGeometry(.10), eyes, [side * .42, 1.71, .22]);
    }
  } else if (type === 'aether-druid') {
    for (let i = -2; i <= 2; i++) {
      const leaf = sphere(head, material(i % 2 ? 0x78a363 : 0x3f7a52), [i * .17, .43 - Math.abs(i) * .05, .18], [.07, .22, .035]);
      leaf.rotation.z = -i * .38;
    }
    for (const side of [-1, 1]) {
      sphere(head, material(0x6c9454), [side * .26, -.10, .33], [.065, .11, .025]);
      const leaf = sphere(body, material(0x6c9454), [side * .35, 1.64, .30], [.11, .25, .04]);
      leaf.rotation.z = side * .6;
    }
    sphere(head, hair, [0, -.35, .17], [.22, .25, .22]);
  } else {
    const scarf = cylinder(body, pale, [0, 1.89, .03], .29, .35, .23, 8);
    scarf.rotation.z = -.08;
    const flap = box(body, coat, [.30, 1.55, .43], [.18, .72, .08]);
    flap.rotation.z = -.25;
    const headband = cylinder(head, coat, [0, .25, 0], .46, .46, .12, 10);
    headband.scale.z = .87;
    if (type === 'aether-dusk') {
      for (const side of [-1, 1]) addMesh(head, new THREE.OctahedronGeometry(.06), eyes, [side * .37, .32, .12]);
    } else addMesh(body, new THREE.TorusGeometry(.09, .023, 5, 12), gold, [.25, 1.20, .43]);
  }
}

function makeHero(hero = {}) {
  if (hero.avatar === 'golem' || hero.kind === 'golem' || hero.id === 'rune-golem') return makeGolem(hero);
  const root = new THREE.Group();
  root.userData.heroId = String(hero.id || 'hero');
  const cosmeticOutfit = selectedCosmetic(hero, 'outfit');
  const palette = COSMETIC_OUTFITS[cosmeticOutfit] || PALETTES[hero.appearance?.color] || PALETTES.amber;
  const ancestry = hero.ancestry || hero.avatar;
  const person = isAncestry(ancestry);
  const type = person ? ancestry : Object.hasOwn(FUR, hero.avatar) ? hero.avatar : 'fox';
  root.userData.ancestry = person ? type : null;
  const fur = material(person ? PEOPLE[type].skin : FUR[type], type === 'cloud-warden' ? { transparent: true, opacity: .82 } : {});
  const cream = person ? fur : material(type === 'dragon' ? 0xc4dbb1 : 0xffedce);
  const dark = material(0x332c34, { roughness: .6 });
  const coat = material(palette[0]);
  const pale = material(palette[1]);
  const gold = material(0xe8bd62, { metalness: .35 });
  const boots = material(0x574846);
  const outfit = hero.appearance?.outfit || 'adventurer';
  const rig = { root, id: String(hero.id || 'hero'), arms: [], legs: [], materials: [], base: new THREE.Vector3() };

  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * .24, .63, 0);
    root.add(leg);
    cylinder(leg, coat, [0, -.17, 0], .13, .12, .42, 6);
    box(leg, boots, [0, -.48, .09], [.30, .23, .40]);
    rig.legs.push(leg);
  }
  cylinder(root, coat, [0, 1.21, 0], .46, outfit === 'scholar' ? .61 : .41, outfit === 'scholar' ? 1.34 : 1.04, 8);
  cylinder(root, material(0x745a42), [0, .91, 0], .46, .46, .10, 8);
  box(root, gold, [0, .92, .44], [.17, .13, .04]);
  if (outfit === 'knight') {
    box(root, material(0xc6cbd0, { metalness: .4 }), [0, 1.39, .31], [.69, .66, .18]);
    for (const side of [-1, 1]) sphere(root, pale, [side * .53, 1.70, 0], [.23, .15, .28]);
  } else {
    for (const side of [-1, 1]) {
      const lapel = box(root, pale, [side * .13, 1.57, .38], [.13, .39, .045]);
      lapel.rotation.z = side * -.35;
    }
  }
  const cape = cone(root, cosmeticOutfit ? coat : pale, [0, 1.10, -.33], cosmeticOutfit ? .59 : .51, 1.35, 4);
  cape.scale.z = .22;
  cape.rotation.x = -.10;
  if (cosmeticOutfit) {
    for (const side of [-1, 1]) {
      const trim = box(root, gold, [side * .32, 1.33, -.47], [.045, .90, .035]);
      trim.rotation.z = side * -.22;
      addMesh(root, starGeometry(.085), gold, [side * .44, 1.68, .22]);
    }
  }
  cylinder(root, cream, [0, 1.89, .01], .24, .25, .26, 8);

  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * .57, 1.70, 0);
    arm.rotation.z = side * .10;
    root.add(arm);
    cylinder(arm, coat, [0, -.26, 0], .17, .13, .62, 7);
    sphere(arm, fur, [0, -.66, .03], [.16, .18, .16]);
    rig.arms.push(arm);
  }

  const head = new THREE.Group();
  head.position.y = 2.26;
  root.add(head);
  rig.head = head;
  if (person) {
    makePerson(head, root, type, fur, coat, pale, gold);
  } else {
    sphere(head, fur, [0, 0, 0], [.68, .60, .56]);
  }
  if (person) { /* Humanoid faces are built above; animal enemies keep their models. */
  } else if (type === 'owl') {
    for (const side of [-1, 1]) {
      sphere(head, cream, [side * .255, .065, .44], [.28, .31, .09]);
      sphere(head, dark, [side * .255, .065, .525], [.09, .11, .042]);
      sphere(head, material(0xffffff), [side * .255 - .023, .100, .562], [.027, .03, .013]);
      const ear = cone(head, fur, [side * .46, .53, -.015], .20, .43, 3);
      ear.rotation.z = side * -.28;
    }
    const beak = cone(head, gold, [0, -.14, .59], .13, .28, 4);
    beak.rotation.x = -.8;
  } else {
    for (const side of [-1, 1]) {
      const ear = cone(head, type === 'dragon' ? cream : fur, [side * .44, .55, -.015], type === 'dragon' ? .13 : .22, type === 'cat' ? .40 : .52, type === 'dragon' ? 5 : 3);
      ear.rotation.z = side * -.22;
      if (type !== 'dragon') {
        const inner = cone(head, material(0xeab0a0), [side * .44, .55, .10], .11, .28, 3);
        inner.rotation.z = side * -.22;
      }
      sphere(head, dark, [side * .24, .10, .485], [.067, .085, .037]);
      sphere(head, material(0xffffff), [side * .24 - .018, .127, .515], [.019, .024, .012]);
      sphere(head, cream, [side * .19, -.20, .45], [.25, .19, .19]);
    }
    sphere(head, dark, [0, -.15, .635], type === 'dragon' ? [.11, .065, .055] : [.085, .065, .055]);
    if (type === 'dragon') {
      box(head, cream, [0, -.15, .46], [.56, .28, .24]);
      for (const side of [-1, 1]) sphere(head, dark, [side * .14, -.12, .595], [.035, .027, .02]);
    }
  }
  if (type === 'fox' || type === 'cat' || type === 'dragon') {
    const tail = cone(root, fur, [.15, .72, -.74], type === 'cat' ? .11 : .25, type === 'cat' ? 1.12 : .94, 6);
    tail.rotation.x = -.78;
    tail.rotation.z = -.24;
    if (type === 'fox') {
      const tip = cone(root, cream, [.23, 1.05, -1.05], .16, .35, 6);
      tip.rotation.x = -.78;
    }
  }
  if (type === 'dragon') {
    for (const side of [-1, 1]) {
      const wing = cone(root, coat, [side * .61, 1.55, -.34], .50, .79, 3);
      wing.scale.z = .10;
      wing.rotation.z = side * -.73;
    }
  }

  const emblem = hero.appearance?.emblem || 'star';
  if (emblem === 'moon') {
    const moon = addMesh(root, new THREE.TorusGeometry(.095, .026, 5, 12, Math.PI * 1.55), gold, [0, 1.40, .45]);
    moon.rotation.z = .7;
  } else if (emblem === 'leaf') {
    const leaf = sphere(root, gold, [0, 1.40, .45], [.065, .13, .025]);
    leaf.rotation.z = -.4;
  } else addMesh(root, starGeometry(.12), gold, [0, 1.40, .45]);

  const worn = equipmentFor(hero);
  if (worn.helmet) {
    const cap = material(RARITY_COLORS[worn.helmet.rarity] || 0xa6ae9c, { metalness: .35, roughness: .5 });
    const helmet = addMesh(head, new THREE.SphereGeometry(person ? .51 : .72, 8, 5, 0, TAU, 0, Math.PI / 2), cap, [0, .28, 0], [1, .66, .87]);
    helmet.userData.slot = 'helmet';
    cylinder(head, cap, [0, .29, 0], person ? .50 : .71, person ? .50 : .71, .11, 8).scale.z = .87;
    if (worn.helmet.templateId?.includes('guardian')) {
      box(head, gold, [0, .40, .61], [.10, .35, .055]);
    }
  }
  if (worn.chest) {
    const armor = material(RARITY_COLORS[worn.chest.rarity] || 0xa6ae9c, { metalness: .42, roughness: .45 });
    box(root, armor, [0, 1.35, .30], [.83, .76, .25]);
    box(root, gold, [0, 1.38, .44], [.06, .65, .03]);
    for (const side of [-1, 1]) sphere(root, armor, [side * .54, 1.72, 0], [.25, .17, .29]);
  }
  if (worn.hand1) makeWeapon(rig.arms[0], worn.hand1, -1);
  if (worn.hand2) makeWeapon(rig.arms[1], worn.hand2, 1);
  if (worn.necklace) {
    const chain = material(RARITY_COLORS[worn.necklace.rarity] || 0xe9bf67, { metalness: .5 });
    const necklace = addMesh(root, new THREE.TorusGeometry(.28, .022, 5, 14), chain, [0, 1.75, .32]);
    necklace.scale.y = .64;
    addMesh(root, new THREE.OctahedronGeometry(.105), chain, [0, 1.53, .46]);
  }
  if (worn.ring) {
    const ring = material(RARITY_COLORS[worn.ring.rarity] || 0xe9bf67, { metalness: .6 });
    addMesh(rig.arms[1], new THREE.TorusGeometry(.075, .025, 5, 10), ring, [0, -.64, .17]);
    addMesh(rig.arms[1], new THREE.OctahedronGeometry(.055), ring, [0, -.57, .19]);
  }
  rig.companion = makeCompanion(root, selectedCosmetic(hero, 'companion'));
  if (person) {
    const placement = new THREE.Group();
    placement.userData = { ...root.userData };
    placement.add(root);
    root.scale.set(...PEOPLE[type].scale);
    rig.root = placement;
  }
  const seenMaterials = new Set();
  root.traverse(node => {
    if (node.isMesh && node.material?.color && !seenMaterials.has(node.material)) {
      seenMaterials.add(node.material);
      rig.materials.push({ mat: node.material, color: node.material.color.clone() });
    }
  });
  return rig;
}

function makeStage(scene, arena, raid = false) {
  const stone = material(0x2b4155, { roughness: .67 });
  const edge = material(0x172a3d);
  const gold = material(0xa4d9cb, { metalness: .4, emissive: 0x328c81, emissiveIntensity: .23 });
  const purple = material(0x7775a4);
  const radius = arena ? (raid ? 4.7 : 3.6) : 1.31;
  cylinder(scene, edge, [0, -.14, 0], radius, radius + .12, .27, arena ? 40 : 24);
  cylinder(scene, stone, [0, .005, 0], radius - .07, radius - .07, .04, arena ? 40 : 24);
  const rim = addMesh(scene, new THREE.TorusGeometry(radius - .34, .025, 5, 48), gold, [0, .035, 0]);
  rim.rotation.x = Math.PI / 2;
  if (arena) {
    const center = addMesh(scene, new THREE.TorusGeometry(.72, .018, 5, 32), gold, [0, .04, 0]);
    center.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      cylinder(scene, edge, [side * 2.55, .65, -1.92], .19, .25, 1.25, 6);
      cylinder(scene, gold, [side * 2.55, 1.30, -1.92], .25, .25, .10, 6);
      addMesh(scene, new THREE.OctahedronGeometry(.21), gold, [side * 2.55, 1.57, -1.92]);
      cylinder(scene, edge, [side * 1.76, 1.37, -2.42], .035, .035, 2.7, 6);
      const banner = box(scene, purple, [side * 1.76, 2.07, -2.40], [.53, .83, .035]);
      banner.rotation.z = side * -.035;
      addMesh(scene, starGeometry(.12), gold, [side * 1.76, 2.12, -2.37]);
    }
    for (let i = 0; i < 10; i++) {
      const angle = i / 10 * TAU;
      const tile = box(scene, gold, [Math.cos(angle) * 2.84, .035, Math.sin(angle) * 2.84], [.045, .012, .16]);
      tile.rotation.y = -angle;
    }
  }
}

function setFallback(host, message) {
  host.dataset.renderState = 'fallback';
  let status = host.querySelector('.hero3d-status');
  if (!status) { status = document.createElement('p'); status.className = 'hero3d-status'; host.append(status); }
  status.textContent = message;
}

function unsupportedController(host) {
  setFallback(host, 'Die 3D-Ansicht benötigt WebGL 2. Dein Charakter und das Spiel bleiben bedienbar.');
  return { supported: false, dispose() {}, cancel() {}, update() {}, turn() {}, play: async () => {} };
}

function mount(host, heroes, { arena = false, raid = false, userId, interactive = !arena } = {}) {
  if (!host) return { supported: false, dispose() {}, cancel() {}, update() {}, turn() {}, play: async () => {} };
  const canvas = document.createElement('canvas');
  canvas.dataset.renderer = 'webgl';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', raid ? 'Dreidimensionale Gruppenarena mit Runengolem' : arena ? 'Dreidimensionale Arena mit beiden Kämpfern' : 'Dreidimensionaler Charakter mit seiner Ausrüstung');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;';
  let gl;
  try { gl = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' }); }
  catch { return unsupportedController(host); }
  if (!gl) return unsupportedController(host);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true }); }
  catch {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return unsupportedController(host);
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(arena ? 38 : 35, 1, .1, 70);
  scene.add(new THREE.HemisphereLight(0xfffaf0, 0x8a7794, 2.1));
  const light = new THREE.DirectionalLight(0xffefcf, 3.0);
  light.position.set(-3, 7, 5);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: .5, far: 18 });
  light.shadow.bias = -.0004;
  light.shadow.normalBias = .035;
  scene.add(light);
  const fill = new THREE.DirectionalLight(0xb7b4f4, 1.1);
  fill.position.set(4, 3, -3); scene.add(fill);
  makeStage(scene, arena, raid);
  const models = new THREE.Group(); scene.add(models);
  const fx = new THREE.Group(); scene.add(fx);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let rigs = [], disposed = false, lost = false, visible = true, raf = 0, lastFrame = 0;
  let yaw = -.16, currentJob = null, drag = null;
  let generation = 0;

  function render() {
    if (disposed || lost) return;
    try { renderer.render(scene, camera); } catch { lost = true; setFallback(host, 'Die 3D-Ansicht konnte nicht angezeigt werden. Du kannst weiter spielen.'); }
  }

  function resetPoses() {
    for (const rig of rigs) {
      rig.root.position.copy(rig.base);
      rig.root.rotation.set(0, arena ? rig.side * -.64 : yaw, 0);
      rig.head.rotation.set(0, 0, 0);
      for (const [i, arm] of rig.arms.entries()) arm.rotation.set(0, 0, i === 0 ? -.10 : .10);
      for (const leg of rig.legs) leg.rotation.set(0, 0, 0);
      if (rig.companion) {
        rig.companion.group.position.y = rig.companion.y;
        rig.companion.group.rotation.y = 0;
      }
      for (const { mat, color } of rig.materials) mat.color.copy(color);
    }
  }

  function clearEffects() {
    for (const child of [...fx.children]) disposeObject(child);
  }

  function cancel() {
    generation++;
    if (currentJob) {
      clearTimeout(currentJob.timer);
      const done = currentJob.resolve;
      currentJob = null;
      done();
    }
    clearEffects(); resetPoses(); render();
    delete host.dataset.animating;
  }

  function schedule() {
    if (!raf && !disposed && !lost && !document.hidden && (currentJob || (visible && !reduced.matches))) raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    if (disposed || lost || document.hidden) return;
    if (now - lastFrame >= 31) {
      lastFrame = now;
      resetPoses();
      if (currentJob) currentJob.step(now);
      else if (visible && !reduced.matches) {
        for (let index = 0; index < rigs.length; index++) {
          const rig = rigs[index];
          const breath = Math.sin(now * .0019 + index * 1.8);
          rig.root.position.y += breath * .018;
          rig.head.rotation.z = Math.sin(now * .0011 + index) * .015;
          rig.arms[0].rotation.x = breath * .035;
          rig.arms[1].rotation.x = -breath * .035;
          if (rig.companion) {
            rig.companion.group.position.y = rig.companion.y + Math.sin(now * .0025 + index) * .07;
            rig.companion.group.rotation.y = Math.sin(now * .0011 + index) * .25;
          }
        }
      }
      render();
    }
    schedule();
  }

  function update(next) {
    if (disposed) return;
    cancel();
    for (const child of [...models.children]) disposeObject(child);
    const values = (Array.isArray(next) ? [...next] : [next]).filter(Boolean);
    if (arena && userId) values.sort((a, b) => Number(String(b.id) === String(userId)) - Number(String(a.id) === String(userId)));
    const members = raid ? values.filter(value => value.id !== 'rune-golem' && value.kind !== 'golem' && value.avatar !== 'golem') : values;
    rigs = values.map((hero, index) => {
      const rig = makeHero(hero);
      if (raid) {
        if (rig.golem) {
          rig.side = 1;
          rig.root.scale.setScalar(1.10);
          rig.base.set(1.75, .06, -.05);
        } else {
          const memberIndex = members.indexOf(hero);
          const offset = members.length <= 1 ? 0 : memberIndex / (members.length - 1) * 2 - 1;
          rig.side = -1;
          rig.root.scale.setScalar(.64);
          rig.base.set(-2.55 + Math.abs(offset) * .65, .06, offset * 2.0);
        }
      } else {
        rig.side = arena ? (index === 0 ? -1 : 1) : 0;
        rig.base.set(arena ? rig.side * 1.48 : 0, .06, 0);
      }
      models.add(rig.root);
      return rig;
    });
    resetPoses(); render(); schedule();
  }

  function resize() {
    if (disposed) return;
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, rect.width || 380), height = Math.max(1, rect.height || 420);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    if (raid) {
      const fit = Math.max(1, 1.65 / camera.aspect);
      camera.position.set(3.0 * fit, 6.3 * fit, 11.4 * fit);
      camera.lookAt(0, 1.15, 0);
    } else if (arena) {
      const fit = Math.max(1, 1.45 / camera.aspect);
      camera.position.set(3.0 * fit, 4.6 * fit, 8.8 * fit);
      camera.lookAt(0, 1.0, 0);
    } else {
      const fit = Math.max(1, .66 / camera.aspect);
      camera.position.set(2.7 * fit, 2.55 * fit, 6.05 * fit);
      camera.lookAt(0, 1.43, 0);
    }
    camera.updateProjectionMatrix(); render();
  }

  function play(event) {
    cancel();
    host.dataset.lastAction = String(event?.action || '');
    if (disposed || lost || document.hidden || reduced.matches || !event) return Promise.resolve();
    const actor = rigs.find(rig => rig.id === String(event.actorId));
    const target = rigs.find(rig => rig.id === String(event.targetId));
    if (!actor || !target) return Promise.resolve();
    const action = event.action;
    const runeAction = action === 'runeSun' || action === 'runeMoon';
    const healingAction = action === 'rest' || action.startsWith('potion');
    const mainDuration = action === 'surrender' ? 0 : 520;
    const duration = mainDuration + (event.winnerId ? 260 : 0);
    if (!duration) return Promise.resolve();
    const stamp = generation;
    const start = performance.now();
    const props = [];
    let orb = null, bubble = null;
    const glow = material(action === 'runeSun' ? 0xf3cd6a : action === 'focus' || action === 'runeMoon' ? 0xb18bea : action === 'guard' ? 0x90c1ea : 0x84d1a0,
      { emissive: action === 'runeSun' ? 0xb19033 : action === 'focus' || action === 'runeMoon' ? 0x7550ae : action === 'guard' ? 0x4e8eb8 : 0x4da66d,
        emissiveIntensity: .55, transparent: true, opacity: .75, depthWrite: false });
    if (action === 'focus') orb = sphere(fx, glow, [0, 1.5, 0], [.20, .20, .20]);
    if (action === 'guard') bubble = sphere(fx, glow, [actor.base.x, 1.51, actor.base.z], [.94, 1.38, .80]);
    if (runeAction) {
      bubble = addMesh(fx, new THREE.TorusGeometry(.72, .045, 6, 24), glow, [actor.base.x, 2.35, actor.base.z]);
      addMesh(fx, action === 'runeSun' ? starGeometry(.26) : new THREE.TorusGeometry(.22, .045, 6, 14, Math.PI * 1.6), glow,
        [actor.base.x, 2.35, actor.base.z]);
    }
    if (healingAction || action === 'guard' || runeAction) {
      for (let index = 0; index < 6; index++) props.push(addMesh(fx, new THREE.OctahedronGeometry(.065), glow));
    }
    const victoryStars = [];
    if (event.winnerId) {
      const mat = material(0xf4cd71, { emissive: 0xad7527, emissiveIntensity: .4 });
      for (let index = 0; index < 5; index++) victoryStars.push(addMesh(fx, starGeometry(.11), mat));
    }
    const direction = Math.sign(target.base.x - actor.base.x) || 1;
    return new Promise(resolve => {
      function finish() {
        if (!currentJob || currentJob.stamp !== stamp) return;
        clearTimeout(currentJob.timer);
        currentJob = null; clearEffects(); resetPoses(); render();
        delete host.dataset.animating;
        resolve(); schedule();
      }
      function step(now) {
        if (disposed || generation !== stamp) return finish();
        const elapsed = now - start;
        const p = mainDuration ? Math.min(1, elapsed / mainDuration) : 1;
        const pulse = Math.sin(p * Math.PI);
        if (elapsed <= mainDuration && action === 'attack') {
          actor.root.position.x += direction * pulse * (arena ? .64 : .12);
          actor.root.rotation.z = -direction * pulse * .10;
          actor.arms[0].rotation.x = -pulse * 1.3;
          actor.arms[1].rotation.x = -pulse * .3;
          actor.legs[0].rotation.x = pulse * .45;
          if (p > .40 && p < .82) {
            target.root.rotation.z = Math.sin(p * 30) * .07;
            for (const value of target.materials) value.mat.color.lerp(new THREE.Color(0xffd1bd), .30);
          }
        } else if (elapsed <= mainDuration && action === 'focus') {
          actor.arms[0].rotation.x = -pulse * 1.20;
          actor.arms[1].rotation.x = -pulse * 1.20;
          if (orb) {
            const path = THREE.MathUtils.smoothstep(p, .20, .82);
            orb.position.set(THREE.MathUtils.lerp(actor.base.x, target.base.x, path), 1.62 + Math.sin(path * Math.PI) * .25,
              THREE.MathUtils.lerp(actor.base.z, target.base.z, path) + .35);
            orb.scale.setScalar(.13 + pulse * .22);
            orb.rotation.y = p * TAU;
          }
          if (p > .65) for (const value of target.materials) value.mat.color.lerp(new THREE.Color(0xd6b5f6), .3 * Math.sin((p - .65) / .35 * Math.PI));
        } else if (elapsed <= mainDuration && (action === 'guard' || healingAction || runeAction)) {
          actor.arms[0].rotation.x = -pulse * .45;
          actor.arms[1].rotation.x = -pulse * .45;
          if (bubble) {
            bubble.position.x = actor.root.position.x;
            glow.opacity = .08 + pulse * .35;
            if (runeAction) { bubble.rotation.z = p * Math.PI; bubble.scale.setScalar(.7 + pulse * .4); }
          }
          for (let index = 0; index < props.length; index++) {
            const angle = index / props.length * TAU + p * 4;
            props[index].position.set(actor.base.x + Math.cos(angle) * .72, .40 + ((p + index / props.length) % 1) * 2.50, actor.base.z + Math.sin(angle) * .63);
            props[index].rotation.y = p * TAU;
          }
        }
        if (event.winnerId && elapsed >= mainDuration) {
          const winner = rigs.find(rig => rig.id === String(event.winnerId));
          const vp = Math.min(1, (elapsed - mainDuration) / 260);
          if (winner) {
            winner.root.position.y += Math.sin(vp * Math.PI) * .30;
            winner.arms[0].rotation.z = -.10 - Math.sin(vp * Math.PI) * .85;
            winner.arms[1].rotation.z = .10 + Math.sin(vp * Math.PI) * .85;
            for (let index = 0; index < victoryStars.length; index++) {
              const angle = index / victoryStars.length * TAU + vp * 1.2;
              victoryStars[index].position.set(winner.base.x + Math.cos(angle) * .85, 2.95 + Math.sin(vp * Math.PI) * .35, Math.sin(angle) * .62);
              victoryStars[index].rotation.y = angle;
            }
          }
        }
        if (elapsed >= duration) finish();
      }
      currentJob = { stamp, resolve, step, timer: setTimeout(finish, duration + 60) };
      host.dataset.animating = 'true'; schedule();
    });
  }

  function turn(angle) {
    if (!interactive || !Number.isFinite(angle) || disposed) return;
    yaw += angle; resetPoses(); render();
  }
  function onPointerDown(event) {
    if (!interactive || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX };
  }
  function onPointerMove(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    if (Math.abs(dx) > 2) {
      canvas.setPointerCapture?.(event.pointerId);
      turn(dx * .012); drag.x = event.clientX;
    }
  }
  function onPointerUp(event) {
    if (drag?.id === event.pointerId) drag = null;
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  function onKey(event) {
    if (interactive && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault(); turn(event.key === 'ArrowLeft' ? -.22 : .22);
    }
  }
  function onLost(event) {
    event.preventDefault(); lost = true; cancel();
    canvas.style.visibility = 'hidden';
    setFallback(host, 'Die 3D-Ansicht wurde unterbrochen. Dein Spielstand bleibt erhalten.');
  }
  function onRestored() {
    if (disposed) return;
    lost = false; canvas.style.visibility = ''; host.dataset.renderState = 'ready'; render(); schedule();
  }
  function onVisibility() { if (document.hidden) cancel(); else { render(); schedule(); } }
  function onMotion() { cancel(); render(); schedule(); }
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('keydown', onKey);
  if (interactive) canvas.tabIndex = 0;
  document.addEventListener('visibilitychange', onVisibility);
  reduced.addEventListener('change', onMotion);
  host.append(canvas);
  host.dataset.renderState = 'ready';
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
  const intersectionObserver = new IntersectionObserver(entries => {
    visible = entries[0]?.isIntersecting !== false;
    if (visible) { render(); schedule(); }
  });
  intersectionObserver.observe(host);
  update(heroes); resize(); schedule();

  return {
    supported: true, update, play, turn, cancel,
    dispose() {
      if (disposed) return;
      cancel(); disposed = true;
      cancelAnimationFrame(raf); raf = 0;
      resizeObserver.disconnect(); intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reduced.removeEventListener('change', onMotion);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('keydown', onKey);
      disposeObject(scene); light.shadow.dispose();
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
      delete host.dataset.animating;
    },
  };
}

/** Mount one interactive model; update() accepts the same public hero shape. */
export function mountHero3D(host, hero, options = {}) {
  return mount(host, [hero], { ...options, arena: false });
}

/** Mount both battle snapshots. Their gear visuals must also be snapshots. */
export function mountArena3D(host, fighters, options = {}) {
  return mount(host, fighters, { ...options, arena: true });
}

/** Group members and the golem use the same persistent action/snapshot contract. */
export function mountRaid3D(host, members, boss, options = {}) {
  return mount(host, [...(members || []), { ...boss, id: boss?.id || 'rune-golem', avatar: 'golem', kind: 'golem' }],
    { ...options, arena: true, raid: true, interactive: false });
}
