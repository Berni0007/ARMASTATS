'use strict';

// Хранилище на встроенном SQLite (node:sqlite). Один файл, без отдельного сервера.

const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id   TEXT,
  match_id    TEXT,
  type        TEXT NOT NULL,
  ts          INTEGER,
  payload     TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  match_id     TEXT PRIMARY KEY,
  server_id    TEXT,
  world        TEXT,
  started_at   INTEGER,
  ended_at     INTEGER,
  duration_sec REAL,
  end_reason   INTEGER,
  winners      TEXT,
  reported     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS players (
  uid        TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  first_seen INTEGER,
  last_seen  INTEGER
);

-- Кто участвовал в матче и за какую сторону выходил последним.
CREATE TABLE IF NOT EXISTS match_players (
  match_id TEXT NOT NULL,
  uid      TEXT NOT NULL,
  name     TEXT,
  faction  TEXT,
  PRIMARY KEY (match_id, uid)
);

CREATE TABLE IF NOT EXISTS kills (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id       TEXT,
  server_id      TEXT,
  ts             INTEGER,
  relation       TEXT,
  team_kill      INTEGER NOT NULL DEFAULT 0,
  killer_uid     TEXT,
  killer_name    TEXT,
  killer_is_ai   INTEGER NOT NULL DEFAULT 0,
  killer_faction TEXT,
  victim_uid     TEXT,
  victim_name    TEXT,
  victim_is_ai   INTEGER NOT NULL DEFAULT 0,
  victim_faction TEXT,
  weapon         TEXT,
  distance       REAL
);

-- Личные счётчики игрока за матч (мод 0.4+): присылаются нарастающим итогом, хранится последний.
CREATE TABLE IF NOT EXISTS player_match_stats (
  match_id   TEXT NOT NULL,
  uid        TEXT NOT NULL,
  assists    INTEGER NOT NULL DEFAULT 0,
  hits       INTEGER NOT NULL DEFAULT 0,
  shots      INTEGER NOT NULL DEFAULT 0,
  captures   INTEGER NOT NULL DEFAULT 0,
  revives    INTEGER NOT NULL DEFAULT 0,
  veh_damage REAL    NOT NULL DEFAULT 0,
  veh_kills  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, uid)
);

-- Захваты точек (базы Conflict).
CREATE TABLE IF NOT EXISTS captures (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id     TEXT,
  ts           INTEGER,
  point        TEXT,
  from_faction TEXT,
  to_faction   TEXT,
  control      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS captures_match ON captures(match_id);

-- Привязка Discord-аккаунта к игроку (#link в игре → /link код в Discord).
CREATE TABLE IF NOT EXISTS links (
  discord_id TEXT PRIMARY KEY,
  uid        TEXT NOT NULL,
  linked_at  INTEGER
);

CREATE TABLE IF NOT EXISTS link_codes (
  code       TEXT PRIMARY KEY,
  uid        TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS kills_killer ON kills(killer_uid);
CREATE INDEX IF NOT EXISTS kills_victim ON kills(victim_uid);
CREATE INDEX IF NOT EXISTS kills_match  ON kills(match_id);
CREATE INDEX IF NOT EXISTS players_name ON players(name COLLATE NOCASE);
`;

function open(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  // Миграция: ID события от мода, чтобы повторная отправка из буфера не задваивала статистику.
  const cols = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name);
  if (!cols.includes('event_id')) db.exec('ALTER TABLE events ADD COLUMN event_id TEXT');
  // Миграция: владельцы точек на конец матча (мод 0.3+).
  const mcols = db.prepare('PRAGMA table_info(matches)').all().map((c) => c.name);
  if (!mcols.includes('points_end')) db.exec("ALTER TABLE matches ADD COLUMN points_end TEXT NOT NULL DEFAULT ''");
  // Миграция: чем и куда убили (мод 0.1.1+).
  const kcols = db.prepare('PRAGMA table_info(kills)').all().map((c) => c.name);
  for (const col of ['weapon_source', 'damage_type', 'hit_zone', 'weapon_name']) {
    if (!kcols.includes(col)) db.exec(`ALTER TABLE kills ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS events_event_id ON events(event_id) WHERE event_id IS NOT NULL');
  // Исправление старых записей: убийство союзника (в т.ч. бота) — тимкилл.
  db.exec("UPDATE kills SET team_kill = 1 WHERE team_kill = 0 AND relation LIKE '%FRIENDLY%'");
  return db;
}

module.exports = { open };
