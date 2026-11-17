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

CREATE INDEX IF NOT EXISTS kills_killer ON kills(killer_uid);
CREATE INDEX IF NOT EXISTS kills_victim ON kills(victim_uid);
CREATE INDEX IF NOT EXISTS kills_match  ON kills(match_id);
CREATE INDEX IF NOT EXISTS players_name ON players(name COLLATE NOCASE);
`;

function open(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

module.exports = { open };
