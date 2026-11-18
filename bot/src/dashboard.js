'use strict';

// Картинка «Статистика боя» (1920×1080) в раскладке концепта: шапка, баннер счёта,
// общая статистика, лучшие игроки, стороны, вооружение, ход боя.

const { createCanvas } = require('@napi-rs/canvas');
const { weaponName } = require('./format');
const { loadBranding } = require('./branding');
require('./render'); // регистрирует шрифты

const W = 1920;
const H = 1080;
const C = {
  bg: '#121417',
  panel: 'rgba(24,27,32,0.90)',
  line: 'rgba(255,255,255,0.08)',
  white: '#eceae6',
  grey: '#9a9ca1',
  dim: '#62656b',
  orange: '#e87820',
  green: '#6fae5f',
  gold: '#d9a441',
  blue: '#4f86c6',
  track: 'rgba(255,255,255,0.08)',
};
const TZ = process.env.TZ_NAME || 'Europe/Moscow';

function hms(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

const num = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0));

function stamp(unix) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date((unix || Date.now() / 1000) * 1000));
}

// ---------------------------------------------------------------------------------------------
function makeDraw(x) {
  const font = (px, w = 400) => `${w} ${px}px Oswald`;
  const T = (s, px, X, Y, col = C.white, w = 400, al = 'left', maxWidth) => {
    x.font = font(px, w);
    x.fillStyle = col;
    x.textAlign = al;
    let str = String(s);
    if (maxWidth && x.measureText(str).width > maxWidth) {
      while (str.length > 1 && x.measureText(str + '…').width > maxWidth) str = str.slice(0, -1);
      str += '…';
    }
    x.fillText(str, X, Y);
    return x.measureText(str).width;
  };
  const D = (s, px, X, Y, col = C.white, al = 'left', maxWidth) => {
    let size = px;
    x.font = `${size}px "Russo One"`;
    while (maxWidth && size > px * 0.5 && x.measureText(s).width > maxWidth) {
      size -= 2;
      x.font = `${size}px "Russo One"`;
    }
    x.fillStyle = col;
    x.textAlign = al;
    x.fillText(s, X, Y);
  };
  const rr = (X, Y, w, h, r) => {
    x.beginPath();
    x.moveTo(X + r, Y);
    x.arcTo(X + w, Y, X + w, Y + h, r);
    x.arcTo(X + w, Y + h, X, Y + h, r);
    x.arcTo(X, Y + h, X, Y, r);
    x.arcTo(X, Y, X + w, Y, r);
    x.closePath();
  };
  return { T, D, rr, font };
}

