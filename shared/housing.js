import { COSMETICS } from '../lib/cosmetics.js';

export const ROOM = Object.freeze({ width: 8, depth: 6, maxPlacements: 40 });
export const HOME_LOCATIONS = Object.freeze([
  { id: 'zephyria', name: 'Zephyria', houseName: 'Zahnradhaus', style: 'workshop', description: 'Stein, dunkles Holz und Messing. Vor deinem Fenster liegen Berggipfel und die Werkstätten der Ingenieure.', view: 'Berge und die Dächer der Ingenieursstadt', wall: '#637180', floor: '#977351', trim: '#d3b575', roof: '#4d6475', sky: '#adc7d9' },
  { id: 'silverwind', name: 'Silberwind', houseName: 'Baumhaus', style: 'canopy', description: 'Helles Holz, Blätter und geschwungene Balken. Dein Zuhause liegt mitten in den Baumkronen.', view: 'Baumkronen und leuchtende Waldblumen', wall: '#8fa586', floor: '#b39263', trim: '#dde7b4', roof: '#4d805f', sky: '#a6d2bc' },
  { id: 'nebelheim', name: 'Nebelheim', houseName: 'Wolkenhaus', style: 'cloud', description: 'Heller Stein und blaue Stoffe hoch am Berg. Wolken ziehen unter deinen Fenstern vorbei.', view: 'Wolken und hohe Bergspitzen', wall: '#c1cbd7', floor: '#a2b2c2', trim: '#e3d2a1', roof: '#7f91b6', sky: '#b6cbe4' },
  { id: 'sky-rest', name: 'Himmelsruhe', houseName: 'Schwebendes Hafenhaus', style: 'harbor', description: 'Ein Haus am schwebenden Hafen der Luftnomaden. Bunte Segel und das Licht des Ätherstroms begleiten den Ausblick.', view: 'Luftschiffe im schimmernden Ätherstrom', wall: '#9bb3b4', floor: '#aa8356', trim: '#e6c27c', roof: '#c09266', sky: '#7aadc5' },
  { id: 'lysara', name: 'Lysara', houseName: 'Fachwerkhaus', style: 'town', description: 'Ein gemütliches Fachwerkhaus mit warmem Holz. Draußen warten der Marktplatz und die grünen Ebenen.', view: 'Marktplatz, Gärten und grüne Hügel', wall: '#d3c5a5', floor: '#a27b53', trim: '#725744', roof: '#a85f55', sky: '#a7cad6' },
  { id: 'aether-grove', name: 'Ätherhain', houseName: 'Hainhütte', style: 'grove', description: 'Holz, Moos und lebendige Wurzeln. Nebelwälder und Ätherpflanzen wachsen direkt vor deinem Fenster.', view: 'Nebelwald und schimmernde Ätherpflanzen', wall: '#718b73', floor: '#8b7551', trim: '#b6cb92', roof: '#426857', sky: '#92b9ad' },
  { id: 'aethkern', name: 'Äthkern', houseName: 'Wüstenhaus', style: 'desert', description: 'Sandstein, dunkles Metall und violette Akzente. Durch den Bogen siehst du Dünen und die Türme der Wüstenstadt.', view: 'Dünen und die Türme von Äthkern', wall: '#c9a77e', floor: '#bd9871', trim: '#766186', roof: '#6f667b', sky: '#c7a1ac' },
].map(Object.freeze));

const item = (id, name, kind, width, depth, color, source, extra = {}) =>
  Object.freeze({ id, name, kind, width, depth, color, source, ...extra });
