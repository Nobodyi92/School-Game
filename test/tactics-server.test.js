import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';
import { availableAbilities, defaultAbilityLoadout } from '../shared/abilities.js';
import { ANCESTRIES } from '../shared/ancestries.js';

const password = 'Klassenhelden!2026';
const ok = response => { assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body; };
const rejected = response => assert.ok(response.status >= 400 && response.status < 500, JSON.stringify(response));
const economy = user => ({ xp: user.xp, totalXp: user.totalXp, wallet: user.wallet, inventory: user.inventory,
  equipment: user.equipment, skills: user.skills, stats: user.stats, cosmetics: user.cosmetics });

async function fixture(t, options = {}) {
  const app = createApp({ dbPath: ':memory:', ...options });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await app.close(); } };
  t.after(close);
  const client = (initialCookie = '') => {
    let cookie = initialCookie;
    return {
      get cookie() { return cookie; },
      async request(path, body) {
        const response = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST',
          headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        return { status: response.status, body: await response.json() };
      },
      async login(email = 'lina@demo.schule') { return ok(await this.request('/api/auth/login', { email, password })).user; },
      async state() { return ok(await this.request('/api/state')); },
    };
  };
  const level = (value, userId = 'demo-lina') => app.db.prepare('UPDATE users SET total_xp = ? WHERE id = ?').run((value - 1) * 100, userId);
  const battle = async (student, id) => (await student.state()).battles.find(entry => entry.id === id);
  const editBattle = (id, change) => {
    const row = app.db.prepare('SELECT state FROM battles WHERE id = ?').get(id);
    const state = JSON.parse(row.state); change(state);
    app.db.prepare('UPDATE battles SET state = ?, status = ? WHERE id = ?').run(JSON.stringify(state), state.status, id);
    return state;
  };
  return { ...app, origin, client, level, close, battle, editBattle };
}

function selectedWith(available, ability) {
  return [ability.id, ...available.filter(item => item.id !== ability.id).slice(0, 2).map(item => item.id)];
}
function attackAbility(available) {
  const found = available.find(ability => ability.target === 'enemy');
  assert.ok(found, 'Every ancestry needs an available enemy-targeted skill.');
  return found;
}

test('ability loadouts require a student and exactly three unlocked distinct skills without spending rewards', async t => {
  const f = await fixture(t), student = f.client(), teacher = f.client(), anonymous = f.client();
  await student.login(); await teacher.login('lehrer@demo.schule'); f.level(1);
  const before = (await student.state()).user;
  const available = availableAbilities(before.ancestry, before.level);
  const selection = available.slice(0, 3).map(ability => ability.id).reverse();
  assert.equal(new Set(before.abilityLoadout).size, 3);
  assert.equal((await anonymous.request('/api/abilities', { abilityLoadout: selection })).status, 401);
  assert.equal((await teacher.request('/api/abilities', { abilityLoadout: selection })).status, 403);
  const changed = ok(await student.request('/api/abilities', { abilityLoadout: selection, xp: 9999, energy: 9999 })).user;
  assert.deepEqual(changed.abilityLoadout, selection);
  assert.deepEqual(changed.combatAbilities.equipped, selection);
  assert.deepEqual(economy(changed), economy(before));
  const allowed = new Set(available.map(ability => ability.id));
  const future = availableAbilities(before.ancestry, 100).find(ability => !allowed.has(ability.id));
  assert.ok(future, 'Leveling must unlock a genuinely new skill.');
  const foreign = ANCESTRIES.flatMap(ancestry => availableAbilities(ancestry.id, 100))
    .find(ability => !availableAbilities(before.ancestry, 100).some(own => own.id === ability.id));
  assert.ok(foreign, 'Ancestry-specific abilities must remain distinct.');
  for (const invalid of [null, [], selection.slice(0, 2), [...selection, selection[0]],
    [selection[0], selection[0], selection[1]], [selection[0], selection[1], '__proto__'],
    [selection[0], selection[1], future.id], [selection[0], selection[1], foreign.id], [0, {}, null]]) {
    rejected(await student.request('/api/abilities', { abilityLoadout: invalid, level: 100 }));
    assert.deepEqual((await student.state()).user.abilityLoadout, selection);
  }
});

