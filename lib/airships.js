import { randomInt, randomUUID } from 'node:crypto';
import { AIRSHIPS, SHIP_PARTS, SHIP_DOCKS, SHIP_SLOTS, shipStats, moneyRangeForLevel,
  journeyDurationMs, partsForAdventureRewards } from '../shared/airships.js';

export function rollChestCoins(level, randomIntFn = randomInt) {
  const { min, max } = moneyRangeForLevel(level);
  const coins = randomIntFn(min, max + 1);
  if (!Number.isSafeInteger(coins) || coins < min || coins > max) throw new RangeError('Ungültiger Münzwurf.');
  return coins;
}

// Called only when the adventure API secures a victory's rewards, inside its transaction.
export function grantShipParts(db, userId, rewardIds, level, timestamp = new Date().toISOString()) {
  const ids = partsForAdventureRewards(rewardIds, level);
  if (!ids.length) return [];
  const insert = db.prepare('INSERT OR IGNORE INTO airship_parts (user_id, part_id, unlocked_at) VALUES (?, ?, ?)');
  return ids.filter(id => insert.run(userId, id, timestamp).changes > 0);
}

function parse(raw, fallback) {
  try { return JSON.parse(raw) ?? fallback; } catch { return fallback; }
}
function modificationsFor(raw) {
  const data = typeof raw === 'string' ? parse(raw, {}) : raw || {};
  return Object.fromEntries(SHIP_SLOTS.map(slot => [slot,
    SHIP_PARTS.some(part => part.id === data[slot] && part.slot === slot) ? data[slot] : null]));
}

