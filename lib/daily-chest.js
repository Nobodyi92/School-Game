import { normalizeInventory } from './items.js';

export const DAILY_CHEST_TIME_ZONE = 'Europe/Berlin';
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: DAILY_CHEST_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
export function dailyChestDay(timestamp) {
  const parts = Object.fromEntries(dayFormat.formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function createDailyChestApi({ db, byId, viewUser, transaction, now, requireThat, studentOnly }) {
  const read = (id, day) => db.prepare('SELECT claimed_at FROM daily_chest_claims WHERE user_id = ? AND day = ?').get(id, day);
  function stateFor(user) {
    if (user.role !== 'student') return null;
    const day = dailyChestDay(now()), claim = read(user.id, day);
    return { day, timeZone: DAILY_CHEST_TIME_ZONE, available: !claim, claimedAt: claim?.claimed_at || null };
  }
  function handle(path, method, body, user) {
    if (path !== '/api/chests/daily') return null;
    studentOnly(user);
    requireThat(method === 'POST', 405, 'Hole deine tägliche Truhe mit einer POST-Anfrage ab.');
    return transaction(() => {
      const fresh = byId(user.id);
      studentOnly(fresh);
      const timestamp = new Date(now()), day = dailyChestDay(timestamp);
      requireThat(!read(fresh.id, day), 409, 'Deine Gratis-Truhe hast du heute schon abgeholt. Morgen wartet die nächste.');
      const inventory = normalizeInventory(fresh.inventory);
      requireThat(Number.isSafeInteger(inventory.chests + 1), 409, 'Dein Truhenlager ist voll. Öffne zuerst eine Truhe.');
      inventory.chests++;
      db.prepare('INSERT INTO daily_chest_claims (user_id, day, claimed_at) VALUES (?, ?, ?)').run(fresh.id, day, timestamp.toISOString());
      db.prepare('UPDATE users SET inventory = ? WHERE id = ?').run(JSON.stringify(inventory), fresh.id);
      const current = byId(fresh.id);
      return { dailyChest: stateFor(current), user: viewUser(current, { includeEmail: true }) };
    });
  }
  return { stateFor, handle };
}
