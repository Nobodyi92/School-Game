import { HOME_LOCATIONS, FURNITURE, homeInventory, homeLocationFor, normalizeHomeLayout, initialHomeLayout } from '../shared/housing.js';

export function createHousingApi({ db, transaction, now, requireThat, studentOnly, byId, viewUser }) {
  const read = id => db.prepare('SELECT * FROM player_homes WHERE user_id = ?').get(id);
  function stateFor(user) {
    if (user.role !== 'student') return null;
    const unlocked = db.prepare('SELECT item_id FROM cosmetic_unlocks WHERE user_id = ?').all(user.id).map(entry => entry.item_id);
    const row = read(user.id);
    return { catalogue: { locations: HOME_LOCATIONS, furniture: FURNITURE }, owned: homeInventory(unlocked),
      ownedLocations: db.prepare('SELECT location_id FROM home_ownership WHERE user_id = ? ORDER BY location_id').all(user.id)
        .map(entry => entry.location_id).filter(id => homeLocationFor(id)),
      house: row ? { locationId: row.location_id, placements: JSON.parse(row.layout), version: row.version, updatedAt: row.updated_at } : null };
  }
  function handle(path, method, body, user) {
    if (path !== '/api/home' && path !== '/api/home/buy') return null;
    studentOnly(user);
    if (method === 'GET' && path === '/api/home') return { home: stateFor(user) };
    requireThat(method === 'POST', 405, 'Bitte eine gültige Hausaktion wählen.');
    return transaction(() => {
      const fresh = byId(user.id);
      studentOnly(fresh);
      const row = read(user.id);
      const location = homeLocationFor(body.locationId);
      requireThat(location, 400, 'Wähle einen verfügbaren Wohnort.');
      const ownsLocation = db.prepare('SELECT 1 FROM home_ownership WHERE user_id = ? AND location_id = ?').get(user.id, location.id);
      if (path === '/api/home/buy') {
        requireThat(!ownsLocation, 409, 'Dieses Haus gehört dir bereits.');
        requireThat(Number.isSafeInteger(fresh.coins) && fresh.coins >= location.price, 400, 'Dir fehlt noch Geld für dieses Haus.');
        const debit = db.prepare('UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?').run(location.price, user.id, location.price);
        requireThat(debit.changes === 1, 409, 'Dein Geldbeutel hat sich geändert. Lade den aktuellen Stand.');
        const timestamp = new Date(now()).toISOString();
        db.prepare('INSERT INTO home_ownership (user_id, location_id, acquired_at) VALUES (?, ?, ?)').run(user.id, location.id, timestamp);
        if (!row) db.prepare('INSERT INTO player_homes (user_id, location_id, layout, version, updated_at) VALUES (?, ?, ?, 1, ?)')
          .run(user.id, location.id, JSON.stringify(initialHomeLayout()), timestamp);
        const current = byId(user.id);
        return { home: stateFor(current), user: viewUser(current, { includeEmail: true }) };
      }
      requireThat(ownsLocation, 403, 'Kaufe dieses Haus zuerst mit Spielgeld.');
      requireThat(Number.isSafeInteger(body.version) && body.version >= 0, 400, 'Die aktuelle Hausversion fehlt.');
      requireThat(body.version === (row?.version || 0), 409, 'Dein Haus wurde inzwischen an anderer Stelle gespeichert. Lade den aktuellen Hausstand, bevor du erneut speicherst.');
      let placements;
      try { placements = normalizeHomeLayout(body.placements, stateFor(fresh).owned); }
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
