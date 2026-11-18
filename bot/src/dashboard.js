'use strict';

// Картинка «Статистика боя» (1920×1080) в раскладке концепта: шапка, баннер счёта,
// общая статистика, лучшие игроки, стороны, вооружение, ход боя.

const path = require('node:path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { weaponName } = require('./format');
const { loadBranding } = require('./branding');
require('./render'); // регистрирует шрифты
GlobalFonts.registerFromPath(path.join(__dirname, '..', 'assets', 'fonts', 'Roboto.ttf'), 'Roboto');

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

function hms(sec, full = false) {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  if (full) return `${p(h)}:${p(m)}:${p(ss)}`;
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
  const font = (px, w = 400) => `${w} ${px}px Roboto`;
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
    x.font = `800 ${size}px Roboto`;
    while (maxWidth && size > px * 0.5 && x.measureText(s).width > maxWidth) {
      size -= 2;
      x.font = `800 ${size}px Roboto`;
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
  if (b.headerTemplate) {
    // Фон под панелями — та же шапка, сильно размытая и затемнённая.
    x.save();
    x.filter = 'blur(40px)';
    x.drawImage(b.headerTemplate, -80, -80, W + 160, H + 160);
    x.restore();
    x.fillStyle = 'rgba(10,12,15,0.62)';
    x.fillRect(0, 0, W, H);
  } else if (b.background) {
    const s = Math.max(W / b.background.width, H / b.background.height);
    x.drawImage(b.background, (W - b.background.width * s) / 2, (H - b.background.height * s) / 2, b.background.width * s, b.background.height * s);
    x.fillStyle = 'rgba(12,14,17,0.72)';
    x.fillRect(0, 0, W, H);
  } else {
    // Без фото: тёмное небо с дымкой, как в сумерках над полем боя
    const sky = x.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1d242b');
    sky.addColorStop(0.45, '#14191e');
    sky.addColorStop(1, '#0e1114');
    x.fillStyle = sky;
    x.fillRect(0, 0, W, H);
    for (const [cx, cy, r, a] of [[260, 120, 520, 0.10], [1650, 90, 480, 0.08], [980, 40, 700, 0.05]]) {
      const h = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      h.addColorStop(0, `rgba(170,180,190,${a})`);
      h.addColorStop(1, 'rgba(170,180,190,0)');
      x.fillStyle = h;
      x.fillRect(0, 0, W, H);
    }
    topo(x);
  }

  // Стороны нужны и в режиме шаблона (для панели «Стороны»)
  const sides = Object.entries(d.factions)
    .map(([key, v]) => ({ key, ...v, f: b.faction(key) }))
    .sort((p, q) => {
      const ip = b.order.indexOf(p.key);
      const iq = b.order.indexOf(q.key);
      if (ip !== -1 || iq !== -1) return (ip === -1 ? 99 : ip) - (iq === -1 ? 99 : iq);
      return q.kills + q.deaths - (p.kills + p.deaths);
    });

  if (b.headerTemplate) {
    // Шапка из шаблона 1683×259; координаты ниже — в пикселях шаблона.
    const ts = W / b.headerTemplate.width;
    const th = b.headerTemplate.height * ts;
    x.drawImage(b.headerTemplate, 0, 0, W, th);
    const fade = x.createLinearGradient(0, th - 30, 0, th + 10);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(10,12,15,0.0)');
    x.fillStyle = fade;
    x.fillRect(0, th - 30, W, 40);
    const P = (v) => v * ts;

    // Плашка: карта | игроки | длительность
    const info = [d.title || b.world(d.world), `${d.playerCount} ${plural(d.playerCount, 'игрок', 'игрока', 'игроков')}`, `Длительность ${hms(d.durationSec, true)}`];
    let fs = P(17.5);
    const room = P(1458 - 950);
    const gap = P(26);
    const width = () => {
      x.font = `400 ${fs}px Roboto`;
      return info.reduce((a, s2) => a + x.measureText(s2).width, 0) + gap * 2 * (info.length - 1);
    };
    while (fs > P(11) && width() > room) fs -= 0.5;
    let ipx = P(950);
    info.forEach((s2, i) => {
      ipx += T(s2, fs, ipx, P(47.5), '#e4e7ea', 400);
      if (i < info.length - 1) {
        x.fillStyle = 'rgba(230,233,236,0.55)';
        x.fillRect(ipx + gap - 1, P(38), 1.6, P(19));
        ipx += gap * 2;
      }
    });

    // Счёт
    const left = sides[0];
    const right = sides[1];
    const byPoints = d.score && left;
    const sc = (side) => (side ? (byPoints ? d.score[side.key] || 0 : side.kills) : 0);
    x.save();
    x.shadowColor = 'rgba(255,255,255,0.55)';
    x.shadowBlur = 20;
    D(`${sc(left)} : ${sc(right)}`, P(byPoints ? 86 : 64), P(845), P(157), '#eef1f4', 'center', P(300));
    x.restore();

    // Итог
    const win = d.winners.length ? `ПОБЕДА ${d.winners.map((k) => b.faction(k).name).join(', ')}` : 'БЕЗ ПОБЕДИТЕЛЯ';
    let vf = P(25);
    x.font = `700 ${vf}px Roboto`;
    while (vf > P(14) && x.measureText(win).width > P(205)) {
      vf -= 0.5;
      x.font = `700 ${vf}px Roboto`;
    }
    T(win, vf, P(845), P(217), '#eef0f2', 700, 'center');
  } else {
  // Шапка: лого | заголовок | плашка с картой, игроками, длительностью
  if (b.logo) {
    const lw = 200, lh = 92;
    const sc = Math.min(lw / b.logo.width, lh / b.logo.height);
    x.drawImage(b.logo, 40 + (lw - b.logo.width * sc) / 2, 20 + (lh - b.logo.height * sc) / 2, b.logo.width * sc, b.logo.height * sc);
  }
  x.fillStyle = 'rgba(255,255,255,0.25)';
  x.fillRect(282, 30, 2, 76);
  x.save();
  x.shadowColor = 'rgba(255,255,255,0.35)';
  x.shadowBlur = 18;
  D(b.title, 56, 330, 50, '#e9ecef', 'left', 640);
  x.restore();
  T(b.subtitle, 30, 332, 96, '#aeb4bb', 400);

  const info = [d.title || b.world(d.world), `${d.playerCount} ${plural(d.playerCount, 'игрок', 'игрока', 'игроков')}`, `Длительность ${hms(d.durationSec, true)}`];
  x.font = '400 24px Roboto';
  const iw = info.reduce((a, s) => a + x.measureText(s).width, 0) + 2 * 44 + 96;
  const ix = W - 40 - iw;
  rr(ix, 34, iw, 56, 16);
  x.fillStyle = 'rgba(20,24,29,0.72)';
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.22)';
  x.lineWidth = 1.5;
  x.stroke();
  // Метка на карте
  x.fillStyle = '#c9ced4';
  x.beginPath();
  x.arc(ix + 34, 56, 9, Math.PI * 0.85, Math.PI * 2.15);
  x.lineTo(ix + 34, 73);
  x.closePath();
  x.fill();
  x.fillStyle = '#1b1f24';
  x.beginPath();
  x.arc(ix + 34, 56, 3.5, 0, 7);
  x.fill();
  let px = ix + 64;
  info.forEach((s, i) => {
    px += T(s, 24, px, 62, '#e3e6ea', 400);
    if (i < info.length - 1) {
      x.fillStyle = 'rgba(255,255,255,0.35)';
      x.fillRect(px + 21, 50, 1.5, 26);
      px += 44;
    }
  });

  const neutral = { name: '', subtitle: '', color: '#555a62' };
  const left = sides[0] || { key: '', kills: 0, deaths: 0, f: neutral };
  const right = sides[1] || null;
  const rightColor = right ? right.f.color : '#555a62';

  // Баннер счёта
  const BX = 236, BY = 116, BW = W - 472, BH = 196;
  const seamL = BX + BW * 0.34, seamR = BX + BW * 0.66, skew = 42;
  x.save();
  rr(BX, BY, BW, BH, 18);
  x.clip();
  // Левая сторона
  let g = x.createLinearGradient(BX, 0, seamL, 0);
  g.addColorStop(0, shade(left.f.color, 0.42));
  g.addColorStop(1, shade(left.f.color, 0.22));
  x.fillStyle = g;
  x.fillRect(BX, BY, BW, BH);
  // Центр — тёмный, с наклонными краями
  x.fillStyle = '#10141a';
  x.beginPath();
  x.moveTo(seamL + skew, BY);
  x.lineTo(seamR + skew, BY);
  x.lineTo(seamR - skew, BY + BH);
  x.lineTo(seamL - skew, BY + BH);
  x.closePath();
  x.fill();
  // Правая сторона
  g = x.createLinearGradient(seamR, 0, BX + BW, 0);
  g.addColorStop(0, shade(rightColor, 0.22));
  g.addColorStop(1, shade(rightColor, 0.42));
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(seamR + skew, BY);
  x.lineTo(BX + BW, BY);
  x.lineTo(BX + BW, BY + BH);
  x.lineTo(seamR - skew, BY + BH);
  x.closePath();
  x.fill();
  // Мягкий свет снизу, как волна флага
  const wave = (col, x0, x1) => {
    const wg = x.createLinearGradient(0, BY + BH * 0.55, 0, BY + BH);
    wg.addColorStop(0, 'rgba(0,0,0,0)');
    wg.addColorStop(1, col);
    x.fillStyle = wg;
    x.beginPath();
    x.moveTo(x0, BY + BH);
    x.bezierCurveTo(x0 + (x1 - x0) * 0.3, BY + BH * 0.55, x0 + (x1 - x0) * 0.6, BY + BH * 0.95, x1, BY + BH * 0.6);
    x.lineTo(x1, BY + BH);
    x.closePath();
    x.fill();
  };
  wave(shade(left.f.color, 0.75).replace('rgb', 'rgba').replace(')', ',0.35)'), BX, seamL);
  wave(shade(rightColor, 0.75).replace('rgb', 'rgba').replace(')', ',0.35)'), seamR, BX + BW);

  // Солдаты по краям: силуэт в цвет стороны, растворяется к центру
  if (b.soldier) {
    const sw = 560, sh = 560, dh = BH + 20, dw = (sw / sh) * dh;
    const crop = createCanvas(Math.ceil(dw), Math.ceil(dh));
    const cx = crop.getContext('2d');
    cx.drawImage(b.soldier, 0, 0, sw, sh, 0, 0, dw, dh);
    cx.globalCompositeOperation = 'destination-out';
    cx.fillRect(0, 0, (110 / sw) * dw, (32 / sh) * dh);
    cx.fillRect(0, 0, (36 / sw) * dw, (84 / sh) * dh);
    // затухание вправо
    const fade = cx.createLinearGradient(dw * 0.45, 0, dw, 0);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    cx.fillStyle = fade;
    cx.fillRect(0, 0, dw, dh);
    const tint = (col) => {
      const t = createCanvas(crop.width, crop.height);
      const tx = t.getContext('2d');
      tx.drawImage(crop, 0, 0);
      tx.globalCompositeOperation = 'source-atop';
      tx.fillStyle = col;
      tx.globalAlpha = 0.55;
      tx.fillRect(0, 0, t.width, t.height);
      return t;
    };
    x.globalAlpha = 0.8;
    x.drawImage(tint(shade(left.f.color, 0.35)), BX, BY - 10);
    x.save();
    x.translate(BX + BW, BY - 10);
    x.scale(-1, 1);
    x.drawImage(tint(shade(rightColor, 0.35)), 0, 0);
    x.restore();
    x.globalAlpha = 1;
  }
  x.restore();

  // Светлые швы между сторонами
  const seam = (X, col) => {
    x.save();
    x.shadowColor = col;
    x.shadowBlur = 10;
    x.strokeStyle = col;
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(X + skew, BY + 2);
    x.lineTo(X - skew, BY + BH - 2);
    x.stroke();
    x.restore();
  };
  seam(seamL, 'rgba(150,190,240,0.75)');
  seam(seamR, 'rgba(240,150,150,0.75)');
  // Рамка со свечением
  x.save();
  x.shadowColor = 'rgba(255,255,255,0.25)';
  x.shadowBlur = 12;
  x.strokeStyle = 'rgba(255,255,255,0.45)';
  x.lineWidth = 1.5;
  rr(BX, BY, BW, BH, 18);
  x.stroke();
  x.restore();

  const emblem = async (side, cx) => {
    const img = side.key ? await b.emblem(side.key) : null;
    if (img) {
      const s = Math.min(110 / img.width, 110 / img.height);
      x.drawImage(img, cx - (img.width * s) / 2, BY + BH / 2 - (img.height * s) / 2, img.width * s, img.height * s);
    } else {
      shield(x, cx, BY + BH / 2 - 10, 42, side.f.color);
    }
  };
  const nameShadow = () => {
    x.shadowColor = 'rgba(0,0,0,0.6)';
    x.shadowBlur = 8;
  };
  if (left.key) {
    await emblem(left, BX + 150);
    x.save();
    nameShadow();
    D(left.f.name, 64, BX + 236, BY + 80, '#f2f4f6', 'left', 300);
    x.restore();
    T(left.f.subtitle, 23, BX + 238, BY + 128, 'rgba(235,240,245,0.85)', 400, 'left', 330);
  }
  if (right) {
    await emblem(right, BX + BW - 150);
    x.save();
    nameShadow();
    D(right.f.name, 64, BX + BW - 236, BY + 80, '#f2f4f6', 'right', 300);
    x.restore();
    T(right.f.subtitle, 23, BX + BW - 238, BY + 128, 'rgba(245,235,235,0.85)', 400, 'right', 330);
  }

  const byPoints = d.score && left.key;
  const sc = (side) => (side ? (byPoints ? d.score[side.key] || 0 : side.kills) : 0);
  const scoreText = `${sc(left)} : ${sc(right)}`;
  x.save();
  x.shadowColor = 'rgba(255,255,255,0.45)';
  x.shadowBlur = 22;
  D(scoreText, byPoints ? 110 : 84, W / 2, BY + 78, '#f4f5f7', 'center', 440);
  x.restore();
  if (!byPoints) T('убийства', 20, W / 2, BY + 18, 'rgba(255,255,255,0.55)', 400, 'center');

  const win = d.winners.length ? `ПОБЕДА ${d.winners.map((k) => b.faction(k).name).join(', ')}` : 'БЕЗ ПОБЕДИТЕЛЯ';
  x.font = '700 30px Roboto';
  const vw = Math.max(240, x.measureText(win).width + 56);
  const vy = BY + 138;
  rr(W / 2 - vw / 2, vy, vw, 46, 10);
  x.fillStyle = 'rgba(10,13,17,0.75)';
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.22)';
  x.lineWidth = 1.2;
  x.stroke();
  T(win, 30, W / 2, vy + 24, '#eef0f2', 700, 'center');
  laurel(x, W / 2 - vw / 2 - 6, vy + 22, -1, 'rgba(235,238,242,0.85)');
  laurel(x, W / 2 + vw / 2 + 6, vy + 22, 1, 'rgba(235,238,242,0.85)');

  }

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
      // Игровые названия (особенно модовые) длинные — под имя отдана широкая колонка.
      T(weaponName(w.weapon, w.weaponName), 23, 66, y, C.white, 500, 'left', 236);
      x.fillStyle = C.track;
      x.fillRect(314, y - 6, 140, 12);
      x.fillStyle = C.green;
      x.fillRect(314, y - 6, (140 * w.share) / max, 12);
      T(String(w.kills), 24, 512, y, C.white, 500, 'right');
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
  panel(q2x, R3, q2w, R3H, 'Ход боя: убийства и захваты', ic.chart);
  const gx = q2x + 70, gy = R3 + 122, gw = q2w - 120, gh = R3H - 182;
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
  // Захваты точек: флажок цвета взявшей стороны над моментом захвата
  for (const c of d.captures) {
    const tSec = c.ts - d.startedAt;
    if (tSec < 0 || tSec > d.durationSec) continue;
    const X = gx + (gw * tSec) / Math.max(1, d.durationSec);
    const col = b.faction(c.to).color;
    x.strokeStyle = 'rgba(255,255,255,0.18)';
    x.lineWidth = 1;
    x.setLineDash([4, 4]);
    x.beginPath();
    x.moveTo(X, gy);
    x.lineTo(X, gy + gh);
    x.stroke();
    x.setLineDash([]);
    x.strokeStyle = col;
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(X, gy + 2);
    x.lineTo(X, gy - 22);
    x.stroke();
    x.fillStyle = col;
    x.beginPath();
    x.moveTo(X, gy - 22);
    x.lineTo(X + 14, gy - 17);
    x.lineTo(X, gy - 12);
    x.fill();
    T(c.point, 16, X + 4, gy - 32, C.grey, 400, 'center', 90);
  }
  if (!data.length) T('Убийств не было', 26, gx + gw / 2, gy + gh / 2, C.dim, 400, 'center');
  for (let i = 0; i <= 4; i++) T(hms((d.durationSec * i) / 4), 18, gx + (gw * i) / 4, gy + gh + 22, C.dim, 400, 'center');
  data.forEach(({ s }, i) => {
    const lx = gx + gw - 90 * data.length + i * 90;
    x.fillStyle = s.f.color;
    x.fillRect(lx, R3 + 34 - 7, 14, 14);
    T(s.f.name, 20, lx + 20, R3 + 34, C.grey, 400, 'left', 64);
  });

  T(`${b.footer}    ${d.serverId}    ${stamp(d.endedAt)}`, 18, W - 36, H - 14, C.dim, 400, 'right');
  return withRoster(canvas, d, b);
}

