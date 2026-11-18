'use strict';

// Картинки для Discord: отчёт о матче и карточка игрока на шаблоне ZARUBA.

const path = require('node:path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { weaponName, worldName, duration } = require('./format');

const ASSETS = path.join(__dirname, '..', 'assets');
GlobalFonts.registerFromPath(path.join(ASSETS, 'fonts', 'RussoOne.ttf'), 'Russo One');
GlobalFonts.registerFromPath(path.join(ASSETS, 'fonts', 'Oswald.ttf'), 'Oswald');

const TZ = process.env.TZ_NAME || 'Europe/Moscow';

const C = {
  bg: '#16171a',
  orange: '#e87820',
  white: '#ece8e0',
  grey: '#96948e',
  line: '#3c3c40',
  dark: '#141414',
};

const FACTIONS = {
  USSR: { name: 'СССР', color: '#d04a38' },
  US: { name: 'США', color: '#5488c4' },
  FIA: { name: 'FIA', color: '#6fa05a' },
};

function faction(key) {
  return FACTIONS[key] || { name: key || '?', color: C.orange };
}

// Область справа от солдата, внутри уголков шаблона.
const X = 640;
const R = 1590;

const display = (px) => `${px}px "Russo One"`;
const text = (px, weight = 400) => `${weight} ${px}px Oswald`;

let templatePromise;
function template() {
  templatePromise ||= loadImage(path.join(ASSETS, 'template.png'));
  return templatePromise;
}

async function base() {
  const tpl = await template();
  const canvas = createCanvas(tpl.width, tpl.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(tpl, 0, 0);
  ctx.textBaseline = 'top';
  return { canvas, ctx };
}

// Рисует текст, обрезая его многоточием, если не влезает в ширину.
function put(ctx, str, x, y, { font, color = C.white, align = 'left', maxWidth } = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  let s = String(str);
  if (maxWidth && ctx.measureText(s).width > maxWidth) {
    while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
    s += '…';
  }
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}

// Заголовок: уменьшает шрифт до minPx, чтобы влез в ширину; дальше обрезает многоточием.
function title(ctx, str, x, y, { maxPx, minPx, maxWidth, color = C.white }) {
  let px = maxPx;
  ctx.font = display(px);
  while (px > minPx && ctx.measureText(str).width > maxWidth) {
    px -= 2;
    ctx.font = display(px);
  }
  // Выравниваем по нижнему краю строки максимального размера, чтобы мелкий шрифт не прилипал к подписи.
  put(ctx, str, x, y + (maxPx - px) * 0.8, { font: display(px), color, maxWidth });
}

function meters(n) {
  return n > 0 ? `${Math.round(n)} м` : '—';
}

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

function dateTime(unix) {
  if (!unix) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(unix * 1000));
}

function date(unix) {
  if (!unix) return '';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(unix * 1000));
}

