import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server.js';
import { createTower, applyTowerAction, applyTowerChoice } from '../lib/adventures.js';
import { createIsland, chooseIsland, actOnIsland, endIsland, islandPublicState } from '../lib/island.js';
import { renderAdventures, handleAdventureAction, resetAdventureState, mountAdventure3D } from '../public/adventures.js';
import { renderIsland } from '../public/island.js';
import { islandSceneFor, renderArchipelago } from '../public/island-scenery.js';
import { normalizeAdventureEnvironment } from '../public/adventure-scenery3d.js';

const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = () => '';
const heroAvatar = () => '<span class="test-hero">Held</span>';
const zero = () => 0;
const hero = () => ({ id: 'scenery-hero', name: 'Lina', characterName: 'Windlicht', ancestry: 'aether-elf',
  skills: { strength: 9, focus: 9, endurance: 9 }, equipment: {}, inventory: { items: [], chests: 2 },
  cosmetics: { owned: [], selected: { companion: null, outfit: null } }, appearance: {} });
const stateFor = adventure => ({ user: { ...hero(), cosmetics: { owned: [], selected: {} }, wallet: { total: 0 } },
  adventure: { tower: null, island: null, raids: [], ...adventure } });

function stubDocument(t, hosts = {}) {
  const previous = globalThis.document;
  globalThis.document = {
    querySelectorAll(selector) { return hosts[selector] || []; }, querySelector() { return null; },
    body: { classList: { remove() {} } },
  };
  t.after(() => { resetAdventureState(); if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
}

function towerOnFloor(floor) {
  let run = createTower(hero());
  while (run.floor < floor) {
    for (let turn = 0; run.status === 'active' && turn < 50; turn++) run = applyTowerAction(run, run.player.focusCooldown ? 'attack' : 'focus');
    assert.equal(run.status, 'choice');
    run = applyTowerChoice(run, 'vigor');
  }
  return run;
}

function islandAfterStops(count) {
  let run = createIsland(hero(), zero);
  for (let turn = 0; turn < 150 && !(run.cleared === count && run.phase === 'route'); turn++) {
    assert.equal(run.status, 'active');
    if (run.phase === 'route') run = chooseIsland(run, run.choices[0].id, zero);
    else if (run.phase === 'combat') run = actOnIsland(run, run.player.focusCooldown ? 'attack' : 'focus', zero);
    else if (run.phase === 'boon') run = chooseIsland(run, run.offers[0].id, zero);
    else {
      const option = run.phase === 'puzzle' ? run.encounter.correctOption
        : run.phase === 'camp' ? 'heal' : run.phase === 'treasure' ? 'fragments'
          : run.encounter.options.find(value => ['safe', 'leave', 'guide'].includes(value.id))?.id || run.encounter.options[0].id;
      run = chooseIsland(run, option, zero);
    }
  }
  assert.equal(run.cleared, count);
  assert.equal(run.phase, 'route');
  return run;
}

test('tower scenery follows the saved floor and never starts or advances a run through navigation', async t => {
  stubDocument(t);
  const state = stateFor({ tower: { id: 'tower-scenery', state: towerOnFloor(4) } });
  const before = structuredClone(state);
  let calls = 0;
  await handleAdventureAction({ dataset: { action: 'adventure-mode', mode: 'tower' } }, {
    render() {}, api() { calls++; }, mutate() { calls++; }, toast() {}, confirmDialog() {},
  });
  const html = renderAdventures({ state, e, icon, heroAvatar });
  assert.match(html, /data-tower-floor="4"/);
  assert.match(html, /tower-room-backdrop/);
  assert.equal([...html.matchAll(/data-tower-step="\d+"/g)].length, 10);
  assert.equal([...html.matchAll(/data-status="cleared"/g)].length, 3);
  assert.equal([...html.matchAll(/data-status="current"/g)].length, 1);
  assert.equal([...html.matchAll(/data-status="locked"/g)].length, 6);
  assert.equal(calls, 0);
  assert.deepEqual(state, before);
});

test('archipelago route shows real visited islands and keeps unchosen future encounters in the mist', () => {
  const run = islandPublicState(islandAfterStops(3));
  const before = structuredClone(run);
  const html = renderArchipelago(run, e);
  const stops = [...html.matchAll(/<g\b[^>]*\bdata-station="(\d+)"[^>]*>/g)].map(([tag, station]) => ({
    station: Number(station), state: tag.match(/data-stop-state="([^"]+)"/)[1], kind: tag.match(/data-encounter-kind="([^"]+)"/)[1],
    feature: tag.match(/data-island-feature="([^"]+)"/)?.[1],
  }));
  assert.equal(stops.length, 7);
  assert.equal(stops.filter(stop => stop.state === 'visited').length, 3);
  assert.equal(stops.filter(stop => stop.state === 'future').length, 3);
  assert.equal(stops.filter(stop => stop.state === 'current').length, 1);
  for (const stop of stops.filter(stop => stop.station > run.cleared)) {
    assert.equal(stop.kind, 'unknown');
    assert.equal(stop.feature, 'unknown');
  }
  for (const [index, stop] of run.history.entries()) {
    assert.equal(stops[index].kind, stop.kind);
    assert.ok(html.includes(e(stop.title)), stop.title);
  }
  assert.ok(!html.includes('routeDeck'));
  assert.deepEqual(run, before);
});

test('island scene retains the landed station between choices and changes on a real new landing', () => {
  const raw = islandAfterStops(3);
  const onRoute = islandSceneFor(islandPublicState(raw));
  assert.equal(onRoute.kind, 'island');
  assert.equal(onRoute.station, 3);
  assert.equal(onRoute.encounterKind, raw.history[2].kind);
  const landed = chooseIsland(raw, raw.choices[0].id, zero);
  const view = islandPublicState(landed);
  const before = structuredClone(view);
  const profile = islandSceneFor(view);
  assert.equal(profile.station, 4);
  assert.equal(profile.encounterKind, landed.current.kind);
  const html = renderIsland({ state: stateFor({ island: { id: 'island-scenery', state: view } }), e, icon, heroAvatar });
  assert.match(html, /data-island-station="4"/);
  assert.ok(html.includes(`data-encounter-kind="${landed.current.kind}"`));
  assert.deepEqual(view, before);
});

test('returning or abandoning between islands never invents a landing at the next station', () => {
  const route = islandAfterStops(3);
  const banked = islandPublicState(endIsland(route));
  const abandoned = islandPublicState(endIsland(route, true));
  assert.equal(islandSceneFor(banked).station, 3);
  assert.equal(islandSceneFor(abandoned).station, 3);
  const html = renderArchipelago(abandoned, e);
  const next = html.match(/<g\b[^>]*\bdata-station="4"[^>]*>/)[0];
  assert.match(next, /data-stop-state="future"/);
  assert.match(next, /data-encounter-kind="unknown"/);
  const landed = chooseIsland(route, route.choices[0].id, zero);
  assert.equal(islandSceneFor(islandPublicState(endIsland(landed, true))).station, 4);
});

test('island landmarks follow the chosen place and actual encounter rather than unchosen route options', () => {
  const examples = [
    ['combat', 'Kristallhöhle', 'cave'], ['combat', 'Dornenpfad', 'thorns'],
    ['camp', 'Warmes Quellenlager', 'spring'], ['treasure', 'Vergessener Leuchtturm', 'lighthouse'],
  ];
  const base = createIsland(hero(), zero);
  for (const [kind, title, feature] of examples) {
    const route = { ...base, choices: [{ id: 'path-1-0', kind, title, description: 'Ein möglicher Inselweg.' }] };
    const before = structuredClone(route);
    assert.equal(islandSceneFor(islandPublicState(route)).feature, null, 'A possible destination has not been visited yet.');
    const landed = chooseIsland(route, 'path-1-0', zero);
    const profile = islandSceneFor(islandPublicState(landed));
    assert.equal(profile.feature, feature, title);
    assert.equal(profile.encounterKind, kind);
    assert.equal(normalizeAdventureEnvironment(profile).feature, feature);
    assert.deepEqual(route, before);
    if (kind === 'camp' || kind === 'treasure') {
      const completed = chooseIsland(landed, kind === 'camp' ? 'heal' : 'fragments', zero);
      assert.equal(completed.phase, 'route');
      assert.equal(islandSceneFor(islandPublicState(completed)).feature, feature, 'The last visited landmark remains visible between choices.');
    }
  }
  const eventRoute = { ...base, choices: [{ id: 'path-1-0', kind: 'event', title: 'Der flüsternde Wald', description: 'Eine Begegnung.' }] };
  for (const [index, feature] of ['bridge', 'trader', 'scout'].entries()) {
    const landed = chooseIsland(eventRoute, 'path-1-0', max => index % max);
    assert.equal(landed.encounter.id, feature);
    assert.equal(islandSceneFor(islandPublicState(landed)).feature, feature, 'The actual encounter overrides a generic route landmark.');
    const untrusted = { ...landed, encounter: { ...landed.encounter, id: '<script>not-a-landmark</script>' } };
    assert.equal(islandSceneFor(islandPublicState(untrusted)).feature, 'grove', 'An unrecognized encounter ID cannot supply a render feature.');
  }
  for (const feature of [null, {}, 'unknown', '../cave', '<img src=x onerror=alert(1)>']) {
    assert.equal(normalizeAdventureEnvironment({ kind: 'island', feature }).feature, 'route');
  }
});

test('3D mount receives the matching saved adventure environment and ignores stale hosts', t => {
  const tower = { id: 'tower-scenery', state: towerOnFloor(4) };
  const island = { id: 'island-scenery', state: islandPublicState(islandAfterStops(3)) };
  const raid = { id: 'raid-scenery', state: { members: [hero()], boss: { id: 'golem', name: 'Runengolem' } } };
  const towerHost = { dataset: { adventureKind: 'tower', adventureId: tower.id } };
  const raidHost = { dataset: { adventureKind: 'raid', adventureId: raid.id } };
  const islandHost = { dataset: { adventureKind: 'island', adventureId: island.id, islandView: 'journey' } };
  stubDocument(t, {
    '.island-scene[data-adventure-id]': [islandHost, { dataset: { adventureId: 'old-island', islandView: 'journey' } }],
    '.adventure-arena[data-adventure-kind]:not([data-adventure-kind="island"])': [towerHost, raidHost,
      { dataset: { adventureKind: 'tower', adventureId: 'old-tower' } }],
  });
  const state = stateFor({ tower, island, raids: [raid] });
  const before = structuredClone(state);
  const calls = [];
  mountAdventure3D({ state, register: (host, create) => create(),
    mountHero3D: (host, player, options) => calls.push({ host, options }),
    mountArena3D: (host, fighters, options) => calls.push({ host, options }),
    mountRaid3D: (host, members, boss, options) => calls.push({ host, options }),
  });
  assert.equal(calls.length, 3);
  const byHost = host => calls.find(call => call.host === host).options;
  assert.deepEqual(byHost(towerHost).environment, { kind: 'tower', floor: 4, status: 'active' });
  assert.equal(byHost(raidHost).environment.kind, 'golem');
  assert.equal(byHost(islandHost).environment.station, 3);
  assert.equal(byHost(islandHost).environment.encounterKind, island.state.history[2].kind);
  assert.deepEqual(state, before);
});

test('the scenery renderer limits stage dimensions to real floors and island stops', () => {
  assert.equal(normalizeAdventureEnvironment(null), null);
  assert.equal(normalizeAdventureEnvironment({ kind: 'pvp' }), null);
  const context = { kind: 'tower', floor: 4, station: 3, status: 'active' };
  const before = structuredClone(context);
  assert.equal(normalizeAdventureEnvironment(context).floor, 4);
  assert.equal(normalizeAdventureEnvironment({ kind: 'tower', floor: -8 }).floor, 1);
  assert.equal(normalizeAdventureEnvironment({ kind: 'tower', floor: 999 }).floor, 10);
  assert.equal(normalizeAdventureEnvironment({ kind: 'island', station: -8 }).station, 1);
  assert.equal(normalizeAdventureEnvironment({ kind: 'island', station: 999 }).station, 7);
  assert.deepEqual(context, before);
});

test('all adventure scenery modules and styles are served locally by the game', async t => {
  const app = createApp({ dbPath: ':memory:', demo: false });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  for (const path of ['/adventure-scenery.js', '/adventure-scenery3d.js', '/island-scenery.js', '/adventure-scenery.css', '/island-scenery.css']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), path.endsWith('.css') ? /text\/css/ : /javascript/);
    const body = await response.text();
    assert.ok(body.length > 100, path);
    assert.doesNotMatch(body, /(?:src|href)=["']https?:\/\//);
  }
});