test('registration ignores forged tactical fields and ancestry changes normalize a saved loadout', async t => {
  const f = await fixture(t), student = f.client();
  const ancestry = ANCESTRIES[0].id;
  const forged = ok(await student.request('/api/auth/register', { name: 'Taktik Test', email: 'tactics@example.test',
    password, characterName: 'Runenlicht', ancestry, abilityLoadout: ['invalid-a', 'invalid-b', 'invalid-c'],
    level: 100, energy: 99999, totalXp: 99999 })).user;
  assert.equal(forged.level, 1);
  assert.deepEqual(forged.abilityLoadout, defaultAbilityLoadout(ancestry, 1));
  const other = ANCESTRIES.find(item => item.id !== ancestry).id;
  const switched = ok(await student.request('/api/character', { characterName: 'Neuer Wind', ancestry: other })).user;
  assert.equal(switched.abilityLoadout.length, 3);
  assert.equal(new Set(switched.abilityLoadout).size, 3);
  assert.ok(switched.abilityLoadout.every(id => availableAbilities(other, 1).some(ability => ability.id === id)));
  assert.deepEqual(economy(switched).inventory, economy(forged).inventory);
  const dbLoadout = JSON.parse(f.db.prepare('SELECT ability_loadout FROM users WHERE id = ?').get(forged.id).ability_loadout);
  assert.deepEqual(dbLoadout, switched.abilityLoadout);
});

test('new battles snapshot the chosen skills and reject forged abilities, energy and targets atomically', async t => {
  const f = await fixture(t), student = f.client(); await student.login(); f.level(8);
  const user = (await student.state()).user;
  const available = availableAbilities(user.ancestry, user.level), offensive = attackAbility(available);
  const selection = selectedWith(available, offensive);
  ok(await student.request('/api/abilities', { abilityLoadout: selection }));
  const started = ok(await student.request('/api/battles', { opponentId: 'training-bot' })).battle;
  const fighter = started.state.fighters.find(item => item.id === user.id);
  assert.equal(fighter.tacticsVersion, 1);
  assert.deepEqual(fighter.abilityLoadout, selection);
  const replacement = available.filter(ability => ability.id !== offensive.id).slice(0, 3).map(ability => ability.id);
  assert.equal(replacement.length, 3);
  ok(await student.request('/api/abilities', { abilityLoadout: replacement }));
  assert.deepEqual((await f.battle(student, started.id)).state, started.state, 'Changing the preparation must not rewrite a running duel.');
  const unselected = available.find(ability => !selection.includes(ability.id));
  assert.ok(unselected);
  for (const payload of [{ action: 'ability:unknown' }, { action: `ability:${unselected.id}` },
    { action: `ability:${offensive.id}`, targetId: 'another-student' }]) {
    const before = (await f.battle(student, started.id)).state;
    rejected(await student.request(`/api/battles/${started.id}/actions`, payload));
    assert.deepEqual((await f.battle(student, started.id)).state, before);
  }
  f.editBattle(started.id, state => { state.fighters.find(item => item.id === user.id).energy = 0; });
  const empty = (await f.battle(student, started.id)).state, beforeEconomy = economy((await student.state()).user);
  rejected(await student.request(`/api/battles/${started.id}/actions`, { action: `ability:${offensive.id}`, energy: 9999, cost: 0 }));
  assert.deepEqual((await f.battle(student, started.id)).state, empty);
  assert.deepEqual(economy((await student.state()).user), beforeEconomy);
  f.editBattle(started.id, state => { state.fighters.find(item => item.id === user.id).energy = 6; });
  const executed = ok(await student.request(`/api/battles/${started.id}/actions`, { action: `ability:${offensive.id}`, targetId: 'training-bot' })).battle;
  assert.ok(executed.state.turns >= 1);
  assert.ok(executed.state.fighters.find(item => item.id === user.id).energy < 6);
  assert.deepEqual(executed.state.fighters.find(item => item.id === user.id).abilityLoadout, selection);
});

