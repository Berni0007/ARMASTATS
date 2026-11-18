'use strict';

// Подсчёт статистики по таблице kills.
//
// Засчитанное убийство: убийца — игрок, жертва — не он сам, не тимкилл.
// Смерть: любая гибель игрока, включая самоубийство и тимкилл по нему.

const VALID_KILL = `killer_uid <> '' AND team_kill = 0 AND (victim_is_ai = 1 OR victim_uid <> killer_uid)`;

function createStats(db) {
  const q = {
    player: db.prepare('SELECT uid, name, first_seen, last_seen FROM players WHERE uid = ?'),
    findExact: db.prepare('SELECT uid, name FROM players WHERE name = ? COLLATE NOCASE ORDER BY last_seen DESC LIMIT 1'),
    findLike: db.prepare(
      "SELECT uid, name FROM players WHERE name LIKE ? ESCAPE '\\' COLLATE NOCASE ORDER BY last_seen DESC LIMIT ?"
    ),

    kills: db.prepare(
      `SELECT
         SUM(CASE WHEN victim_is_ai = 0 THEN 1 ELSE 0 END) AS pvp,
         SUM(CASE WHEN victim_is_ai = 1 THEN 1 ELSE 0 END) AS ai,
         MAX(distance) AS longest,
         SUM(CASE WHEN hit_zone LIKE 'Head%' THEN 1 ELSE 0 END) AS headshots
       FROM kills WHERE killer_uid = ? AND ${VALID_KILL}`
    ),
    teamKills: db.prepare(
      `SELECT COUNT(*) AS n FROM kills
       WHERE killer_uid = ? AND team_kill = 1 AND victim_uid <> killer_uid`
    ),
    deaths: db.prepare(
      `SELECT COUNT(*) AS deaths,
              SUM(CASE WHEN killer_uid = victim_uid THEN 1 ELSE 0 END) AS suicides
       FROM kills WHERE victim_uid = ?`
    ),
    favWeapon: db.prepare(
      `SELECT weapon, COUNT(*) AS n FROM kills
       WHERE killer_uid = ? AND ${VALID_KILL} AND weapon <> ''
       GROUP BY weapon ORDER BY n DESC LIMIT 1`
    ),
    matches: db.prepare('SELECT COUNT(*) AS n FROM match_players WHERE uid = ?'),

    match: db.prepare('SELECT * FROM matches WHERE match_id = ?'),
    matchPlayers: db.prepare('SELECT uid, name, faction FROM match_players WHERE match_id = ?'),
    matchKillsBy: db.prepare(
      `SELECT killer_uid AS uid,
              COUNT(*) AS kills,
              SUM(CASE WHEN victim_is_ai = 0 THEN 1 ELSE 0 END) AS pvp,
              MAX(distance) AS longest
       FROM kills WHERE match_id = ? AND ${VALID_KILL}
       GROUP BY killer_uid`
    ),
    matchDeathsBy: db.prepare(
      `SELECT victim_uid AS uid, COUNT(*) AS deaths
       FROM kills WHERE match_id = ? AND victim_uid <> '' GROUP BY victim_uid`
    ),
    matchTeamKillsBy: db.prepare(
      `SELECT killer_faction AS faction, COUNT(*) AS n FROM kills
       WHERE match_id = ? AND team_kill = 1 AND victim_uid <> killer_uid AND killer_faction <> ''
       GROUP BY killer_faction`
    ),
    matchPlayersBy: db.prepare('SELECT faction, COUNT(*) AS n FROM match_players WHERE match_id = ? AND faction <> \'\' GROUP BY faction'),
    matchTeamKills: db.prepare(
      `SELECT COUNT(*) AS n FROM kills WHERE match_id = ? AND team_kill = 1 AND victim_uid <> killer_uid`
    ),
    matchFactionKills: db.prepare(
      `SELECT killer_faction AS faction, COUNT(*) AS n FROM kills
       WHERE match_id = ? AND killer_faction <> ''
         AND team_kill = 0 AND NOT (killer_uid <> '' AND killer_uid = victim_uid)
       GROUP BY killer_faction`
    ),
    matchFactionDeaths: db.prepare(
      `SELECT victim_faction AS faction, COUNT(*) AS n FROM kills
       WHERE match_id = ? AND victim_faction <> '' GROUP BY victim_faction`
    ),
    markReported: db.prepare('UPDATE matches SET reported = 1 WHERE match_id = ?'),
    codeClean: db.prepare('DELETE FROM link_codes WHERE expires_at < ? OR uid = ?'),
    codeInsert: db.prepare('INSERT INTO link_codes (code, uid, expires_at) VALUES (?, ?, ?)'),
    codeGet: db.prepare('SELECT uid FROM link_codes WHERE code = ? AND expires_at >= ?'),
    codeDelete: db.prepare('DELETE FROM link_codes WHERE code = ?'),
    linkSet: db.prepare(
      `INSERT INTO links (discord_id, uid, linked_at) VALUES (?, ?, ?)
       ON CONFLICT(discord_id) DO UPDATE SET uid = excluded.uid, linked_at = excluded.linked_at`
    ),
    linkGet: db.prepare('SELECT uid FROM links WHERE discord_id = ?'),
    dSpawns: db.prepare(
      `SELECT json_extract(payload, '$.data.uid') AS uid, ts FROM events
       WHERE match_id = ? AND type = 'player_spawn' ORDER BY ts`
    ),
    dDeathsTs: db.prepare(`SELECT victim_uid AS uid, ts FROM kills WHERE match_id = ? AND victim_uid <> '' ORDER BY ts`),
    dTotals: db.prepare(
      `SELECT
         SUM(CASE WHEN ${VALID_KILL} THEN 1 ELSE 0 END) AS kills,
         SUM(CASE WHEN victim_uid <> '' THEN 1 ELSE 0 END) AS deaths,
         SUM(CASE WHEN ${VALID_KILL} AND hit_zone LIKE 'Head%' THEN 1 ELSE 0 END) AS headshots,
         MAX(CASE WHEN ${VALID_KILL} THEN distance END) AS longest
       FROM kills WHERE match_id = ?`
    ),
    dBestKills: db.prepare(
      `SELECT killer_uid AS uid, killer_name AS name, COUNT(*) AS kills,
              SUM(CASE WHEN hit_zone LIKE 'Head%' THEN 1 ELSE 0 END) AS headshots,
              MAX(distance) AS longest
       FROM kills WHERE match_id = ? AND ${VALID_KILL}
       GROUP BY killer_uid`
    ),
    dWeapons: db.prepare(
      `SELECT weapon, COUNT(*) AS n FROM kills
       WHERE match_id = ? AND ${VALID_KILL} AND weapon <> ''
       GROUP BY weapon ORDER BY n DESC LIMIT 5`
    ),
    dSources: db.prepare(
      `SELECT CASE WHEN weapon_source = '' THEN 'hands' WHEN weapon_source = 'damage' THEN 'hands' ELSE weapon_source END AS src,
              COUNT(*) AS n
       FROM kills WHERE match_id = ? AND ${VALID_KILL} GROUP BY src`
    ),
    dTimeline: db.prepare(
      `SELECT ts, killer_faction AS faction FROM kills
       WHERE match_id = ? AND team_kill = 0 AND killer_faction <> ''
         AND NOT (killer_uid <> '' AND killer_uid = victim_uid)`
    ),
    dCaptures: db.prepare('SELECT ts, point, from_faction AS "from", to_faction AS "to", control FROM captures WHERE match_id = ? ORDER BY ts'),
    lastMatch: db.prepare('SELECT match_id FROM matches WHERE ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 1'),

    top: db.prepare(
      `SELECT k.killer_uid AS uid, p.name AS name,
              COUNT(*) AS kills,
              SUM(CASE WHEN k.victim_is_ai = 0 THEN 1 ELSE 0 END) AS pvp,
              SUM(CASE WHEN k.hit_zone LIKE 'Head%' THEN 1 ELSE 0 END) AS headshots,
              MAX(k.distance) AS longest,
              (SELECT COUNT(*) FROM kills d WHERE d.victim_uid = k.killer_uid) AS deaths
       FROM (SELECT * FROM kills WHERE ${VALID_KILL}) k
       JOIN players p ON p.uid = k.killer_uid
       GROUP BY k.killer_uid
       ORDER BY kills DESC, deaths ASC
       LIMIT ?`
    ),
  };

  function playerStats(uid) {
    const p = q.player.get(uid);
    if (!p) return null;

    const k = q.kills.get(uid);
    const d = q.deaths.get(uid);
    const pvp = k.pvp || 0;
    const ai = k.ai || 0;
    const deaths = d.deaths || 0;

    return {
      uid: p.uid,
      name: p.name,
      matches: q.matches.get(uid).n,
      kills: pvp + ai,
      pvpKills: pvp,
      aiKills: ai,
      deaths,
      suicides: d.suicides || 0,
      teamKills: q.teamKills.get(uid).n,
      kd: deaths > 0 ? (pvp + ai) / deaths : pvp + ai,
      longest: k.longest != null && k.longest > 0 ? k.longest : 0,
      headshots: k.headshots || 0,
      favWeapon: (q.favWeapon.get(uid) || {}).weapon || '',
      firstSeen: p.first_seen,
      lastSeen: p.last_seen,
    };
  }

  // Поиск игрока по нику: точное совпадение, иначе по части ника.
  function findPlayer(query) {
    const name = String(query || '').trim();
    if (!name) return null;
    const exact = q.findExact.get(name);
    if (exact) return exact;
    const like = q.findLike.all(`%${escapeLike(name)}%`, 1);
    return like[0] || null;
  }

  function suggestPlayers(query, limit = 25) {
    return q.findLike.all(`%${escapeLike(String(query || '').trim())}%`, limit);
  }

  function matchReport(matchId) {
    const m = q.match.get(matchId);
    if (!m) return null;

    const players = new Map();
    for (const p of q.matchPlayers.all(matchId)) {
      players.set(p.uid, { uid: p.uid, name: p.name, faction: p.faction, kills: 0, pvp: 0, deaths: 0, longest: 0 });
    }
    for (const r of q.matchKillsBy.all(matchId)) {
      const p = players.get(r.uid);
      if (!p) continue;
      p.kills = r.kills;
      p.pvp = r.pvp;
      p.longest = r.longest > 0 ? r.longest : 0;
    }
    for (const r of q.matchDeathsBy.all(matchId)) {
      const p = players.get(r.uid);
      if (p) p.deaths = r.deaths;
    }

    const factions = {};
    for (const r of q.matchFactionKills.all(matchId)) {
      (factions[r.faction] ||= { kills: 0, deaths: 0 }).kills = r.n;
    }
    for (const r of q.matchFactionDeaths.all(matchId)) {
      (factions[r.faction] ||= { kills: 0, deaths: 0 }).deaths = r.n;
    }
    for (const r of q.matchTeamKillsBy.all(matchId)) {
      (factions[r.faction] ||= { kills: 0, deaths: 0 }).teamKills = r.n;
    }
    for (const r of q.matchPlayersBy.all(matchId)) {
      (factions[r.faction] ||= { kills: 0, deaths: 0 }).players = r.n;
    }

    const list = [...players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

    return {
      matchId: m.match_id,
      serverId: m.server_id,
      world: m.world || '',
      durationSec: m.duration_sec || 0,
      winners: safeJson(m.winners, []),
      endedAt: m.ended_at,
      playerCount: players.size,
      teamKills: q.matchTeamKills.get(matchId).n,
      factions,
      players: list,
    };
  }

  function top(limit = 10) {
    return q.top.all(limit).map((r) => ({
      ...r,
      kd: r.deaths > 0 ? r.kills / r.deaths : r.kills,
    }));
  }

  function markReported(matchId) {
    q.markReported.run(matchId);
  }

  // Всё для картинки «Статистика боя».
  function matchDashboard(matchId) {
    const r = matchReport(matchId);
    if (!r) return null;
    const m = q.match.get(matchId);
    const start = m.started_at || 0;
    const end = m.ended_at || start + Math.round(r.durationSec);

    // Возрождения и среднее время жизни: от спавна до ближайшей смерти этого игрока.
    const spawns = q.dSpawns.all(matchId).filter((s) => s.uid);
    const deaths = q.dDeathsTs.all(matchId);
    const byUid = new Map();
    for (const d of deaths) {
      if (!byUid.has(d.uid)) byUid.set(d.uid, []);
      byUid.get(d.uid).push(d.ts);
    }
    let lifeSum = 0;
    let lifeN = 0;
    for (const sp of spawns) {
      const list = byUid.get(sp.uid) || [];
      const death = list.find((t) => t >= sp.ts);
      const until = death != null ? death : end;
      if (until > sp.ts) {
        lifeSum += until - sp.ts;
        lifeN++;
      }
    }

    const t = q.dTotals.get(matchId);
    const kills = t.kills || 0;

    // Лучшие: по убийствам, по дальнему выстрелу, по хедшотам.
    const shooters = q.dBestKills.all(matchId).map((p) => ({ ...p, deaths: (r.players.find((x) => x.uid === p.uid) || {}).deaths || 0 }));
    const pick = (key) => [...shooters].sort((a, b) => (b[key] || 0) - (a[key] || 0) || b.kills - a.kills)[0] || null;
    const best = {
      shooter: pick('kills'),
      sniper: pick('longest'),
      marksman: shooters.some((p) => p.headshots > 0) ? pick('headshots') : null,
    };

    const weapons = q.dWeapons.all(matchId).map((w) => ({ weapon: w.weapon, kills: w.n, share: kills ? w.n / kills : 0 }));
    const sources = { hands: 0, explosive: 0, vehicle: 0 };
    for (const s of q.dSources.all(matchId)) sources[s.src] = (sources[s.src] || 0) + s.n;

    // Убийства по минутам для каждой стороны.
    const minutes = Math.max(1, Math.ceil((end - start) / 60));
    const timeline = {};
    for (const k of q.dTimeline.all(matchId)) {
      const i = Math.min(minutes - 1, Math.max(0, Math.floor((k.ts - start) / 60)));
      (timeline[k.faction] ||= new Array(minutes).fill(0))[i]++;
    }

    // Точки: счёт = сколько точек держит сторона на конец боя (если есть контрольные — только они).
    const captures = q.dCaptures.all(matchId);
    let score = null;
    let pointsTotal = 0;
    const snap = safeJson(m.points_end, null);
    if (snap && snap.points && Object.keys(snap.points).length) {
      const names = snap.control && snap.control.length ? snap.control : Object.keys(snap.points);
      score = {};
      for (const n of names) {
        const owner = snap.points[n];
        if (owner) score[owner] = (score[owner] || 0) + 1;
      }
      pointsTotal = names.length;
    }

    return {
      ...r,
      startedAt: start,
      captures,
      score,
      pointsTotal,
      totals: {
        kills,
        deaths: t.deaths || 0,
        spawns: spawns.length,
        headshots: t.headshots || 0,
        longest: t.longest > 0 ? t.longest : 0,
        avgLifeSec: lifeN ? lifeSum / lifeN : 0,
      },
      best,
      weapons,
      sources,
      timeline,
      minutes,
    };
  }

  // Код привязки: 6 символов без похожих букв и цифр, живёт 10 минут.
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function createLinkCode(uid) {
    const now = Math.floor(Date.now() / 1000);
    q.codeClean.run(now, uid);
    for (let attempt = 0; attempt < 5; attempt++) {
      let code = '';
      for (const b of require('node:crypto').randomBytes(6)) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
      try {
        q.codeInsert.run(code, uid, now + 600);
        return code;
      } catch {
        // совпадение кода — пробуем другой
      }
    }
    return null;
  }

  // Возвращает игрока, к которому привязан аккаунт, или null, если код неверный или истёк.
  function useLinkCode(code, discordId) {
    const now = Math.floor(Date.now() / 1000);
    const row = q.codeGet.get(String(code || '').trim().toUpperCase(), now);
    if (!row) return null;
    q.codeDelete.run(String(code).trim().toUpperCase());
    q.linkSet.run(discordId, row.uid, now);
    return q.player.get(row.uid);
  }

  function linkedUid(discordId) {
    const r = q.linkGet.get(discordId);
    return r ? r.uid : null;
  }

  function lastMatchId() {
    const r = q.lastMatch.get();
    return r ? r.match_id : null;
  }

  return {
    playerStats, findPlayer, suggestPlayers, matchReport, top, markReported, lastMatchId,
    createLinkCode, useLinkCode, linkedUid, matchDashboard,
  };
}

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => '\\' + c);
}

function safeJson(s, def) {
  try {
    return s ? JSON.parse(s) : def;
  } catch {
    return def;
  }
}

module.exports = { createStats };