// ---------------------------------------------------------------------------------------------
async function renderMatch(r) {
  const { canvas, ctx } = await base();
  const W = R - X;

  put(ctx, 'Итог матча', X, 70, { font: text(30), color: C.grey });
  title(ctx, worldName(r.world).replace(/_/g, ' ').toUpperCase(), X, 110, { maxPx: 72, minPx: 40, maxWidth: W });

  const meta = [
    duration(r.durationSec),
    `${r.playerCount} ${plural(r.playerCount, 'боец', 'бойца', 'бойцов')}`,
    `${r.teamKills} ${plural(r.teamKills, 'тимкилл', 'тимкилла', 'тимкиллов')}`,
  ].join('    ');
  put(ctx, meta, X, 190, { font: text(32), color: C.grey });

  // Плашка итога
  const verdict = r.winners.length ? `ПОБЕДА ${r.winners.map((w) => faction(w).name).join(', ')}` : 'БЕЗ ПОБЕДИТЕЛЯ';
  ctx.font = display(36);
  const vw = ctx.measureText(verdict).width + 32;
  ctx.fillStyle = r.winners.length ? C.orange : C.line;
  ctx.fillRect(X, 250, vw, 52);
  put(ctx, verdict, X + 16, 256, { font: display(36), color: r.winners.length ? C.dark : C.white });

  // Стороны: до трёх, по числу участия (убийства + потери)
  const sides = Object.entries(r.factions)
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.kills + b.deaths - (a.kills + a.deaths))
    .slice(0, 3);

  let y = 340;
  if (sides.length) {
    const colW = sides.length === 3 ? Math.floor(W / 3) : 470;
    sides.forEach((s, i) => {
      const f = faction(s.key);
      const sx = X + i * colW;
      put(ctx, f.name, sx, y, { font: display(34), color: f.color, maxWidth: colW - 30 });
      put(ctx, String(s.kills), sx, y + 36, { font: text(96, 600) });
      put(ctx, `убийств    потери ${s.deaths}`, sx, y + 160, { font: text(28), color: C.grey });
    });

    // Полоса: доли убийств сторон
    const by = y + 206;
    const total = sides.reduce((a, s) => a + s.kills, 0);
    if (total > 0) {
      let bx = X;
      sides.forEach((s, i) => {
        const w = i === sides.length - 1 ? X + W - bx : Math.round((W * s.kills) / total);
        ctx.fillStyle = faction(s.key).color;
        ctx.fillRect(bx, by, w, 10);
        bx += w;
      });
    } else {
      ctx.fillStyle = C.line;
      ctx.fillRect(X, by, W, 10);
    }
    y = by + 40;
  } else {
    put(ctx, 'Убийств в этом матче не было', X, y, { font: text(34), color: C.grey });
    y += 70;
  }

  // Топ бойцов
  const top = r.players.slice(0, 5);
  if (top.length) {
    const cols = [X, X + 60, R - 330, R - 200, R];
    put(ctx, '#', cols[0], y, { font: text(26), color: C.grey });
    put(ctx, 'Боец', cols[1], y, { font: text(26), color: C.grey });
    put(ctx, 'Убил', cols[2], y, { font: text(26), color: C.grey, align: 'right' });
    put(ctx, 'Погиб', cols[3], y, { font: text(26), color: C.grey, align: 'right' });
    put(ctx, 'Дальний', cols[4], y, { font: text(26), color: C.grey, align: 'right' });

    top.forEach((p, i) => {
      const yy = y + 42 + i * 46;
      const color = i === 0 ? C.orange : C.white;
      const font = text(34, 600);
      ctx.fillStyle = C.line;
      ctx.fillRect(X, yy - 6, W, 1);
      put(ctx, String(i + 1), cols[0], yy, { font, color });
      put(ctx, p.name, cols[1], yy, { font, color, maxWidth: cols[2] - cols[1] - 120 });
      put(ctx, String(p.kills), cols[2], yy, { font, color, align: 'right' });
      put(ctx, String(p.deaths), cols[3], yy, { font, color, align: 'right' });
      put(ctx, meters(p.longest), cols[4], yy, { font, color, align: 'right' });
    });
  }

  put(ctx, `${r.serverId}    ${dateTime(r.endedAt)}`, R, 884, { font: text(24), color: C.grey, align: 'right' });
  return canvas.encode('png');
}

// ---------------------------------------------------------------------------------------------
async function renderPlayer(s) {
  const { canvas, ctx } = await base();
  const W = R - X;

  put(ctx, 'Личное дело', X, 70, { font: text(30), color: C.grey });
  title(ctx, s.name.toUpperCase(), X, 110, { maxPx: 88, minPx: 44, maxWidth: W });

  const meta = [`${s.matches} ${plural(s.matches, 'бой', 'боя', 'боёв')}`];
  if (s.firstSeen) meta.push(`в строю с ${date(s.firstSeen)}`);
  put(ctx, meta.join('    '), X, 212, { font: text(32), color: C.grey });

  const kdW = put(ctx, s.kd.toFixed(2), X, 262, { font: text(170, 600), color: C.orange });
  put(ctx, 'K/D', X + kdW + 30, 390, { font: display(44), color: C.grey });

  const cells = [
    [String(s.kills), 'убито'],
    [String(s.deaths), 'погиб'],
    [meters(s.longest), 'дальний выстрел'],
    [String(s.pvpKills), 'игроков'],
    [String(s.aiKills), 'ботов'],
    [s.favWeapon ? weaponName(s.favWeapon) : '—', 'любимое оружие'],
  ];
  const cw = Math.floor(W / 3);
  cells.forEach(([v, label], i) => {
    const cx = X + (i % 3) * cw;
    const cy = 500 + Math.floor(i / 3) * 170;
    ctx.fillStyle = C.line;
    ctx.fillRect(cx, cy, cw - 40, 2);
    put(ctx, v, cx, cy + 14, { font: text(72, 600), maxWidth: cw - 40 });
    put(ctx, label, cx, cy + 108, { font: text(30), color: C.grey });
  });

  const extra = [];
  if (s.teamKills) extra.push(`тимкиллов ${s.teamKills}`);
  if (s.suicides) extra.push(`самоубийств ${s.suicides}`);
  if (extra.length) put(ctx, extra.join('    '), X, 884, { font: text(24), color: C.grey });

  return canvas.encode('png');
}

module.exports = { renderMatch, renderPlayer };
