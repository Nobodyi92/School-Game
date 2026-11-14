import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { normalizeInventory, normalizeEquipment, resolveItem, compatibleSlot } from './items.js';
import { getCombatStats } from './combat.js';
import { normalizeCosmetics, grantCompanionsForAchievements } from './cosmetics.js';
import { ancestryFor, legacyTraining, normalizeTraining, skillsFor, progressFor } from '../shared/ancestries.js';
import { walletFor } from '../shared/airships.js';

export const DEMO_PASSWORD = 'Klassenhelden!2026';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function openStore(filename, { demo = true } = {}) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
      school_id TEXT NOT NULL DEFAULT 'campus-demo',
      character_name TEXT NOT NULL,
      avatar TEXT NOT NULL DEFAULT 'fox',
      xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
      total_xp INTEGER NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
      skills TEXT NOT NULL DEFAULT '{"strength":1,"focus":1,"endurance":1}',
      inventory TEXT NOT NULL DEFAULT '{"potion":0}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rewards (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES users(id),
      teacher_id TEXT NOT NULL REFERENCES users(id),
      xp INTEGER NOT NULL CHECK (xp >= 0),
      item TEXT,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS battles (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('training', 'pvp')),
      challenger_id TEXT NOT NULL REFERENCES users(id),
      opponent_id TEXT NOT NULL,
      status TEXT NOT NULL,
      state TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS battles_challenger ON battles(challenger_id);
    CREATE INDEX IF NOT EXISTS battles_opponent ON battles(opponent_id);
    CREATE INDEX IF NOT EXISTS rewards_student ON rewards(student_id);
    CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS cosmetic_unlocks (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      unlocked_at TEXT NOT NULL,
      PRIMARY KEY(user_id, item_id)
    );
    CREATE TABLE IF NOT EXISTS tower_runs (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      id TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS island_runs (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      id TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS raids (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL,
      leader_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL,
      state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS raids_school_status ON raids(school_id, status);
    CREATE TABLE IF NOT EXISTS airship_ownership (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ship_id TEXT NOT NULL,
      modifications TEXT NOT NULL DEFAULT '{}',
      acquired_at TEXT NOT NULL,
      PRIMARY KEY(user_id, ship_id)
    );
    CREATE TABLE IF NOT EXISTS airship_parts (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      part_id TEXT NOT NULL,
      unlocked_at TEXT NOT NULL,
      PRIMARY KEY(user_id, part_id)
    );
    CREATE TABLE IF NOT EXISTS airship_state (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      active_ship_id TEXT,
      dock_id TEXT NOT NULL DEFAULT 'nebelheim',
      journey TEXT NOT NULL DEFAULT 'null',
      version INTEGER NOT NULL DEFAULT 0
    );
  `);
  // Additive upgrades preserve existing accounts, inventories and open duels.
  const columns = new Set(db.prepare('PRAGMA table_info(users)').all().map(column => column.name));
  if (!columns.has('equipment')) db.exec("ALTER TABLE users ADD COLUMN equipment TEXT NOT NULL DEFAULT '{}'");
  if (!columns.has('appearance')) db.exec(`ALTER TABLE users ADD COLUMN appearance TEXT NOT NULL
    DEFAULT '{"color":"amber","outfit":"adventurer","emblem":"star"}'`);
  if (!columns.has('cosmetic_loadout')) db.exec("ALTER TABLE users ADD COLUMN cosmetic_loadout TEXT NOT NULL DEFAULT '{}'");
  if (!columns.has('ancestry')) db.exec("ALTER TABLE users ADD COLUMN ancestry TEXT NOT NULL DEFAULT ''");
  if (!columns.has('skill_upgrades')) db.exec("ALTER TABLE users ADD COLUMN skill_upgrades TEXT NOT NULL DEFAULT '{}'");
  if (!columns.has('coins')) db.exec('ALTER TABLE users ADD COLUMN coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0)');
  if (demo) {
    seedDemo(db);
    seedDemoLoot(db);
  }
  migrateAncestries(db);
  grantCompanionsForAchievements(db);
  return db;
}

function migrateAncestries(db) {
  const players = db.prepare("SELECT * FROM users WHERE role = 'student' AND ancestry = ''").all();
  if (!players.length) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    const changed = new Map();
    for (const player of players) {
      const ancestry = ancestryFor(player.avatar).id;
      const trained = legacyTraining(player.skills);
      db.prepare('UPDATE users SET ancestry = ?, avatar = ?, skill_upgrades = ?, skills = ? WHERE id = ?')
        .run(ancestry, ancestry, JSON.stringify(trained), JSON.stringify(skillsFor(ancestry, trained)), player.id);
      changed.set(player.id, ancestry);
    }
    // Existing encounters keep their combat values. Only their player models change.
    for (const [table, key] of [['battles', 'id'], ['tower_runs', 'user_id'], ['island_runs', 'user_id'], ['raids', 'id']]) {
      for (const row of db.prepare(`SELECT ${key}, state FROM ${table} WHERE state IS NOT NULL`).all()) {
        const state = JSON.parse(row.state);
        const snapshots = table === 'battles' ? state.fighters : table === 'raids' ? state.members : [state.player];
        let touched = false;
        for (const fighter of snapshots || []) {
          if (fighter && changed.has(fighter.id) && !fighter.ancestry) {
            fighter.ancestry = changed.get(fighter.id);
            fighter.avatar = fighter.ancestry;
            touched = true;
          }
        }
        if (touched) db.prepare(`UPDATE ${table} SET state = ? WHERE ${key} = ?`).run(JSON.stringify(state), row[key]);
      }
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

function seedDemoLoot(db) {
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get('demo-loot-v1')) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const id of ['demo-lina', 'demo-ben']) {
      const row = db.prepare('SELECT inventory FROM users WHERE id = ?').get(id);
      if (!row) continue;
      const inventory = normalizeInventory(row.inventory);
      inventory.chests += 2;
      inventory.potionSmall += 1;
      for (const templateId of ['helmet-scout-common', 'helmet-scout-common', 'weapon-sun-common', 'shield-oak-common']) {
        inventory.items.push({ id: randomUUID(), templateId });
      }
      db.prepare('UPDATE users SET inventory = ? WHERE id = ?').run(JSON.stringify(inventory), id);
    }
    db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run('demo-loot-v1');
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export const APPEARANCE_OPTIONS = Object.freeze({
  color: ['amber', 'violet', 'mint', 'rose', 'sky'],
  outfit: ['adventurer', 'scholar', 'knight'],
  emblem: ['star', 'moon', 'leaf'],
});

export function normalizeAppearance(raw) {
  let value = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { value = {}; }
  }
  return Object.fromEntries(Object.entries(APPEARANCE_OPTIONS).map(([key, values]) =>
    [key, values.includes(value?.[key]) ? value[key] : values[0]]));
}

function seedDemo(db) {
  // Every account is inserted once: reopening the app never resets progress.
  const exists = db.prepare('SELECT 1 FROM users WHERE id = ?');
  const insert = db.prepare(`INSERT INTO users
    (id, name, email, password_hash, role, character_name, avatar, xp, total_xp, skills, inventory, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const now = new Date().toISOString();
  const accounts = [
    ['demo-teacher', 'Frau Weber', 'lehrer@demo.schule', 'teacher', 'Mentorin', 'owl', 0, 0, { strength: 1, focus: 1, endurance: 1 }, { potion: 0 }],
    ['demo-lina', 'Lina Fischer', 'lina@demo.schule', 'student', 'Sternenlicht', 'owl', 125, 225, { strength: 2, focus: 2, endurance: 2 }, { potion: 2 }],
    ['demo-ben', 'Ben Schneider', 'ben@demo.schule', 'student', 'Wüstenschimmer', 'cat', 75, 175, { strength: 2, focus: 1, endurance: 2 }, { potion: 1 }],
  ];
  for (const [id, name, email, role, character, avatar, xp, totalXp, skills, inventory] of accounts) {
    if (!exists.get(id)) {
      insert.run(id, name, email, hashPassword(DEMO_PASSWORD), role, character, avatar,
        xp, totalXp, JSON.stringify(skills), JSON.stringify(inventory), now);
    }
  }
  if (!db.prepare('SELECT 1 FROM rewards WHERE id = ?').get('demo-first-reward')) {
    db.prepare(`INSERT INTO rewards (id, student_id, teacher_id, xp, item, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run('demo-first-reward', 'demo-lina', 'demo-teacher', 50, 'potion',
      'Tolle Zusammenarbeit bei der Gruppenaufgabe! (Demobeispiel)', now);
  }
}

export function userView(row, { includeEmail = false, db = null } = {}) {
  const inventory = normalizeInventory(row.inventory);
  const equipment = normalizeEquipment(row.equipment);
  const skills = JSON.parse(row.skills);
  const ancestry = ancestryFor(row.ancestry || row.avatar);
  const trained = row.ancestry ? normalizeTraining(row.skill_upgrades) : legacyTraining(row.skills);
  const instances = new Map(inventory.items.map(item => [item.id, resolveItem(item)]));
  const equipmentVisuals = Object.fromEntries(Object.entries(equipment).map(([slot, id]) => {
    const item = instances.get(id);
    return [slot, compatibleSlot(item, slot) ? { templateId: item.templateId, type: item.type, rarity: item.rarity,
      visualStyle: item.visualStyle, weaponShape: item.weaponShape } : null];
  }));
  let selected = {};
  try { selected = JSON.parse(row.cosmetic_loadout || '{}'); } catch { /* Missing legacy selections use defaults. */ }
  const owned = db ? db.prepare('SELECT item_id FROM cosmetic_unlocks WHERE user_id = ? ORDER BY unlocked_at, item_id')
    .all(row.id).map(item => item.item_id) : [];
  const result = {
    id: row.id, name: row.name, role: row.role, schoolName: 'Campus Nord',
    characterName: row.character_name, avatar: row.role === 'student' ? ancestry.id : row.avatar,
    ancestry: ancestry.id, ancestryName: ancestry.name, skillProgress: progressFor(ancestry.id, trained),
    xp: row.xp, totalXp: row.total_xp, level: 1 + Math.floor(row.total_xp / 100),
    wallet: walletFor(row.coins || 0),
    skills,
    inventory: { ...inventory, items: inventory.items.map(resolveItem).filter(Boolean) },
    equipment, equipmentVisuals, appearance: normalizeAppearance(row.appearance),
    cosmetics: normalizeCosmetics({ owned, selected }),
    stats: getCombatStats({ skills, inventory, equipment }),
  };
  if (includeEmail) result.email = row.email;
  return result;
}

export function battleView(row) {
  return {
    id: row.id, type: row.type, status: row.status,
    challengerId: row.challenger_id, opponentId: row.opponent_id,
    state: row.state ? JSON.parse(row.state) : null, createdAt: row.created_at,
  };
}
