import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server.js';
import { WORLD_MAP_LOCATIONS, renderWorldMap, handleWorldMapAction, resetWorldMapState } from '../public/world-map.js';
import { renderAdventures, handleAdventureAction, resetAdventureState } from '../public/adventures.js';

const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = () => '';
const heroAvatar = () => '';

async function fixture(t) {
  const app = createApp({ dbPath: ':memory:' });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  let cookie = '';
  const request = async (path, body) => {
    const response = await fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    const value = await response.json();
    assert.equal(response.status, 200, JSON.stringify(value));
    return value;
  };
  await request('/api/auth/login', { email: 'lina@demo.schule', password: 'Klassenhelden!2026' });
  return { ...app, origin, request, state: async () => request('/api/state') };
}

function documentStub(t) {
  const previous = globalThis.document;
  globalThis.document = {
    querySelectorAll: () => [], querySelector: () => null,
    body: { classList: { remove() {} } },
  };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
}

test('the complete map artwork and its UI load locally while unlisted asset paths stay private', async t => {
  const { origin } = await fixture(t);
  for (const [path, mime] of [['/world-map.js', /javascript/], ['/world-map.css', /text\/css/]]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), mime);
    assert.ok((await response.text()).length > 500);
  }
  const image = await fetch(origin + '/assets/aetheria-map.png');
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /image\/png/);
  const bytes = Buffer.from(await image.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(bytes.length > 100_000, 'The complete illustrated map must be included, not a placeholder.');
  const head = await fetch(origin + '/assets/aetheria-map.png', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  for (const path of ['/assets/unknown.png', '/docs/aetheria-kartenentwurf.png', '/assets/%2e%2e/server.js']) {
    assert.equal((await fetch(origin + path)).status, 404, path);
  }
});

test('every map location is selectable without changing progress, and only actual adventures get start links', async t => {
  const { state: readState } = await fixture(t);
  const state = await readState();
  const previous = structuredClone(state);
  resetWorldMapState();
  let renders = 0;
  const render = () => { renders++; };
  const initial = renderWorldMap({ state, e, icon });
  assert.match(initial, /assets\/aetheria-map\.png/);
  assert.match(initial, /<button\b[^>]*data-action="adventure-map-select"/);
  assert.equal(WORLD_MAP_LOCATIONS.length, 11);
  const playableModes = [];
  for (const location of WORLD_MAP_LOCATIONS) {
    assert.ok(initial.includes(`data-location="${location.id}"`), `${location.name} needs a keyboard-accessible alternative.`);
    assert.equal(handleWorldMapAction({ dataset: { action: 'adventure-map-select', location: location.id } }, { render }), true);
    const selected = renderWorldMap({ state, e, icon });
    assert.ok(selected.includes(e(location.description)), `${location.name} must show its own description.`);
    if (location.mode) {
      playableModes.push(location.mode);
      assert.match(selected, new RegExp(`data-action="adventure-mode"[^>]*data-mode="${location.mode}"`));
    } else {
      assert.doesNotMatch(selected, /data-action="adventure-mode"/,
        `${location.name} describes the world without advertising an unimplemented adventure.`);
    }
    assert.deepEqual(state, previous);
  }
  assert.deepEqual(playableModes.sort(), ['golem', 'island', 'tower']);
  const rendered = renders;
  assert.equal(handleWorldMapAction({ dataset: { action: 'adventure-map-select', location: '<script>' } }, { render }), false);
  assert.equal(handleWorldMapAction({ dataset: { action: 'unknown' } }, { render }), false);
  assert.equal(renders, rendered);
  resetWorldMapState();
  assert.equal(renderWorldMap({ state, e, icon }), initial, 'Logging out/resetting must clear the previous location and zoom state.');
});