test('tower and island skills use saved loadouts and validated target and turn information', async t => {
  const f = await fixture(t, { islandRandomInt: () => 0 }), student = f.client(); await student.login();
  const user = (await student.state()).user, available = availableAbilities(user.ancestry, user.level);
  const ability = attackAbility(available), selection = selectedWith(available, ability);
  ok(await student.request('/api/abilities', { abilityLoadout: selection }));
  const tower = ok(await student.request('/api/tower/start', {})).tower;
  assert.equal(tower.state.player.tacticsVersion, 1);
  assert.deepEqual(tower.state.player.abilityLoadout, selection);
  const row = f.db.prepare('SELECT state FROM tower_runs WHERE user_id = ?').get(user.id);
  const ready = JSON.parse(row.state); ready.player.energy = 6;
  f.db.prepare('UPDATE tower_runs SET state = ? WHERE user_id = ?').run(JSON.stringify(ready), user.id);
  const payload = { runId: tower.id, turn: ready.totalTurns, action: `ability:${ability.id}` };
  rejected(await student.request('/api/tower/action', { ...payload, targetId: 'outside-the-run' }));
  assert.deepEqual((await student.state()).adventure.tower.state, ready);
  const moved = ok(await student.request('/api/tower/action', { ...payload, targetId: ready.enemy.id })).tower;
  assert.equal(moved.state.totalTurns, ready.totalTurns + 1);
  assert.ok(moved.state.player.energy < 6);
  rejected(await student.request('/api/tower/action', { ...payload, targetId: ready.enemy.id }));
  assert.deepEqual((await student.state()).adventure.tower, moved);

  const island = ok(await student.request('/api/island/start', {})).island;
  const raw = JSON.parse(f.db.prepare('SELECT state FROM island_runs WHERE user_id = ?').get(user.id).state);
  // Prepare a valid combat choice even if the randomized first fork offered a peaceful pair.
  raw.choices = [{ id: 'path-1-0', kind: 'combat', title: 'Kristallhöhle', description: 'Ein Wächter wartet.' }];
  f.db.prepare('UPDATE island_runs SET state = ? WHERE user_id = ?').run(JSON.stringify(raw), user.id);
  const landed = ok(await student.request('/api/island/choice', { runId: island.id, version: raw.version, choice: 'path-1-0' })).island;
  const combat = JSON.parse(f.db.prepare('SELECT state FROM island_runs WHERE user_id = ?').get(user.id).state);
  combat.player.energy = 6;
  f.db.prepare('UPDATE island_runs SET state = ? WHERE user_id = ?').run(JSON.stringify(combat), user.id);
  const invalid = { runId: island.id, version: landed.state.version, action: `ability:${ability.id}`, targetId: 'outside-the-run' };
  const before = (await student.state()).adventure.island;
  rejected(await student.request('/api/island/action', invalid));
  assert.deepEqual((await student.state()).adventure.island, before);
  const acted = ok(await student.request('/api/island/action', { ...invalid, targetId: combat.enemy.id })).island;
  assert.equal(acted.state.version, combat.version + 1);
  assert.ok(acted.state.player.energy < 6);
});

test('saved loadouts, energy, status effects and running battle snapshots survive a restart', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'aetheria-tactics-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'game.sqlite'), first = await fixture(t, { dbPath }), student = first.client();
  const user = await student.login();
  const selection = [...user.abilityLoadout].reverse();
  ok(await student.request('/api/abilities', { abilityLoadout: selection }));
  const started = ok(await student.request('/api/battles', { opponentId: 'training-bot' })).battle;
  first.editBattle(started.id, state => {
    const fighter = state.fighters.find(item => item.id === user.id);
    fighter.energy = 4; fighter.effects = { protected: { turns: 2, charges: 1 } };
  });
  const saved = await first.battle(student, started.id), savedUser = (await student.state()).user;
  const cookie = student.cookie;
  await first.close();
  const second = await fixture(t, { dbPath }), resumed = second.client(cookie);
  assert.deepEqual((await resumed.state()).user.abilityLoadout, savedUser.abilityLoadout);
  assert.deepEqual(await second.battle(resumed, started.id), saved);
  assert.deepEqual(economy((await resumed.state()).user), economy(savedUser));
});

