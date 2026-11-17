'use strict';

// Этап 1: приём событий от мода и запись в журнал. Без внешних зависимостей.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

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

function tokenOk(given) {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
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

    delete event.token; // секрет в журнал не пишем
    event.receivedAt = new Date().toISOString();
    fs.appendFileSync(eventsFile, JSON.stringify(event) + '\n');
    console.log(`[event] ${event.serverId || '?'} ${event.type}`);
    return send(res, 200, { ok: true });
  }

  send(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`ARMASTATS слушает порт ${PORT}`);
});
