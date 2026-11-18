'use strict';

// Приём событий от мода ZarubaStats, подсчёт статистики, Discord-бот.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { open } = require('./db');
const { createIngest } = require('./ingest');
const { createStats } = require('./stats');
const { startDiscord } = require('./discord');
const { chatLine } = require('./format');

const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.STATS_TOKEN || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const MAX_BODY = 1024 * 1024; // предел REST в Reforger — 1 МБ

if (!TOKEN) {
  console.error('Не задан STATS_TOKEN. Сервис не запущен.');
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const eventsFile = path.join(DATA_DIR, 'events.jsonl');

const db = open(path.join(DATA_DIR, 'stats.db'));
const ingest = createIngest(db);
const stats = createStats(db);

// Первый запуск с базой: переносим события, накопленные в журнале раньше.
if (db.prepare('SELECT COUNT(*) AS n FROM events').get().n === 0 && fs.existsSync(eventsFile)) {
  let n = 0;
  for (const line of fs.readFileSync(eventsFile, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      ingest(JSON.parse(line));
      n++;
    } catch (e) {
      console.warn('[import] пропущена строка:', e.message);
    }
  }
  console.log(`[import] из журнала перенесено событий: ${n}`);
}

const discord = startDiscord(stats, {
  token: process.env.DISCORD_TOKEN || '',
  guildId: process.env.DISCORD_GUILD_ID || '',
  channelId: process.env.DISCORD_CHANNEL_ID || '',
  minMatchSec: Number(process.env.MATCH_REPORT_MIN_SEC || 60),
  minPlayers: Number(process.env.MATCH_REPORT_MIN_PLAYERS || 1),
});

function tokenOk(given) {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('too large'), { code: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || '').split('?')[0];

  if (req.method === 'GET' && url === '/health') {
    return send(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url === '/api/events') {
    let event;
    try {
      event = JSON.parse(await readBody(req));
    } catch (e) {
      return send(res, e.code === 413 ? 413 : 400, { ok: false, error: 'bad body' });
    }

    if (!event || typeof event !== 'object' || !tokenOk(event.token)) {
      return send(res, 401, { ok: false, error: 'bad token' });
    }
    if (typeof event.type !== 'string' || !event.type) {
      return send(res, 400, { ok: false, error: 'no type' });
    }

    delete event.token; // секрет в журнал и базу не пишем
    event.receivedAt = new Date().toISOString();

    let result;
    try {
      result = ingest(event);
    } catch (e) {
      console.error(`[event] ошибка записи ${event.type}:`, e);
      return send(res, 500, { ok: false, error: 'store failed' });
    }

    // Повтор отвечаем 200, чтобы мод удалил событие из буфера.
    if (result.duplicate) {
      console.log(`[event] ${event.serverId || '?'} ${event.type} (повтор, пропущен)`);
      return send(res, 200, { ok: true, duplicate: true });
    }

    fs.appendFileSync(eventsFile, JSON.stringify(event) + '\n');
    console.log(`[event] ${event.serverId || '?'} ${event.type}`);
    send(res, 200, { ok: true });

    if (result.matchEnded) discord.reportMatch(result.matchEnded);
    return;
  }

  // Запрос из игры: #stats [ник]. Ответ — готовая строка для чата.
  if (req.method === 'POST' && url === '/api/query') {
    let q;
    try {
      q = JSON.parse(await readBody(req));
    } catch (e) {
      return send(res, e.code === 413 ? 413 : 400, { ok: false, error: 'bad body' });
    }
    if (!q || typeof q !== 'object' || !tokenOk(q.token)) {
      return send(res, 401, { ok: false, error: 'bad token' });
    }

    if (q.kind === 'player') {
      let uid = typeof q.uid === 'string' && q.uid ? q.uid : '';
      if (!uid || !stats.playerStats(uid)) {
        const found = stats.findPlayer(q.name);
        uid = found ? found.uid : '';
      }
      const s = uid ? stats.playerStats(uid) : null;
      const text = s ? chatLine(s) : `Игрок «${q.name || '?'}» не найден в статистике.`;
      return send(res, 200, { ok: true, text });
    }

    return send(res, 400, { ok: false, error: 'unknown kind' });
  }

  send(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`ARMASTATS слушает порт ${PORT}`);
});