const starter = 'Grundausstattung deines Hauses';
export const FURNITURE = Object.freeze([
  item('bed-oak', 'Holzbett', 'bed', 1.65, 2.15, '#bea784', starter, { starter: 1 }),
  item('table-oak', 'Eichentisch', 'table', 1.6, 1.05, '#ad8156', starter, { starter: 1 }),
  item('chair-oak', 'Holzstuhl', 'chair', .6, .65, '#b88d5f', starter, { starter: 2 }),
  item('rug-woven', 'Gewebter Teppich', 'rug', 2.8, 2.1, '#638c92', starter, { starter: 1, layer: 'rug' }),
  item('shelf-oak', 'Kleines Bücherregal', 'shelf', 1.5, .5, '#a77f57', starter, { starter: 1 }),
  item('plant-fern', 'Zimmerfarn', 'plant', .65, .65, '#6ba17d', starter, { starter: 1 }),
  item('plinth-oak', 'Ausstellungssockel', 'plinth', .65, .65, '#b49b70', starter, { starter: 2 }),
  item('lamp-firefly', 'Glühwürmchenlaterne', 'lamp', .55, .55, '#e8cc85', 'Turm: Etage 2 abschließen und Funde sichern.', { reward: 'pet-firefly' }),
  item('plant-silver', 'Silberlaub-Bäumchen', 'plant', .85, .85, '#b1cfac', 'Turm: Etage 2 abschließen und Funde sichern.', { reward: 'pet-firefly' }),
  item('sofa-starlight', 'Sternenpolster-Sofa', 'sofa', 1.9, .9, '#857dad', 'Turm: Etage 4 abschließen und Funde sichern.', { reward: 'outfit-starlight' }),
  item('rug-stars', 'Sternenteppich', 'rug', 2.6, 1.7, '#706391', 'Turm: Etage 4 abschließen und Funde sichern.', { reward: 'outfit-starlight', layer: 'rug' }),
  item('cabinet-gear', 'Zahnrad-Kommode', 'cabinet', 1.3, .6, '#b18c59', 'Turm: Etage 6 abschließen und Funde sichern.', { reward: 'trophy-tower-bronze' }),
  item('lamp-gear', 'Ingenieurslampe', 'lamp', .6, .6, '#c3a568', 'Turm: Etage 6 abschließen und Funde sichern.', { reward: 'trophy-tower-bronze' }),
  item('chair-cloud', 'Wolkensessel', 'chair', .9, .95, '#bdcce0', 'Turm: Etage 8 abschließen und Funde sichern.', { reward: 'pet-cloud' }),
  item('shelf-cloud', 'Wolkenregal', 'shelf', 1.7, .5, '#b1bfd5', 'Turm: Etage 8 abschließen und Funde sichern.', { reward: 'pet-cloud' }),
  item('telescope-gold', 'Sternenfernrohr', 'telescope', .9, 1.1, '#d9b76a', 'Alle 10 Turmetagen bezwingen.', { reward: 'trophy-tower-gold' }),
  item('bed-sun', 'Sonnenseidenbett', 'bed', 1.8, 2.25, '#d2ad7e', 'Alle 10 Turmetagen bezwingen.', { reward: 'trophy-tower-gold' }),
  item('chest-shell', 'Muscheltruhe', 'chest', 1, .65, '#8ebcb9', 'Insel: 3 Stationen abschließen und Funde sichern.', { reward: 'pet-tide' }),
  item('plant-aether', 'Ätherblüten', 'plant', .7, .7, '#91c7c0', 'Insel: 3 Stationen abschließen und Funde sichern.', { reward: 'pet-tide' }),
  item('table-roots', 'Wurzeltisch', 'table', 1.5, 1.1, '#78956e', 'Insel: 5 Stationen abschließen und Funde sichern.', { reward: 'outfit-pathfinder' }),
  item('sofa-moss', 'Moospolster', 'sofa', 1.8, .9, '#789b78', 'Insel: 5 Stationen abschließen und Funde sichern.', { reward: 'outfit-pathfinder' }),
  item('cabinet-compass', 'Kartenkommode', 'cabinet', 1.4, .6, '#a9b8a6', 'Alle 7 Inselstationen bezwingen.', { reward: 'trophy-island' }),
  item('rug-current', 'Ätherstrom-Teppich', 'rug', 2.7, 1.7, '#709fa9', 'Alle 7 Inselstationen bezwingen.', { reward: 'trophy-island', layer: 'rug' }),
  item('lamp-crystal', 'Runenkristall-Lampe', 'lamp', .7, .7, '#b39ace', 'Den Runengolem gemeinsam bezwingen.', { reward: 'trophy-golem' }),
  item('statue-golem', 'Kleiner Runenwächter', 'statue', .8, .8, '#a5bdb8', 'Den Runengolem gemeinsam bezwingen.', { reward: 'trophy-golem' }),
  ...COSMETICS.filter(cosmetic => cosmetic.type === 'trophy').map(trophy =>
    item(`display-${trophy.id}`, `${trophy.name} auf Sockel`, 'trophy', .7, .7, trophy.color, trophy.source,
      { reward: trophy.id, trophyId: trophy.id, trophyName: trophy.name })),
]);
export const furnitureFor = id => FURNITURE.find(entry => entry.id === id) || null;
export const homeLocationFor = id => HOME_LOCATIONS.find(location => location.id === id) || null;

