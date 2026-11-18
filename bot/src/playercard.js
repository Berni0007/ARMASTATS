'use strict';

// Личная статистика игрока за всё время (1920×1080) поверх шаблона-концепта player.png (без баннера матча).
// Все координаты — в пикселях шаблона 1672×941; холст масштабируется целиком.

const path = require('node:path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { loadBranding } = require('./branding');
const { weaponName, lifeTime } = require('./format');
require('./render'); // регистрирует Oswald и Russo One
GlobalFonts.registerFromPath(path.join(__dirname, '..', 'assets', 'fonts', 'Roboto.ttf'), 'Roboto');

const W = 1920;
const H = 1080;
const TW = 1672;
const TH = 941;
const TZ = process.env.TZ_NAME || 'Europe/Moscow';

const C = { white: '#eef0f2', grey: '#b9bfc6', dim: '#7d858e', gold: '#f0d9a0' };

const num = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0)).replace(/ /g, ' ');
const _date = (unix) =>
  unix ? new Date(unix * 1000).toLocaleDateString('ru-RU', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

// «327 ч 16 мин»; short — «100 ч» (или «45 мин», если меньше часа).
function hours(sec, short = false) {
  const m = Math.floor((sec || 0) / 60);
  const h = Math.floor(m / 60);
  if (short) return h > 0 ? `${h} ч` : `${m} мин`;
  return h > 0 ? `${h} ч ${m % 60} мин` : `${m} мин`;
}

// Значок часов для строки «Время за стороны».
function clock(x, cx, cy, r, col) {
  x.save();
  x.strokeStyle = col;
  x.lineWidth = 2.4;
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.stroke();
  x.beginPath();
  x.moveTo(cx, cy - r * 0.6);
  x.lineTo(cx, cy);
  x.lineTo(cx + r * 0.45, cy + r * 0.3);
  x.stroke();
  x.restore();
}

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

async function renderPlayerCard(s) {
  const b = await loadBranding();
  if (!b.playerTemplate) return null;

  const canvas = createCanvas(W, H);
  const x = canvas.getContext('2d');
  x.drawImage(b.playerTemplate, 0, 0, W, H);
  x.scale(W / TW, H / TH);
  x.textBaseline = 'middle';

  // Текст с подгонкой под ширину: уменьшает кегль, пока не влезет.
  const T = (str, size, X, Y, o = {}) => {
    const { color = C.white, weight = 400, align = 'left', max = 0, family = 'Roboto', glow = 0 } = o;
    let fs = size;
    const set = () => (x.font = `${weight} ${fs}px ${family}`);
    set();
    while (max && fs > 8 && x.measureText(str).width > max) {
      fs -= 0.5;
      set();
    }
    x.save();
    if (glow) {
      x.shadowColor = 'rgba(255,255,255,0.45)';
      x.shadowBlur = glow;
    }
    x.fillStyle = color;
    x.textAlign = align;
    x.fillText(str, X, Y);
    x.restore();
    return x.measureText(str).width;
  };
  const dash = (v, ok) => (ok ? v : '—');

  // Шапка: уровень и общее время в игре
  T(String(s.level), 22, 942, 60, { weight: 700 });
  T(hours(s.playSec), 22, 1192, 60, { weight: 700, max: 175 });

  // Левая карточка
  T(s.name, 40, 80, 515, { weight: 700, max: 390 });

  // Основная сторона — где наиграно больше всего времени (если времени нет — по числу боёв).
  const play = Object.entries(s.playByFaction || {}).sort((p, q) => q[1] - p[1]);
  const fk = play.length ? play[0][0] : s.mainFaction;
  const emblem = fk ? await b.emblem(fk) : null;
  if (emblem) {
    const h = 50;
    const w = Math.min(56, (emblem.width / emblem.height) * h);
    x.drawImage(emblem, 111 - w / 2, 548, w, h);
  } else if (fk) {
    x.fillStyle = b.faction(fk).color;
    x.fillRect(108, 552, 6, 42);
  }
  T(fk ? b.faction(fk).name : '—', 21, 166, 586, { weight: 700, max: 260 });

  // Время по сторонам: «НАТО 100 ч · РФ 20 ч»
  clock(x, 115, 633, 15, '#c9ced4');
  T('Время за стороны:', 18, 166, 620, { color: '#c9ced4' });
  const sides = b.order.filter((k) => s.playByFaction && s.playByFaction[k] > 0);
  for (const k of Object.keys(s.playByFaction || {})) if (!sides.includes(k)) sides.push(k);
  const perSide = sides.map((k) => `${b.faction(k).name} ${hours(s.playByFaction[k], true)}`).join('  ·  ');
  T(perSide || '—', 20, 166, 645, { weight: 700, max: 280 });

  // Полоса звания: тёмная подложка с золотыми линиями, как на концепте.
  x.fillStyle = 'rgba(26,24,20,0.92)';
  x.fillRect(178, 686, 238, 38);
  const gl = x.createLinearGradient(178, 0, 420, 0);
  gl.addColorStop(0, 'rgba(214,176,98,0.95)');
  gl.addColorStop(1, 'rgba(214,176,98,0.35)');
  x.fillStyle = gl;
  x.fillRect(178, 684, 240, 1.6);
  x.fillRect(178, 724, 240, 1.6);
  T(s.rankName.toUpperCase(), 22, 297, 704, { color: C.gold, weight: 700, align: 'center', max: 222 });

  // Центр
  T(num(s.score), 74, 808, 326, { weight: 700, align: 'center', glow: 18, max: 340 });
  T(num(s.kills), 46, 612, 501, { weight: 700, align: 'center', max: 150 });
  T(num(s.deaths), 46, 808, 501, { weight: 700, align: 'center', max: 150 });
  T(dash(num(s.assists), s.tracked), 46, 1010, 501, { weight: 700, align: 'center', max: 150 });
  T('ВРЕМЯ ЖИЗНИ (СРЕД.):', 19, 937, 606, { color: '#c3c9d0', family: 'Oswald', align: 'center' });
  T(s.kd.toFixed(2), 46, 640, 662, { weight: 700, align: 'center', max: 200 });
  T(s.avgLifeSec ? lifeTime(s.avgLifeSec) : '—', 46, 937, 662, { weight: 700, align: 'center', max: 270 });

  // Правая колонка
  const acc = s.shots > 0 ? `${Math.round((100 * s.hits) / s.shots)}%` : '—';
  [
    dash(num(s.hits), s.tracked),
    s.tracked ? acc : '—',
    dash(num(s.captures), s.tracked),
    dash(num(s.revives), s.tracked),
    dash(num(s.vehDamage), s.tracked),
    dash(num(s.vehKills), s.tracked),
  ].forEach((v, i) => T(v, 28, 1601, [250, 298, 345, 392, 437, 485][i], { weight: 700, align: 'right', max: 130 }));
  const wimg = s.favWeapon ? await b.weapon(s.favWeapon, s.favWeaponName) : null;
  if (wimg) {
    // Вписываем в область 230×88 справа, по центру по высоте.
    const k = Math.min(230 / wimg.width, 88 / wimg.height);
    const w = wimg.width * k;
    const h = wimg.height * k;
    x.globalAlpha = 0.9;
    x.drawImage(wimg, 1606 - w, 643 - h / 2, w, h);
    x.globalAlpha = 1;
  }
  // Длинное (модовое) название: сначала уменьшаем до 28 px, дальше — в две строки.
  const wname = s.favWeapon ? weaponName(s.favWeapon, s.favWeaponName) : '—';
  const wmax = wimg ? 200 : 440;
  x.font = `700 28px Roboto`;
  if (x.measureText(wname).width > wmax && wname.includes(' ')) {
    const words = wname.split(' ');
    let line1 = words.shift();
    while (words.length && x.measureText(`${line1} ${words[0]}`).width <= wmax) line1 += ` ${words.shift()}`;
    T(line1, 28, 1164, 628, { weight: 700, max: wmax });
    T(words.join(' '), 28, 1164, 664, { weight: 700, max: wmax });
  } else {
    T(wname, 40, 1164, 646, { weight: 700, max: wmax });
  }

  // Низ: рекорды; справа вместо кнопок — бои и ключевые цифры
  T(s.bestStreak ? String(s.bestStreak) : '—', 30, 402, 850, { weight: 700 });
  T(s.bestScore ? num(s.bestScore) : '—', 30, 848, 850, { weight: 700 });
  const extra = [`${s.matches} ${plural(s.matches, 'бой', 'боя', 'боёв')}`, `победы ${s.wins} : ${s.losses}`];
  if (s.longest > 0) extra.push(`дальний ${Math.round(s.longest)} м`);
  if (s.headshots) extra.push(`хедшоты ${s.headshots}`);
  T(extra.join('   ·   '), 19, 1626, 850, { color: C.grey, align: 'right', max: 640 });

  return canvas.encode('png');
}

module.exports = { renderPlayerCard };