// ---------------------------------------------------------------------------------------------
// Список игроков под основной картинкой: по стороне на колонку (НАТО слева, РФ справа),
// внутри — по отрядам (сильнейший отряд выше), в отряде — по убийствам.
// До 128 игроков: если строк на стороне больше MAX_ROWS, колонка делится надвое.
const ROW = 30;
const ROSTER_TOP = 24;
const MAX_ROWS = 34;

function byKills(p, q) {
  return q.kills - p.kills || p.deaths - q.deaths || p.name.localeCompare(q.name);
}

// Строки стороны: заголовки отрядов и игроки. Без данных об отрядах — просто список.
function sideRows(list) {
  if (!list.some((p) => p.squad)) return list.sort(byKills).map((p, i) => ({ p, n: i + 1 }));
  const squads = new Map();
  for (const p of list) {
    const k = p.squad || '';
    if (!squads.has(k)) squads.set(k, []);
    squads.get(k).push(p);
  }
  const order = [...squads.entries()].sort(([a, pa], [b, pb]) => {
    if (!a !== !b) return a ? -1 : 1; // «Без отряда» — в конце
    const ka = pa.reduce((s, p) => s + p.kills, 0);
    const kb = pb.reduce((s, p) => s + p.kills, 0);
    return kb - ka || a.localeCompare(b);
  });
  const rows = [];
  for (const [name, members] of order) {
    members.sort(byKills);
    rows.push({ squad: name || 'Без отряда', count: members.length, kills: members.reduce((s, p) => s + p.kills, 0) });
    members.forEach((p, i) => rows.push({ p, n: i + 1 }));
  }
  return rows;
}