export function homeInventory(unlockedIds = []) {
  const owned = new Set(unlockedIds);
  return FURNITURE.filter(entry => entry.starter || owned.has(entry.reward))
    .map(entry => ({ itemId: entry.id, quantity: entry.starter || 1 }));
}

export function placementCorners(placement) {
  const furniture = furnitureFor(placement.itemId);
  if (!furniture) return [];
  const angle = placement.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z]) => ({
    x: placement.x + x * furniture.width / 2 * c - z * furniture.depth / 2 * s,
    z: placement.z + x * furniture.width / 2 * s + z * furniture.depth / 2 * c,
  }));
}
function overlaps(a, b) {
  const first = placementCorners(a), second = placementCorners(b);
  for (const polygon of [first, second]) for (let i = 0; i < 2; i++) {
    const edge = { x: polygon[i+1].x - polygon[i].x, z: polygon[i+1].z - polygon[i].z };
    const axis = { x: -edge.z, z: edge.x };
    const project = points => points.map(point => point.x * axis.x + point.z * axis.z);
    const p = project(first), q = project(second);
    if (Math.max(...p) <= Math.min(...q) + .005 || Math.max(...q) <= Math.min(...p) + .005) return false;
  }
  return true;
}

/** Shared placement rules keep the touch editor and authoritative save in agreement. */
export function layoutIssue(placements, owned = []) {
  if (!Array.isArray(placements) || placements.length > ROOM.maxPlacements) return `In dein Haus passen höchstens ${ROOM.maxPlacements} platzierte Gegenstände.`;
  const quantities = new Map(owned.map(entry => [entry.itemId, entry.quantity]));
  const used = new Map(), ids = new Set();
  for (const placement of placements) {
    if (!placement || typeof placement !== 'object' || Array.isArray(placement)
        || typeof placement.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(placement.id) || ids.has(placement.id)) return 'Jedes Möbelstück braucht eine eigene gültige Kennung.';
    ids.add(placement.id);
    const furniture = furnitureFor(placement.itemId);
    if (!furniture || !quantities.has(placement.itemId)) return 'Dieses Möbelstück hast du noch nicht freigeschaltet.';
    used.set(placement.itemId, (used.get(placement.itemId) || 0) + 1);
    if (used.get(placement.itemId) > quantities.get(placement.itemId)) return `Alle Exemplare von „${furniture.name}“ sind bereits aufgestellt.`;
    if (!['x','z','rotation'].every(key => typeof placement[key] === 'number' && Number.isFinite(placement[key]))
        || placement.rotation < 0 || placement.rotation >= 360) return 'Die Möbelposition ist ungültig.';
    if (placementCorners(placement).some(point => Math.abs(point.x) > ROOM.width / 2 + .00001 || Math.abs(point.z) > ROOM.depth / 2 + .00001)) return 'Dieses Möbelstück ragt durch eine Wand. Rücke es etwas nach innen.';
  }
  for (let i = 0; i < placements.length; i++) for (let j = i + 1; j < placements.length; j++) {
    const a = placements[i], b = placements[j];
    if (furnitureFor(a.itemId).layer === 'rug' || furnitureFor(b.itemId).layer === 'rug') continue;
    if (overlaps(a, b)) return 'Hier steht schon ein Möbelstück. Wähle etwas mehr Abstand.';
  }
  return null;
}
export function normalizeHomeLayout(placements, owned) {
  const issue = layoutIssue(placements, owned);
  if (issue) throw new Error(issue);
  return placements.map(({ id, itemId, x, z, rotation }) => ({ id, itemId, x, z, rotation }));
}
export function initialHomeLayout() {
  return [
    { id:'starter-bed', itemId:'bed-oak', x:-2.65, z:-1.5, rotation:0 },
    { id:'starter-table', itemId:'table-oak', x:.3, z:.2, rotation:0 },
    { id:'starter-chair-1', itemId:'chair-oak', x:-1, z:.2, rotation:90 },
    { id:'starter-chair-2', itemId:'chair-oak', x:1.6, z:.2, rotation:270 },
    { id:'starter-rug', itemId:'rug-woven', x:.3, z:.2, rotation:0 },
    { id:'starter-shelf', itemId:'shelf-oak', x:2.6, z:-2.4, rotation:0 },
    { id:'starter-plant', itemId:'plant-fern', x:3.3, z:2.2, rotation:0 },
    { id:'starter-plinth', itemId:'plinth-oak', x:2.4, z:1.6, rotation:0 },
  ];
}