// Иконки: простые собственные значки, без чужих символов.
function makeIcons(x) {
  const s = (w = 2.5) => {
    x.strokeStyle = C.grey;
    x.lineWidth = w;
    x.beginPath();
  };
  return {
    bars: (X, Y) => { x.fillStyle = C.grey; [[0, 8, 4, 10], [6, 2, 4, 16], [12, 5, 4, 13]].forEach(([a, b, w, h]) => x.fillRect(X - 9 + a, Y - 9 + b, w, h)); },
    cup: (X, Y) => { s(); x.moveTo(X - 8, Y - 9); x.lineTo(X + 8, Y - 9); x.lineTo(X + 6, Y + 1); x.quadraticCurveTo(X, Y + 5, X - 6, Y + 1); x.closePath(); x.stroke(); x.fillStyle = C.grey; x.fillRect(X - 1.5, Y + 4, 3, 5); x.fillRect(X - 6, Y + 9, 12, 2.5); },
    flag: (X, Y) => { s(); x.moveTo(X - 8, Y + 10); x.lineTo(X - 8, Y - 10); x.stroke(); x.fillStyle = C.grey; x.beginPath(); x.moveTo(X - 8, Y - 10); x.lineTo(X + 9, Y - 5); x.lineTo(X - 8, Y); x.fill(); },
    gun: (X, Y) => { x.fillStyle = C.grey; x.fillRect(X - 12, Y - 3, 24, 5); x.fillRect(X - 12, Y - 6, 6, 3); x.fillRect(X - 2, Y + 2, 5, 8); x.fillRect(X + 8, Y - 1, 8, 3); },
    chart: (X, Y) => { s(); x.moveTo(X - 10, Y + 8); x.lineTo(X - 3, Y); x.lineTo(X + 2, Y + 4); x.lineTo(X + 10, Y - 8); x.stroke(); },
    cross: (X, Y) => { s(2); x.arc(X, Y, 8, 0, 7); x.moveTo(X - 12, Y); x.lineTo(X - 4, Y); x.moveTo(X + 4, Y); x.lineTo(X + 12, Y); x.moveTo(X, Y - 12); x.lineTo(X, Y - 4); x.moveTo(X, Y + 4); x.lineTo(X, Y + 12); x.stroke(); },
    skull: (X, Y) => { x.fillStyle = C.grey; x.beginPath(); x.arc(X, Y - 2, 8, 0, 7); x.fill(); x.fillRect(X - 5, Y + 3, 10, 6); x.fillStyle = '#1b1e23'; x.beginPath(); x.arc(X - 3, Y - 2, 2.2, 0, 7); x.arc(X + 3, Y - 2, 2.2, 0, 7); x.fill(); },
    respawn: (X, Y) => { s(); x.arc(X, Y, 8, 0.6, 5.9); x.stroke(); x.fillStyle = C.grey; x.beginPath(); x.moveTo(X + 8, Y - 8); x.lineTo(X + 10, Y - 1); x.lineTo(X + 3, Y - 3); x.fill(); },
    warn: (X, Y) => { s(); x.moveTo(X, Y - 10); x.lineTo(X + 10, Y + 8); x.lineTo(X - 10, Y + 8); x.closePath(); x.stroke(); x.fillStyle = C.grey; x.fillRect(X - 1.3, Y - 3, 2.6, 6); x.fillRect(X - 1.3, Y + 5, 2.6, 2); },
    head: (X, Y) => { s(); x.arc(X, Y - 3, 6, 0, 7); x.moveTo(X - 9, Y + 10); x.quadraticCurveTo(X, Y, X + 9, Y + 10); x.stroke(); },
    ruler: (X, Y) => { s(); x.moveTo(X - 10, Y + 4); x.lineTo(X + 10, Y + 4); for (let i = -10; i <= 10; i += 5) { x.moveTo(X + i, Y + 4); x.lineTo(X + i, Y - (i % 10 ? 1 : 4)); } x.stroke(); },
    clock: (X, Y) => { s(); x.arc(X, Y + 1, 8, 0, 7); x.moveTo(X, Y + 1); x.lineTo(X, Y - 4); x.moveTo(X, Y + 1); x.lineTo(X + 4, Y + 3); x.stroke(); },
  };
}

function star(x, X, Y, r, col) {
  x.fillStyle = col;
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.42 : r;
    x.lineTo(X + Math.cos(a) * rad, Y + Math.sin(a) * rad);
  }
  x.closePath();
  x.fill();
}

function shield(x, X, Y, s, col) {
  x.fillStyle = col;
  x.beginPath();
  x.moveTo(X - s, Y - s * 1.1);
  x.lineTo(X + s, Y - s * 1.1);
  x.lineTo(X + s, Y + s * 0.2);
  x.quadraticCurveTo(X + s, Y + s * 1.1, X, Y + s * 1.4);
  x.quadraticCurveTo(X - s, Y + s * 1.1, X - s, Y + s * 0.2);
  x.closePath();
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.35)';
  x.lineWidth = 2;
  x.stroke();
  star(x, X, Y, s * 0.55, 'rgba(255,255,255,0.9)');
}