// Делим строки на две колонки. С отрядами режем только по границе отряда,
// ближайшей к середине, чтобы отряд не разрывался между колонками.
function splitRows(rows) {
  if (rows.length <= MAX_ROWS) return [rows];
  const half = Math.ceil(rows.length / 2);
  const starts = rows.map((r, i) => (r.squad ? i : -1)).filter((i) => i > 0);
  if (!starts.length) return [rows.slice(0, half), rows.slice(half)];
  const cut = starts.reduce((best, i) => (Math.abs(i - half) < Math.abs(best - half) ? i : best));
  return [rows.slice(0, cut), rows.slice(cut)];
}

function rosterGroups(d, b) {
  const by = new Map();
  for (const p of d.players || []) {
    const key = p.faction || '';
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(p);
  }
  const keys = [...by.keys()].sort((p, q) => {
    const ip = p ? b.order.indexOf(p) : 98;
    const iq = q ? b.order.indexOf(q) : 98;
    return (ip === -1 ? 97 : ip) - (iq === -1 ? 97 : iq);
  });
  return keys.map((key) => {
    const list = by.get(key);
    return {
      title: key ? b.faction(key).name : 'Без стороны',
      color: key ? b.faction(key).color : C.dim,
      count: list.length,
      cols: splitRows(sideRows(list)),
    };
  });
}

