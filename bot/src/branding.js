'use strict';

// Оформление картинок. Всё настраивается файлами в DATA_DIR/branding на хосте, без пересборки:
//   branding.json         — названия и цвета сторон, названия карт, подпись
//   background.jpg|png    — фон дашборда (иначе тёмный фон с горизонталями)
//   logo.png|jpg          — лого в шапке (иначе лого ZARUBA)
//   header.png            — готовая шапка-шаблон 1683×259 (как концепт), поверх пишутся данные
//   player.png            — готовая карточка игрока 1672×941 (как концепт), поверх пишутся данные
//   weapons/<имя>.png     — картинка оружия (имя — игровое название или имя файла префаба); нет файла — только название
//   emblems/<КЛЮЧ>.png    — значок стороны, ключ как в игре: US, USSR, FIA... (иначе нарисованный щит)

const fs = require('node:fs');
const path = require('node:path');
const { loadImage } = require('@napi-rs/canvas');

const ASSETS = path.join(__dirname, '..', 'assets');
const DIR = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'branding');

const DEFAULTS = {
  title: 'СТАТИСТИКА БОЯ',
  subtitle: 'Матч завершён',
  footer: 'ARMASTATS',
  // Ключ — сторона в игре (US, USSR, FIA...). На сервере ZARUBA: US — НАТО, USSR — РФ.
  factions: {
    US: { name: 'НАТО', subtitle: 'Западные силы', color: '#4f86c6' },
    USSR: { name: 'РФ', subtitle: 'Вооружённые силы РФ', color: '#c84b3b' },
    FIA: { name: 'FIA', subtitle: 'Ополчение', color: '#6fae5f' },
  },
  // Порядок сторон: первая — слева в баннере, вторая — справа.
  order: ['US', 'USSR', 'FIA'],
  // Красивые названия карт: ключ — имя файла мира без .ent
  worlds: {},
};

const imageCache = new Map();

async function image(file) {
  if (!file) return null;
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  const hit = imageCache.get(file);
  if (hit && hit.mtime === stat.mtimeMs) return hit.img;
  try {
    const img = await loadImage(file);
    imageCache.set(file, { mtime: stat.mtimeMs, img });
    return img;
  } catch (e) {
    console.warn(`[branding] не удалось открыть ${file}: ${e.message}`);
    return null;
  }
}

function firstExisting(names) {
  for (const n of names) {
    const f = path.join(DIR, n);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

function loadConfig() {
  const file = path.join(DIR, 'branding.json');
  if (!fs.existsSync(file)) return DEFAULTS;
  try {
    const user = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      ...DEFAULTS,
      ...user,
      factions: { ...DEFAULTS.factions, ...(user.factions || {}) },
      worlds: { ...DEFAULTS.worlds, ...(user.worlds || {}) },
    };
  } catch (e) {
    console.warn(`[branding] ошибка в branding.json: ${e.message}`);
    return DEFAULTS;
  }
}

// Всё оформление для одной картинки.
async function loadBranding() {
  const cfg = loadConfig();
  return {
    ...cfg,
    background: await image(firstExisting(['background.jpg', 'background.png'])),
    logo: (await image(firstExisting(['logo.png', 'logo.jpg']))) || (await image(path.join(ASSETS, 'logo.jpg'))),
    soldier: await image(path.join(ASSETS, 'template.png')),
    // Готовая шапка 1683×259 (концепт) с очищенными местами под данные.
    // Шаблоны: свой файл в branding/ важнее встроенного в assets/.
    headerTemplate: await image(firstExisting(['header.png']) || path.join(ASSETS, 'header.png')),
    // Готовая карточка игрока 1672×941 (концепт) с очищенными местами под данные.
    playerTemplate: await image(firstExisting(['player.png']) || path.join(ASSETS, 'player.png')),
    // Картинка оружия: только своя, из weapons/<название или имя префаба>.png.
    async weapon(prefab, display) {
      const stem = String(prefab || '').split('/').pop().replace(/\.et$/i, '');
      const safe = (n) => String(n || '').replace(/[\\/:*?"<>|]/g, '_').trim();
      const own = firstExisting([`weapons/${safe(display)}.png`, `weapons/${safe(stem)}.png`].filter((n) => !n.endsWith('/.png')));
      // Только точная картинка этого оружия; общего силуэта нет, чтобы не путать модели.
      return own ? image(own) : null;
    },
    emblem: (key) => image(firstExisting([`emblems/${key}.png`, `emblems/${key}.jpg`])),
    order: cfg.order || DEFAULTS.order,
    faction(key) {
      const f = cfg.factions[key];
      return { name: (f && f.name) || key || '?', subtitle: (f && f.subtitle) || '', color: (f && f.color) || '#e87820' };
    },
    world(file) {
      const base = String(file || '').split(/[:/]/).pop().replace(/\.ent$/i, '');
      return cfg.worlds[base] || base.replace(/_/g, ' ') || '?';
    },
  };
}

module.exports = { loadBranding, BRANDING_DIR: DIR };
