import { HOME_LOCATIONS, FURNITURE, homeInventory, homeLocationFor, normalizeHomeLayout } from '../shared/housing.js';

export function createHousingApi({ db, transaction, now, requireThat, studentOnly }) {
  const read = id => db.prepare('SELECT * FROM player_homes WHERE user_id = ?').get(id);
  function stateFor(user) {
    if (user.role !== 'student') return null;
    const unlocked = db.prepare('SELECT item_id FROM cosmetic_unlocks WHERE user_id = ?').all(user.id).map(entry => entry.item_id);
    const row = read(user.id);
    return { catalogue: { locations: HOME_LOCATIONS, furniture: FURNITURE }, owned: homeInventory(unlocked),
      house: row ? { locationId: row.location_id, placements: JSON.parse(row.layout), version: row.version, updatedAt: row.updated_at } : null };
  }
  function handle(path, method, body, user) {
    if (path !== '/api/home') return null;
    studentOnly(user);
    if (method === 'GET') return { home: stateFor(user) };
    requireThat(method === 'POST', 405, 'Bitte eine gültige Hausaktion wählen.');
    return transaction(() => {
      const row = read(user.id);
      requireThat(Number.isSafeInteger(body.version) && body.version >= 0, 400, 'Die aktuelle Hausversion fehlt.');
      requireThat(body.version === (row?.version || 0), 409, 'Dein Haus wurde inzwischen an anderer Stelle gespeichert. Lade den aktuellen Hausstand, bevor du erneut speicherst.');
      requireThat(homeLocationFor(body.locationId), 400, 'Wähle einen verfügbaren Wohnort.');
      let placements;
      try { placements = normalizeHomeLayout(body.placements, stateFor(user).owned); }
      catch (error) { requireThat(false, 400, error.message); }
      const timestamp = new Date(now()).toISOString();
      db.prepare(`INSERT INTO player_homes (user_id, location_id, layout, version, updated_at) VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(user_id) DO UPDATE SET location_id=excluded.location_id, layout=excluded.layout,
          version=player_homes.version+1, updated_at=excluded.updated_at`)
        .run(user.id, body.locationId, JSON.stringify(placements), timestamp);
      return { home: stateFor(user) };
    });
  }
  return { stateFor, handle };
}