async function withRoster(base, d, b) {
  const groups = rosterGroups(d, b);
  if (!groups.length) return base.encode('png');

  const GW = (W - 36 * 2 - 24) / 2;
  const panelH = (g) => 70 + 40 + Math.max(...g.cols.map((c) => c.length)) * ROW + 20;
  const rows = [];
  for (let i = 0; i < groups.length; i += 2) rows.push(groups.slice(i, i + 2));
  const rowsH = rows.map((r) => Math.max(...r.map(panelH)));
  const extra = ROSTER_TOP + rowsH.reduce((a, h) => a + h + 24, 0) + 20;

  const canvas = createCanvas(W, H + extra);
  const x = canvas.getContext('2d');
  x.textBaseline = 'middle';
  const { T, rr } = makeDraw(x);

  // Фон списка — продолжение фона картинки (низ, растянутый и затемнённый).
  x.fillStyle = C.bg;
  x.fillRect(0, 0, W, H + extra);
  x.drawImage(base, 0, H - 4, W, 4, 0, H, W, extra);
  x.fillStyle = 'rgba(10,12,15,0.55)';
  x.fillRect(0, H, W, extra);
  x.drawImage(base, 0, 0);

  const kd = (p) => (p.deaths > 0 ? p.kills / p.deaths : p.kills).toFixed(2);
  let Y = H + ROSTER_TOP;
  rows.forEach((row, ri) => {
    row.forEach((g, gi) => {
      const X = 36 + gi * (GW + 24);
      rr(X, Y, GW, rowsH[ri], 14);
      x.fillStyle = C.panel;
      x.fill();
      x.strokeStyle = C.line;
      x.lineWidth = 1.5;
      x.stroke();
      x.fillStyle = g.color;
      x.fillRect(X + 20, Y + 22, 6, 26);
      T(g.title, 30, X + 38, Y + 35, C.white, 600);
      T(`${g.count} ${plural(g.count, 'боец', 'бойца', 'бойцов')}`, 20, X + GW - 24, Y + 35, C.grey, 400, 'right');
      x.fillStyle = C.line;
      x.fillRect(X + 20, Y + 64, GW - 40, 1);

      const n = g.cols.length;
      const cw = (GW - 40 - (n - 1) * 24) / n;
      // Колонки: # | ник | уб | см | K/D | патроны — правые края от ширины колонки.
      const cols = n === 1
        ? { name: 44, kills: cw - 330, deaths: cw - 240, kd: cw - 140, shots: cw - 4 }
        : { name: 34, kills: cw - 192, deaths: cw - 144, kd: cw - 80, shots: cw - 2 };
      const fs = n === 1 ? 19 : 17;
      const fsz = n === 1 ? 20 : 18;
      g.cols.forEach((list, c) => {
        const cx = X + 20 + c * (cw + 24);
        const hy = Y + 92;
        T('#', fs, cx + 4, hy, C.dim);
        T('Игрок', fs, cx + cols.name, hy, C.dim);
        T('Уб.', fs, cx + cols.kills, hy, C.dim, 400, 'right');
        T('См.', fs, cx + cols.deaths, hy, C.dim, 400, 'right');
        T('K/D', fs, cx + cols.kd, hy, C.dim, 400, 'right');
        T('Патроны', fs, cx + cols.shots, hy, C.dim, 400, 'right');
        list.forEach((r, i) => {
          const ry = hy + 32 + i * ROW;
          if (r.squad) {
            // Заголовок отряда: полоса цвета стороны, название, бойцов и убийств отряда.
            x.fillStyle = 'rgba(255,255,255,0.07)';
            x.fillRect(cx, ry - ROW / 2 + 2, cw, ROW - 4);
            x.fillStyle = g.color;
            x.fillRect(cx, ry - ROW / 2 + 2, 3, ROW - 4);
            T(r.squad, fsz, cx + 12, ry, C.white, 600, 'left', cw - 200);
            T(`${r.count} ${plural(r.count, 'боец', 'бойца', 'бойцов')} · ${r.kills} уб.`, fs, cx + cw - 4, ry, C.grey, 400, 'right');
            return;
          }
          const p = r.p;
          if (r.n % 2 === 1) {
            x.fillStyle = 'rgba(255,255,255,0.03)';
            x.fillRect(cx, ry - ROW / 2, cw, ROW);
          }
          T(String(r.n), fsz, cx + 4, ry, C.dim);
          T(p.name, fsz, cx + cols.name, ry, C.white, 500, 'left', cols.kills - cols.name - 40);
          T(String(p.kills), fsz, cx + cols.kills, ry, C.white, 500, 'right');
          T(String(p.deaths), fsz, cx + cols.deaths, ry, C.grey, 400, 'right');
          T(kd(p), fsz, cx + cols.kd, ry, C.white, 500, 'right');
          T(p.shots != null ? num(p.shots) : '—', fsz, cx + cols.shots, ry, C.grey, 400, 'right');
        });
      });
    });
    Y += rowsH[ri] + 24;
  });

  return canvas.encode('png');
}

module.exports = { renderDashboard };
