'use strict';

// Оформление сообщений для Discord. Чистые функции: на вход данные, на выход объекты embed.

const COLOR_MATCH = 0xe87820; // оранжевый ZARUBA
const COLOR_PLAYER = 0x378add;

const FACTION_NAMES = { US: 'НАТО', USSR: 'РФ', FIA: 'FIA' };

function factionName(key) {
  return FACTION_NAMES[key] || key || '?';
}

// "{GUID}Prefabs/Weapons/Rifles/AK74M/Rifle_AK74M_b30_....et" -> "AK74M"
function weaponName(prefab) {
  if (!prefab) return '—';
  const file = prefab.split('/').pop().replace(/\.et$/i, '');
  const parts = file.split('_');
  const kinds = ['rifle', 'pistol', 'mg', 'launcher', 'smg', 'shotgun', 'sniper', 'grenade', 'handgun', 'weapon',
    'mine', 'rocket', 'missile', 'explosive', 'charge', 'shell', 'ammo', 'vehicle'];
  if (parts.length > 1 && kinds.includes(parts[0].toLowerCase())) parts.shift();
  return parts[0] || file;
}

// "$ZARUBAFORESTFORT2048:Worlds/ZARUBAFORESTFORT2048_Ivent.ent" -> "ZARUBAFORESTFORT2048_Ivent"
function worldName(world) {
  if (!world) return '?';
  return world.split(/[:/]/).pop().replace(/\.ent$/i, '');
}

function duration(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return `${m} мин`;
  return `${s} с`;
}

function fixed(n, digits = 2) {
  return Number(n || 0).toFixed(digits);
}

function meters(n) {
  return n > 0 ? `${Math.round(n)} м` : '—';
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function padStart(s, n) {
  s = String(s);
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}

function matchEmbed(r, topN = 5) {
  const winners = r.winners.length ? r.winners.map(factionName).join(', ') : 'нет';

  const fields = [];
  const factionKeys = Object.keys(r.factions);
  for (const key of factionKeys) {
    const f = r.factions[key];
    fields.push({ name: factionName(key), value: `Убийств ${f.kills} · потерь ${f.deaths}`, inline: true });
  }
  fields.push({ name: 'Тимкиллы', value: String(r.teamKills), inline: true });

  const top = r.players.slice(0, topN);
  if (top.length) {
    const lines = [`${pad('#', 3)}${pad('игрок', 16)}${padStart('уб', 4)}${padStart('см', 4)}  дальний`];
    top.forEach((p, i) => {
      lines.push(`${pad(i + 1, 3)}${pad(p.name, 16)}${padStart(p.kills, 4)}${padStart(p.deaths, 4)}  ${meters(p.longest)}`);
    });
    fields.push({ name: `Топ-${top.length}`, value: '```\n' + lines.join('\n') + '\n```' });
  }

  return {
    title: `Итог матча · ${worldName(r.world)}`,
    description: `Победа: ${winners} · длительность ${duration(r.durationSec)} · игроков ${r.playerCount}`,
    color: COLOR_MATCH,
    fields,
    footer: { text: `${r.serverId} · ${r.matchId}` },
    timestamp: r.endedAt ? new Date(r.endedAt * 1000).toISOString() : undefined,
  };
}

function playerEmbed(s) {
  return {
    title: `Игрок ${s.name}`,
    description: `Матчей ${s.matches}`,
    color: COLOR_PLAYER,
    fields: [
      { name: 'Убийств', value: `${s.kills}`, inline: true },
      { name: 'Смертей', value: `${s.deaths}`, inline: true },
      { name: 'K/D', value: fixed(s.kd), inline: true },
      { name: 'Игроков убито', value: `${s.pvpKills}`, inline: true },
      { name: 'Ботов убито', value: `${s.aiKills}`, inline: true },
      { name: 'Тимкиллы', value: `${s.teamKills}`, inline: true },
      { name: 'Дальний килл', value: meters(s.longest), inline: true },
      { name: 'Любимое оружие', value: weaponName(s.favWeapon), inline: true },
      { name: 'Самоубийства', value: `${s.suicides}`, inline: true },
      { name: 'Хедшоты', value: `${s.headshots}`, inline: true },
    ],
    footer: { text: s.uid },
  };
}

function topEmbed(rows) {
  if (!rows.length) {
    return { title: 'Лучшие игроки', description: 'Пока нет ни одного засчитанного убийства.', color: COLOR_MATCH };
  }
  const lines = [`${pad('#', 3)}${pad('игрок', 16)}${padStart('уб', 5)}${padStart('см', 5)}${padStart('K/D', 6)}`];
  rows.forEach((r, i) => {
    lines.push(`${pad(i + 1, 3)}${pad(r.name, 16)}${padStart(r.kills, 5)}${padStart(r.deaths, 5)}${padStart(fixed(r.kd), 6)}`);
  });
  return {
    title: 'Лучшие игроки',
    description: '```\n' + lines.join('\n') + '\n```',
    color: COLOR_MATCH,
  };
}

// Короткий ответ для игрового чата (#stats). Одна строка.
function chatLine(s) {
  const parts = [
    `${s.name}: убийств ${s.kills} (игроков ${s.pvpKills}, ботов ${s.aiKills})`,
    `смертей ${s.deaths}`,
    `K/D ${fixed(s.kd)}`,
  ];
  if (s.headshots) parts.push(`хедшотов ${s.headshots}`);
  if (s.longest > 0) parts.push(`дальний ${meters(s.longest)}`);
  if (s.teamKills) parts.push(`тимкиллов ${s.teamKills}`);
  parts.push(`боёв ${s.matches}`);
  return parts.join(', ');
}

module.exports = { matchEmbed, playerEmbed, topEmbed, chatLine, weaponName, worldName, duration };