// Лавровая ветвь у края плашки: стебель-кривая и листья по обе стороны.
// edgeX — край плашки, cy — её центр, dir = -1 ветвь слева, 1 справа.
function laurel(x, edgeX, cy, dir, col) {
  const A = [edgeX + dir * 6, cy + 16];
  const Cc = [edgeX + dir * 34, cy + 12];
  const B = [edgeX + dir * 30, cy - 20];
  const at = (t) => [
    (1 - t) * (1 - t) * A[0] + 2 * (1 - t) * t * Cc[0] + t * t * B[0],
    (1 - t) * (1 - t) * A[1] + 2 * (1 - t) * t * Cc[1] + t * t * B[1],
  ];
  x.strokeStyle = col;
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(A[0], A[1]);
  x.quadraticCurveTo(Cc[0], Cc[1], B[0], B[1]);
  x.stroke();
  x.fillStyle = col;
  for (let i = 0; i < 6; i++) {
    const t = 0.15 + i * 0.16;
    const [px, py] = at(t);
    const [qx, qy] = at(Math.min(1, t + 0.01));
    const ang = Math.atan2(qy - py, qx - px);
    for (const side of [-1, 1]) {
      x.save();
      x.translate(px, py);
      x.rotate(ang + side * 0.7);
      x.beginPath();
      x.ellipse(6, 0, 7, 2.6, 0, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }
  }
}

function topo(x) {
  x.strokeStyle = 'rgba(200,200,205,0.045)';
  x.lineWidth = 1.3;
  [[300, 300, 0.4], [1500, 520, 2.1], [900, 1000, 4.2]].forEach(([cx, cy, ph]) => {
    for (let r = 30; r < 800; r += 30) {
      x.beginPath();
      for (let a = 0; a <= 6.3; a += 0.05) {
        const k = 1 + 0.16 * Math.sin(a * 3 + ph + r * 0.004) + 0.08 * Math.sin(a * 5 - ph);
        const px = cx + Math.cos(a) * r * k * 1.4;
        const py = cy + Math.sin(a) * r * k;
        a ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.stroke();
    }
  });
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ---------------------------------------------------------------------------------------------
async function renderDashboard(d) {
  const b = await loadBranding();
  const canvas = createCanvas(W, H);
  const x = canvas.getContext('2d');
  x.textBaseline = 'middle';
  const { T, D, rr } = makeDraw(x);
  const ic = makeIcons(x);

  const panel = (X, Y, w, h, title, icon) => {
    rr(X, Y, w, h, 14);
    x.fillStyle = C.panel;
    x.fill();
    x.strokeStyle = C.line;
    x.lineWidth = 1.5;
    x.stroke();
    if (title) {
      icon(X + 30, Y + 34);
      T(title, 30, X + 56, Y + 34, C.white, 500);
      x.fillStyle = C.line;
      x.fillRect(X + 20, Y + 62, w - 40, 1);
    }
  };

  // Фон
  x.fillStyle = C.bg;
  x.fillRect(0, 0, W, H);
  if (b.background) {
    const s = Math.max(W / b.background.width, H / b.background.height);
    x.drawImage(b.background, (W - b.background.width * s) / 2, (H - b.background.height * s) / 2, b.background.width * s, b.background.height * s);
    x.fillStyle = 'rgba(12,14,17,0.72)';
    x.fillRect(0, 0, W, H);
  } else {
    topo(x);
  }

  // Шапка
  if (b.logo) {
    x.save();
    rr(36, 22, 92, 92, 14);
    x.clip();
    const s = Math.max(92 / b.logo.width, 92 / b.logo.height);
    x.drawImage(b.logo, 36 + (92 - b.logo.width * s) / 2, 22 + (92 - b.logo.height * s) / 2, b.logo.width * s, b.logo.height * s);
    x.restore();
  }
  x.fillStyle = C.line;
  x.fillRect(156, 30, 2, 76);
  D(b.title, 54, 186, 52, C.white, 'left', 760);
  T(b.subtitle, 30, 188, 98, C.grey);

  const info = [b.world(d.world), `${d.playerCount} ${plural(d.playerCount, 'игрок', 'игрока', 'игроков')}`, `Длительность ${hms(d.durationSec)}`];
  x.font = '400 26px Oswald';
  const iw = info.reduce((a, s) => a + x.measureText(s).width, 0) + 120 + 60 + 30;
  const ix = W - 36 - iw;
  rr(ix, 36, iw, 58, 29);
  x.fillStyle = 'rgba(255,255,255,0.05)';
  x.fill();
  x.strokeStyle = C.line;
  x.stroke();
  // Метка на карте перед названием
  x.fillStyle = C.grey;
  x.beginPath();
  x.arc(ix + 36, 60, 9, Math.PI * 0.85, Math.PI * 2.15);
  x.lineTo(ix + 36, 77);
  x.closePath();
  x.fill();
  x.fillStyle = '#1b1e23';
  x.beginPath();
  x.arc(ix + 36, 60, 3.5, 0, 7);
  x.fill();
  let px = ix + 60;
  info.forEach((s, i) => {
    px += T(s, 26, px, 65);
    if (i < info.length - 1) {
      x.fillStyle = C.dim;
      x.fillRect(px + 29, 50, 2, 30);
      px += 60;
    }
  });

  // Две главные стороны: по участию в бою
  const sides = Object.entries(d.factions)
    .map(([key, v]) => ({ key, ...v, f: b.faction(key) }))
    .sort((p, q) => {
      // Сначала по порядку из настроек (НАТО слева, РФ справа), остальные — по участию в бою.
      const ip = b.order.indexOf(p.key);
      const iq = b.order.indexOf(q.key);
      if (ip !== -1 || iq !== -1) return (ip === -1 ? 99 : ip) - (iq === -1 ? 99 : iq);
      return q.kills + q.deaths - (p.kills + p.deaths);
    });
  const neutral = { name: '', subtitle: '', color: '#555a62' };
  const left = sides[0] || { key: '', kills: 0, deaths: 0, f: neutral };
  const right = sides[1] || null;

  // Баннер счёта
  const BX = 36, BY = 130, BW = W - 72, BH = 190;
  rr(BX, BY, BW, BH, 16);
  x.save();
  x.clip();
  const g = x.createLinearGradient(BX, 0, BX + BW, 0);
  g.addColorStop(0, shade(left.f.color, 0.55));
  g.addColorStop(0.42, shade(left.f.color, 0.22));
  g.addColorStop(0.58, shade(right ? right.f.color : '#333333', 0.22));
  g.addColorStop(1, shade(right ? right.f.color : '#333333', 0.55));
  x.fillStyle = g;
  x.fillRect(BX, BY, BW, BH);
  // Солдат из шаблона по краям, приглушённо
  if (b.soldier) {
    // Вырезаем из шаблона голову и плечи солдата, стирая оранжевый уголок рамки.
    const sw = 560, sh = 560, dh = BH, dw = (sw / sh) * dh;
    const crop = createCanvas(sw, sh);
    const cx = crop.getContext('2d');
    cx.drawImage(b.soldier, 0, 0, sw, sh, 0, 0, sw, sh);
    cx.globalCompositeOperation = 'destination-out';
    cx.fillRect(14, 10, 96, 22);
    cx.fillRect(14, 10, 22, 74);
    x.globalAlpha = 0.35;
    x.drawImage(crop, BX, BY, dw, dh);
    x.save();
    x.translate(BX + BW, BY);
    x.scale(-1, 1);
    x.drawImage(crop, 0, 0, dw, dh);
    x.restore();
    x.globalAlpha = 1;
  }
  x.fillStyle = 'rgba(0,0,0,0.28)';
  x.beginPath();
  x.moveTo(W / 2 - 160, BY);
  x.lineTo(W / 2 + 200, BY);
  x.lineTo(W / 2 + 160, BY + BH);
  x.lineTo(W / 2 - 200, BY + BH);
  x.fill();
  x.restore();
  x.strokeStyle = 'rgba(255,255,255,0.14)';
  x.lineWidth = 2;
  rr(BX, BY, BW, BH, 16);
  x.stroke();

  const emblem = async (side, cx) => {
    const img = side.key ? await b.emblem(side.key) : null;
    if (img) {
      const s = Math.min(120 / img.width, 120 / img.height);
      x.drawImage(img, cx - (img.width * s) / 2, BY + BH / 2 - (img.height * s) / 2, img.width * s, img.height * s);
    } else {
      shield(x, cx, BY + BH / 2 - 10, 46, side.f.color);
    }
  };
  if (left.key) {
    await emblem(left, 270);
    D(left.f.name, 72, 350, BY + 72, C.white, 'left', 420);
    T(left.f.subtitle, 28, 353, BY + 126, 'rgba(255,255,255,0.7)');
  }
  if (right) {
    await emblem(right, W - 270);
    D(right.f.name, 72, W - 350, BY + 72, C.white, 'right', 420);
    T(right.f.subtitle, 28, W - 353, BY + 126, 'rgba(255,255,255,0.7)', 400, 'right');
  }
  T('убийства', 22, W / 2, BY + 28, C.grey, 400, 'center');
  D(`${left.kills} : ${right ? right.kills : 0}`, 84, W / 2, BY + 86, C.white, 'center', 520);

  const win = d.winners.length ? `ПОБЕДА ${d.winners.map((k) => b.faction(k).name).join(', ')}` : 'БЕЗ ПОБЕДИТЕЛЯ';
  x.font = '26px "Russo One"';
  const vw = Math.max(260, x.measureText(win).width + 50);
  rr(W / 2 - vw / 2, BY + 138, vw, 36, 6);
  x.fillStyle = d.winners.length ? C.orange : 'rgba(255,255,255,0.12)';
  x.fill();
  D(win, 26, W / 2, BY + 157, d.winners.length ? '#151515' : C.white, 'center');
  laurel(x, W / 2 - vw / 2 - 4, BY + 156, -1, 'rgba(255,255,255,0.6)');
  laurel(x, W / 2 + vw / 2 + 4, BY + 156, 1, 'rgba(255,255,255,0.6)');

  // Ряд 2
  const R2 = 340, R2H = 340;
  const p1w = 420;
  panel(36, R2, p1w, R2H, 'Общая статистика', ic.bars);
  const t = d.totals;
  const hsShare = t.kills ? ` (${Math.round((100 * t.headshots) / t.kills)}%)` : '';
  [
    [ic.skull, 'Убийства', num(t.kills)],
    [ic.cross, 'Смерти', num(t.deaths)],
    [ic.respawn, 'Возрождения', num(t.spawns)],
    [ic.warn, 'Тимкиллы', num(d.teamKills)],
    [ic.head, 'Хедшоты', num(t.headshots) + hsShare],
    [ic.ruler, 'Дальний выстрел', t.longest ? `${Math.round(t.longest)} м` : '—'],
    [ic.clock, 'Время жизни (сред.)', t.avgLifeSec ? hms(t.avgLifeSec) : '—'],
  ].forEach(([f, l, v], i) => {
    const y = R2 + 92 + i * 34;
    f(66, y);
    T(l, 24, 92, y, C.grey);
    T(v, 25, 36 + p1w - 26, y, C.white, 500, 'right');
  });

  const p2x = 36 + p1w + 20, p2w = 720;
  panel(p2x, R2, p2w, R2H, 'Лучшие игроки', ic.cup);
  const best = [
    ['Лучший стрелок', d.best.shooter, ic.cross, (p) => [['Убийства', p.kills], ['Смерти', p.deaths], ['K/D', (p.kills / Math.max(1, p.deaths)).toFixed(2)]]],
    ['Снайпер', d.best.sniper, ic.ruler, (p) => [['Дальний', `${Math.round(p.longest || 0)} м`], ['Убийства', p.kills], ['Хедшоты', p.headshots]]],
    ['Самый меткий', d.best.marksman, ic.head, (p) => [['Хедшоты', p.headshots], ['Доля', `${Math.round((100 * p.headshots) / Math.max(1, p.kills))}%`], ['Убийства', p.kills]]],
  ];
  const cw = (p2w - 40 - 28) / 3;
  best.forEach(([role, p, icon, rows], i) => {
    const cx0 = p2x + 20 + i * (cw + 14), cy0 = R2 + 80;
    rr(cx0, cy0, cw, 240, 10);
    x.fillStyle = 'rgba(255,255,255,0.04)';
    x.fill();
    x.strokeStyle = C.line;
    x.stroke();
    x.fillStyle = ['#d9a441', '#b8bcc4', '#b07a4a'][i];
    x.beginPath();
    x.arc(cx0 + 28, cy0 + 28, 15, 0, 7);
    x.fill();
    D(String(i + 1), 18, cx0 + 28, cy0 + 29, '#151515', 'center');
    x.save();
    x.translate(cx0 + cw / 2, cy0 + 44);
    x.scale(1.9, 1.9);
    icon(0, 0);
    x.restore();
    T(role, 22, cx0 + cw / 2, cy0 + 90, C.grey, 400, 'center');
    D(p ? p.name : '—', 30, cx0 + cw / 2, cy0 + 124, C.white, 'center', cw - 24);
    x.fillStyle = C.line;
    x.fillRect(cx0 + 14, cy0 + 148, cw - 28, 1);
    if (p) {
      rows(p).forEach(([a, v], j) => {
        const y = cy0 + 170 + j * 26;
        T(a, 20, cx0 + 16, y, C.grey);
        T(String(v), 20, cx0 + cw - 16, y, C.white, 500, 'right');
      });
    } else {
      T('нет данных', 20, cx0 + cw / 2, cy0 + 196, C.dim, 400, 'center');
    }
  });

  const p3x = p2x + p2w + 20, p3w = W - 36 - p3x;
  panel(p3x, R2, p3w, R2H, 'Стороны', ic.flag);
  const cols = [p3x + 24, p3x + 250, p3x + 370, p3x + 490, p3x + p3w - 24];
  ['Сторона', 'Бойцов', 'Убийств', 'Потерь', 'K/D'].forEach((h, i) => T(h, 21, cols[i], R2 + 92, C.dim, 500, i ? 'right' : 'left'));
  sides.slice(0, 3).forEach((s, i) => {
    const y = R2 + 140 + i * 56;
    x.fillStyle = 'rgba(255,255,255,0.035)';
    x.fillRect(p3x + 14, y - 20, p3w - 28, 40);
    x.fillStyle = s.f.color;
    x.fillRect(p3x + 14, y - 20, 4, 40);
    T(s.f.name, 25, cols[0] + 6, y, C.white, 500, 'left', 200);
    T(s.players != null ? String(s.players) : '—', 25, cols[1], y, C.white, 400, 'right');
    T(String(s.kills), 25, cols[2], y, C.white, 400, 'right');
    T(String(s.deaths), 25, cols[3], y, C.white, 400, 'right');
    T(s.deaths ? (s.kills / s.deaths).toFixed(2) : '—', 25, cols[4], y, C.white, 500, 'right');
  });
  if (!sides.length) T('Боёв не было', 26, p3x + 24, R2 + 140, C.dim);
  const tk = sides.filter((s) => s.teamKills).map((s) => `${s.f.name} ${s.teamKills}`).join(', ');
  T(tk ? `Тимкиллы: ${tk}` : 'Тимкиллов не было', 22, p3x + 24, R2 + R2H - 36, C.grey);

  // Ряд 3
  const R3 = R2 + R2H + 20, R3H = H - R3 - 30;
  const q1w = 760;
  panel(36, R3, q1w, R3H, 'Вооружение', ic.gun);
  if (d.weapons.length) {
    const max = d.weapons[0].share || 1;
    d.weapons.forEach((w, i) => {
      const y = R3 + 100 + i * 48;
      T(weaponName(w.weapon), 25, 66, y, C.white, 500, 'left', 110);
      T(`${(w.share * 100).toFixed(1)}%`, 23, 250, y, C.grey, 400, 'right');
      x.fillStyle = C.track;
      x.fillRect(270, y - 6, 190, 12);
      x.fillStyle = C.green;
      x.fillRect(270, y - 6, (190 * w.share) / max, 12);
      T(String(w.kills), 24, 510, y, C.white, 500, 'right');
    });
  } else {
    T('Убийств не было', 26, 66, R3 + 140, C.dim);
  }
  x.fillStyle = C.line;
  x.fillRect(545, R3 + 80, 1, R3H - 110);
  const dx = 640, dy = R3 + 170, rad = 62;
  const total = d.sources.hands + d.sources.explosive + d.sources.vehicle;
  const parts = [['Стрелковое', d.sources.hands, C.green], ['Взрывчатка', d.sources.explosive, C.gold], ['Техника', d.sources.vehicle, C.blue]];
  x.lineWidth = 18;
  if (total) {
    let a0 = -Math.PI / 2;
    parts.forEach(([, n, col]) => {
      if (!n) return;
      const a1 = a0 + (n / total) * Math.PI * 2;
      x.strokeStyle = col;
      x.beginPath();
      x.arc(dx, dy, rad, a0, Math.max(a0, a1 - 0.03));
      x.stroke();
      a0 = a1;
    });
  } else {
    x.strokeStyle = C.track;
    x.beginPath();
    x.arc(dx, dy, rad, 0, Math.PI * 2);
    x.stroke();
  }
  D(num(t.kills), 24, dx, dy - 6, C.white, 'center', 100);
  T(plural(t.kills, 'убийство', 'убийства', 'убийств'), 17, dx, dy + 18, C.grey, 400, 'center');
  parts.forEach(([n, v, col], i) => {
    const ly = dy + 100 + i * 30;
    x.fillStyle = col;
    x.fillRect(575, ly - 7, 14, 14);
    T(n, 20, 597, ly, C.grey);
    T(total ? `${Math.round((100 * v) / total)}%` : '—', 20, 766, ly, C.white, 500, 'right');
  });

  const q2x = 36 + q1w + 20, q2w = W - 36 - q2x;
  panel(q2x, R3, q2w, R3H, 'Ход боя: убийства по минутам', ic.chart);
  const gx = q2x + 70, gy = R3 + 90, gw = q2w - 120, gh = R3H - 150;
  const lines = sides.slice(0, 3).filter((s) => d.timeline[s.key]);
  // Сглаживание скользящим средним по 3 минутам
  const smooth = (arr) => arr.map((_, i) => {
    const a = arr.slice(Math.max(0, i - 1), i + 2);
    return a.reduce((p, q) => p + q, 0) / a.length;
  });
  const data = lines.map((s) => ({ s, v: smooth(d.timeline[s.key]) }));
  const peak = Math.max(1, ...data.flatMap((l) => l.v));
  const top = Math.max(3, Math.ceil(peak / 3) * 3);
  x.strokeStyle = 'rgba(255,255,255,0.06)';
  x.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = gy + (gh * i) / 3;
    x.beginPath();
    x.moveTo(gx, y);
    x.lineTo(gx + gw, y);
    x.stroke();
    T(String(Math.round(top - (top * i) / 3)), 18, gx - 14, y, C.dim, 400, 'right');
  }
  const N = d.minutes;
  data.forEach(({ s, v }) => {
    x.beginPath();
    v.forEach((val, i) => {
      const X = N > 1 ? gx + (gw * i) / (N - 1) : gx + gw / 2;
      const Y = gy + gh - (gh * val) / top;
      i ? x.lineTo(X, Y) : x.moveTo(X, Y);
    });
    x.strokeStyle = s.f.color;
    x.lineWidth = 3;
    x.stroke();
    x.lineTo(N > 1 ? gx + gw : gx + gw / 2, gy + gh);
    x.lineTo(N > 1 ? gx : gx + gw / 2, gy + gh);
    x.closePath();
    x.globalAlpha = 0.16;
    x.fillStyle = s.f.color;
    x.fill();
    x.globalAlpha = 1;
  });
  if (!data.length) T('Убийств не было', 26, gx + gw / 2, gy + gh / 2, C.dim, 400, 'center');
  for (let i = 0; i <= 4; i++) T(hms((d.durationSec * i) / 4), 18, gx + (gw * i) / 4, gy + gh + 22, C.dim, 400, 'center');
  data.forEach(({ s }, i) => {
    const lx = gx + gw - 90 * data.length + i * 90;
    x.fillStyle = s.f.color;
    x.fillRect(lx, R3 + 34 - 7, 14, 14);
    T(s.f.name, 20, lx + 20, R3 + 34, C.grey, 400, 'left', 64);
  });

  T(`${b.footer}    ${d.serverId}    ${stamp(d.endedAt)}`, 18, W - 36, H - 14, C.dim, 400, 'right');
  return canvas.encode('png');
}

module.exports = { renderDashboard };
