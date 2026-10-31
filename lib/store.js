import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

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
  `);
  if (demo) seedDemo(db);
  return db;
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
    ['demo-lina', 'Lina Fischer', 'lina@demo.schule', 'student', 'Funkenfuchs', 'fox', 125, 225, { strength: 2, focus: 2, endurance: 2 }, { potion: 2 }],
    ['demo-ben', 'Ben Schneider', 'ben@demo.schule', 'student', 'Nebelpfote', 'cat', 75, 175, { strength: 2, focus: 1, endurance: 2 }, { potion: 1 }],
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

export function userView(row, { includeEmail = false } = {}) {
  const result = {
    id: row.id, name: row.name, role: row.role, schoolName: 'Campus Nord',
    characterName: row.character_name, avatar: row.avatar,
    xp: row.xp, totalXp: row.total_xp, level: 1 + Math.floor(row.total_xp / 100),
    skills: JSON.parse(row.skills), inventory: JSON.parse(row.inventory),
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