export function createAirshipApi({ db, viewUser, byId, transaction, now, requireThat, studentOnly }) {
  const currentTime = () => new Date(now()).getTime();
  const levelFor = user => 1 + Math.floor(user.total_xp / 100);
  const readState = id => db.prepare('SELECT * FROM airship_state WHERE user_id = ?').get(id);
  const readShip = (id, shipId) => db.prepare('SELECT * FROM airship_ownership WHERE user_id = ? AND ship_id = ?').get(id, shipId);

  function effectiveState(row) {
    const journey = parse(row?.journey || 'null', null);
    const arrived = journey && currentTime() >= new Date(journey.arrivesAt).getTime();
    return { activeShipId: row?.active_ship_id || null, dockId: arrived ? journey.toDockId : row?.dock_id || 'nebelheim',
      journey: arrived ? null : journey, version: row?.version || 0 };
  }

  function stateFor(user) {
    if (user.role !== 'student') return null;
    const owned = db.prepare('SELECT * FROM airship_ownership WHERE user_id = ? ORDER BY acquired_at, ship_id').all(user.id)
      .filter(row => AIRSHIPS.some(ship => ship.id === row.ship_id)).map(row => {
        const modifications = modificationsFor(row.modifications);
        return { shipId: row.ship_id, modifications, acquiredAt: row.acquired_at, stats: shipStats(row.ship_id, modifications) };
      });
    const ownedParts = db.prepare('SELECT part_id FROM airship_parts WHERE user_id = ? ORDER BY part_id').all(user.id)
      .map(row => row.part_id).filter(id => SHIP_PARTS.some(part => part.id === id));
    return { catalogue: { ships: AIRSHIPS, parts: SHIP_PARTS, docks: SHIP_DOCKS }, owned, ownedParts,
      ...effectiveState(readState(user.id)) };
  }

  function prepareState(id) {
    db.prepare('INSERT OR IGNORE INTO airship_state (user_id) VALUES (?)').run(id);
    const row = readState(id);
    const effective = effectiveState(row);
    // Completing a flight is derived from its fixed server timestamps. Persist on the next action,
    // without changing its version, so a client that has just displayed arrival can depart normally.
    if (row.journey !== 'null' && !effective.journey) {
      db.prepare("UPDATE airship_state SET dock_id = ?, journey = 'null' WHERE user_id = ?").run(effective.dockId, id);
    }
    return effective;
  }

  function requireShip(user, shipId) {
    const model = AIRSHIPS.find(ship => ship.id === shipId);
    requireThat(model, 400, 'Dieses Luftschiff gibt es nicht.');
    requireThat(levelFor(user) >= model.minLevel, 403, `Dieses Luftschiff wird ab Spielerlevel ${model.minLevel} freigeschaltet.`);
    const owned = readShip(user.id, shipId);
    requireThat(owned, 403, 'Dieses Luftschiff gehört dir noch nicht.');
    return { model, owned };
  }

  const changed = id => {
    db.prepare('UPDATE airship_state SET version = version + 1 WHERE user_id = ?').run(id);
    const fresh = byId(id);
    return { airships: stateFor(fresh), user: viewUser(fresh) };
  };

  function handle(path, method, body, user) {
    if (!/^\/api\/airships(?:\/|$)/.test(path)) return null;
    requireThat(method === 'POST', 405, 'Diese Luftschiffaktion benötigt eine POST-Anfrage.');
    studentOnly(user);
    requireThat(['/api/airships/buy', '/api/airships/select', '/api/airships/equip', '/api/airships/travel'].includes(path),
      404, 'Diese Luftschiffaktion gibt es nicht.');
    requireThat(body && typeof body === 'object' && !Array.isArray(body), 400, 'Ungültige Luftschiffaktion.');
    return transaction(() => {
      const fresh = byId(user.id);
      studentOnly(fresh);
      const state = prepareState(fresh.id);

      if (path === '/api/airships/buy') {
        const model = AIRSHIPS.find(ship => ship.id === body.shipId);
        requireThat(model, 400, 'Dieses Luftschiff gibt es nicht.');
        requireThat(levelFor(fresh) >= model.minLevel, 403, `Dieses Luftschiff wird ab Spielerlevel ${model.minLevel} freigeschaltet.`);
        requireThat(!readShip(fresh.id, model.id), 409, 'Dieses Luftschiff gehört dir bereits.');
        requireThat(Number.isSafeInteger(fresh.coins) && fresh.coins >= model.price, 400, 'Dir fehlen noch Münzen für dieses Luftschiff.');
        const debit = db.prepare('UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?').run(model.price, fresh.id, model.price);
        requireThat(debit.changes === 1, 409, 'Dein Münzstand hat sich geändert. Lade den aktuellen Stand.');
        db.prepare('INSERT INTO airship_ownership (user_id, ship_id, modifications, acquired_at) VALUES (?, ?, ?, ?)')
          .run(fresh.id, model.id, JSON.stringify(modificationsFor({})), new Date(currentTime()).toISOString());
        if (!state.activeShipId) db.prepare('UPDATE airship_state SET active_ship_id = ? WHERE user_id = ?').run(model.id, fresh.id);
      } else if (path === '/api/airships/select') {
        requireThat(!state.journey, 409, 'Du kannst dein Luftschiff nach der Ankunft wechseln.');
        requireShip(fresh, body.shipId);
        db.prepare('UPDATE airship_state SET active_ship_id = ? WHERE user_id = ?').run(body.shipId, fresh.id);
      } else if (path === '/api/airships/equip') {
        requireThat(!state.journey, 409, 'Du kannst dein Luftschiff nach der Ankunft umbauen.');
        const { owned } = requireShip(fresh, body.shipId);
        requireThat(SHIP_SLOTS.includes(body.slot), 400, 'Wähle Segel, Rumpf oder Flagge.');
        requireThat(body.partId === null || typeof body.partId === 'string', 400, 'Ungültiges Luftschiffteil.');
        if (body.partId !== null) {
          const part = SHIP_PARTS.find(item => item.id === body.partId && item.slot === body.slot);
          requireThat(part, 400, 'Dieses Teil passt nicht zu diesem Platz.');
          requireThat(db.prepare('SELECT 1 FROM airship_parts WHERE user_id = ? AND part_id = ?').get(fresh.id, part.id),
            403, 'Dieses Luftschiffteil musst du erst in einem Abenteuer finden.');
        }
        const modifications = { ...modificationsFor(owned.modifications), [body.slot]: body.partId };
        db.prepare('UPDATE airship_ownership SET modifications = ? WHERE user_id = ? AND ship_id = ?')
          .run(JSON.stringify(modifications), fresh.id, body.shipId);
      } else {
        requireThat(Number.isSafeInteger(body.version) && body.version >= 0, 400, 'Die aktuelle Reiseversion fehlt.');
        requireThat(body.version === state.version, 409, 'Dein Luftschiffstand hat sich geändert. Lade den aktuellen Stand.');
        requireThat(!state.journey, 409, 'Dein Luftschiff ist gerade unterwegs.');
        requireThat(state.activeShipId, 400, 'Kaufe zuerst ein Luftschiff.');
        const { owned } = requireShip(fresh, state.activeShipId);
        const destination = SHIP_DOCKS.find(dock => dock.id === body.destinationId);
        requireThat(destination, 400, 'Dieser Ort hat keinen Anleger im Ätherstrom.');
        requireThat(destination.id !== state.dockId, 400, 'Dein Luftschiff liegt bereits an diesem Anleger.');
        const modifications = modificationsFor(owned.modifications);
        const statsSnapshot = shipStats(state.activeShipId, modifications);
        const startedAt = currentTime();
        const duration = journeyDurationMs(statsSnapshot, state.dockId, destination.id);
        requireThat(duration > 0, 400, 'Diese Route liegt nicht im Ätherstrom.');
        const journey = { id: randomUUID(), shipId: state.activeShipId, fromDockId: state.dockId, toDockId: destination.id,
          startedAt: new Date(startedAt).toISOString(), arrivesAt: new Date(startedAt + duration).toISOString(), statsSnapshot, modifications };
        db.prepare('UPDATE airship_state SET journey = ? WHERE user_id = ?').run(JSON.stringify(journey), fresh.id);
      }
      return changed(fresh.id);
    });
  }

  return { stateFor, handle };
}