test('legacy saved duels retain their original free focus and do not acquire tactical resources', async t => {
  const f = await fixture(t), student = f.client(); const user = await student.login();
  const started = ok(await student.request('/api/battles', { opponentId: 'training-bot' })).battle;
  const legacy = f.editBattle(started.id, state => {
    delete state.combatVersion; delete state.tacticsVersion;
    for (const fighter of state.fighters) {
      delete fighter.tacticsVersion; delete fighter.energy; delete fighter.maxEnergy;
      delete fighter.abilityLoadout; delete fighter.effects; delete fighter.passive;
    }
  });
  const actor = legacy.fighters.find(fighter => fighter.id === user.id);
  const target = legacy.fighters.find(fighter => fighter.id !== user.id);
  const expected = Math.max(1, actor.stats.focusDamage - target.stats.defense);
  const after = ok(await student.request(`/api/battles/${started.id}/actions`, { action: 'focus' })).battle.state;
  assert.equal(after.fighters.find(fighter => fighter.id === target.id).hp, target.hp - expected);
  assert.equal(after.fighters.find(fighter => fighter.id === user.id).focusCooldown, 2);
  assert.ok(after.fighters.every(fighter => fighter.energy === undefined && fighter.tacticsVersion === undefined));
});

test('group support validates live allies, queues exact targets and spends energy once when the round resolves', async t => {
  const f = await fixture(t), lina = f.client(), ben = f.client(), druid = f.client();
  const linaUser = await lina.login(), benUser = await ben.login('ben@demo.schule');
  const druidUser = ok(await druid.request('/api/auth/register', { name: 'Gruppenheilerin', email: 'healer@example.test',
    password, characterName: 'Wurzellicht', ancestry: 'aether-druid' })).user;
  const available = availableAbilities(druidUser.ancestry, druidUser.level);
  const healing = available.find(ability => ability.target === 'ally' && ability.healFactor > 0);
  assert.ok(healing);
  ok(await druid.request('/api/abilities', { abilityLoadout: selectedWith(available, healing) }));
  ok(await lina.request('/api/abilities', { abilityLoadout: ['mend', 'aether-bolt', 'mark'] }));
  const created = ok(await lina.request('/api/raids', {})).raid;
  ok(await ben.request(`/api/raids/${created.id}/join`, {}));
  ok(await druid.request(`/api/raids/${created.id}/join`, {}));
  ok(await lina.request(`/api/raids/${created.id}/start`, {}));
  const raid = async () => (await lina.state()).adventure.raids.find(entry => entry.id === created.id);
  const row = f.db.prepare('SELECT state FROM raids WHERE id = ?').get(created.id);
  const setup = JSON.parse(row.state);
  setup.members.forEach(member => { member.energy = 6; });
  setup.members.find(member => member.id === benUser.id).hp -= 35;
  f.db.prepare('UPDATE raids SET state = ? WHERE id = ?').run(JSON.stringify(setup), created.id);
  const before = await raid();
  assert.equal(before.state.members.find(member => member.id === druidUser.id).tacticsVersion, 1);
  const payload = { round: before.state.round, action: `ability:${healing.id}` };
  rejected(await druid.request(`/api/raids/${created.id}/action`, { ...payload, targetId: 'another-school-student' }));
  rejected(await druid.request(`/api/raids/${created.id}/action`, { ...payload, targetId: before.state.boss.id }));
  assert.deepEqual(await raid(), before);
  const queued = ok(await druid.request(`/api/raids/${created.id}/action`, { ...payload, targetId: benUser.id })).raid;
  assert.equal(queued.state.actions[druidUser.id], payload.action);
  assert.equal(queued.state.actionTargets[druidUser.id], benUser.id);
  assert.equal(queued.state.members.find(member => member.id === druidUser.id).energy, 6, 'A queued skill must not spend energy before resolution.');
  rejected(await druid.request(`/api/raids/${created.id}/action`, { ...payload, targetId: linaUser.id }));
  assert.deepEqual(await raid(), queued);
  ok(await lina.request(`/api/raids/${created.id}/action`, { round: before.state.round, action: 'runeSun' }));
  const resolved = ok(await ben.request(`/api/raids/${created.id}/action`, { round: before.state.round, action: 'runeMoon' })).raid;
  assert.equal(resolved.state.round, before.state.round + 1);
  assert.equal(resolved.state.members.find(member => member.id === druidUser.id).energy, 6 - healing.cost);
  assert.ok(resolved.state.members.find(member => member.id === benUser.id).hp > before.state.members.find(member => member.id === benUser.id).hp);
  rejected(await druid.request(`/api/raids/${created.id}/action`, { ...payload, targetId: benUser.id }));
  assert.deepEqual(await raid(), resolved, 'A stale round cannot heal or spend a second time.');

  // Both healers chose a valid injured target. The first heal filling its HP must
  // not invalidate the second queued heal and roll back the whole group round.
  const overlap = structuredClone(resolved.state);
  overlap.members.find(member => member.id === benUser.id).hp = overlap.members.find(member => member.id === benUser.id).maxHp - 1;
  overlap.members.forEach(member => { member.energy = 6; });
  f.db.prepare('UPDATE raids SET state = ? WHERE id = ?').run(JSON.stringify(overlap), created.id);
  ok(await lina.request(`/api/raids/${created.id}/action`, { round: overlap.round, action: `ability:${healing.id}`, targetId: benUser.id }));
  ok(await druid.request(`/api/raids/${created.id}/action`, { round: overlap.round, action: `ability:${healing.id}`, targetId: benUser.id }));
  const healedTogether = ok(await ben.request(`/api/raids/${created.id}/action`, { round: overlap.round, action: 'guard' })).raid;
  assert.equal(healedTogether.state.round, overlap.round + 1);
  for (const id of [linaUser.id, druidUser.id]) assert.equal(healedTogether.state.members.find(member => member.id === id).energy, 6 - healing.cost);

  // Killing the boss with the first queued strike must finish the victory even
  // when another damage skill would otherwise resolve against the dead boss.
  const finalRound = structuredClone(healedTogether.state);
  finalRound.boss.hp = 1; finalRound.boss.phase = 'core'; finalRound.boss.shielded = false;
  finalRound.members.forEach(member => { member.energy = 6; });
  f.db.prepare('UPDATE raids SET state = ? WHERE id = ?').run(JSON.stringify(finalRound), created.id);
  ok(await lina.request(`/api/raids/${created.id}/action`, { round: finalRound.round, action: 'ability:aether-bolt', targetId: finalRound.boss.id }));
  ok(await druid.request(`/api/raids/${created.id}/action`, { round: finalRound.round, action: 'ability:aether-bolt', targetId: finalRound.boss.id }));
  const won = ok(await ben.request(`/api/raids/${created.id}/action`, { round: finalRound.round, action: 'guard' })).raid;
  assert.equal(won.status, 'won');
  assert.equal(won.state.boss.hp, 0);
});

test('tactical catalogue and controls are served locally with the expected module and CSS types', async t => {
  const f = await fixture(t, { demo: false });
  for (const [path, mime] of [['/shared/abilities.js', /javascript/], ['/combat-skills.js', /javascript/], ['/combat-skills.css', /text\/css/]]) {
    const response = await fetch(f.origin + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), mime);
    assert.ok((await response.text()).length > 100);
  }
});