test('map navigation opens each existing adventure without starting it or spending resources', async t => {
  documentStub(t);
  const { state: readState } = await fixture(t);
  const state = await readState();
  const before = structuredClone(state);
  let calls = 0;
  let renders = 0;
  const context = {
    api: async () => { calls++; throw new Error('Navigation must not create a run.'); },
    mutate: async action => { calls++; return action(); },
    render: () => { renders++; }, toast() {}, confirmDialog: async () => true,
  };
  resetAdventureState();
  assert.match(renderAdventures({ state, e, icon, heroAvatar }), /assets\/aetheria-map\.png/);
  const expectedButtons = { tower: 'tower-start', island: 'island-start', golem: 'raid-create' };
  for (const [mode, startAction] of Object.entries(expectedButtons)) {
    assert.equal(await handleAdventureAction({ dataset: { action: 'adventure-mode', mode } }, context), true);
    assert.match(renderAdventures({ state, e, icon, heroAvatar }), new RegExp(`data-action="${startAction}"`));
    assert.equal(await handleAdventureAction({ dataset: { action: 'adventure-mode', mode: 'map' } }, context), true);
    assert.match(renderAdventures({ state, e, icon, heroAvatar }), /assets\/aetheria-map\.png/);
  }
  assert.equal(await handleAdventureAction({ dataset: { action: 'adventure-mode', mode: '__proto__' } }, context), false);
  assert.equal(calls, 0);
  assert.equal(renders, 6);
  assert.deepEqual(await readState(), before);
});

test('opening adventures through the map uses their existing APIs and leaves all three runs resumable', async t => {
  documentStub(t);
  const { request, state: readState } = await fixture(t);
  const before = await readState();
  const calls = [];
  const context = {
    api: async (path, body) => { calls.push(path); return request('/api' + path, body); },
    mutate: async action => action(), render() {}, toast() {}, confirmDialog: async () => true,
  };
  resetAdventureState();
  for (const [mode, action] of [['tower', 'tower-start'], ['island', 'island-start'], ['golem', 'raid-create']]) {
    await handleAdventureAction({ dataset: { action: 'adventure-mode', mode } }, context);
    await handleAdventureAction({ dataset: { action } }, context);
    await handleAdventureAction({ dataset: { action: 'adventure-mode', mode: 'map' } }, context);
  }
  assert.deepEqual(calls, ['/tower/start', '/island/start', '/raids']);
  const started = await readState();
  assert.equal(started.adventure.tower.state.status, 'active');
  assert.equal(started.adventure.island.state.status, 'active');
  assert.equal(started.adventure.raids[0].status, 'lobby');
  assert.deepEqual(started.user, before.user);
  const snapshots = structuredClone(started.adventure);
  // Returning to the map and opening a run is navigation, not a replacement run.
  for (const mode of ['tower', 'island', 'golem', 'map']) {
    await handleAdventureAction({ dataset: { action: 'adventure-mode', mode } }, context);
    renderAdventures({ state: started, e, icon, heroAvatar });
  }
  assert.deepEqual((await readState()).adventure, snapshots);
});

test('pausing map animations survives zoom and place selection without changing adventure state', async t => {
  documentStub(t);
  const { state: readState } = await fixture(t);
  const state = await readState();
  const before = structuredClone(state);
  let requests = 0;
  const context = { api: async () => { requests++; }, mutate: async fn => fn(), render() {}, toast() {}, confirmDialog: async () => true };
  resetAdventureState();
  const pauseButton = () => renderWorldMap({ state, e, icon }).match(/<button[^>]*data-action="adventure-map-motion"[^>]*>/)?.[0];
  assert.match(pauseButton(), /aria-pressed="false"/);
  await handleAdventureAction({ dataset: { action: 'adventure-map-motion' } }, context);
  assert.match(pauseButton(), /aria-pressed="true"/);
  await handleAdventureAction({ dataset: { action: 'adventure-map-zoom-in' } }, context);
  await handleAdventureAction({ dataset: { action: 'adventure-map-select', location: 'zephyrath' } }, context);
  const rendered = renderWorldMap({ state, e, icon });
  assert.match(rendered, /125%/);
  assert.match(rendered, /data-map-detail="zephyrath"/);
  assert.match(pauseButton(), /aria-pressed="true"/);
  assert.deepEqual(await readState(), before);
  assert.equal(requests, 0);
  await handleAdventureAction({ dataset: { action: 'adventure-map-motion' } }, context);
  assert.match(pauseButton(), /aria-pressed="false"/);
  await handleAdventureAction({ dataset: { action: 'adventure-map-motion' } }, context);
  resetAdventureState();
  assert.match(pauseButton(), /aria-pressed="false"/);
});
