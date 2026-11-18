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
      `SELECT weapon, MAX(weapon_name) AS weapon_name, COUNT(*) AS n FROM kills
       WHERE killer_uid = ? AND ${VALID_KILL} AND weapon <> ''
       GROUP BY weapon ORDER BY n DESC LIMIT 1`
    ),
    matches: db.prepare('SELECT COUNT(*) AS n FROM match_players WHERE uid = ?'),
    pCounters: db.prepare(
      `SELECT SUM(assists) AS assists, SUM(hits) AS hits, SUM(shots) AS shots, SUM(captures) AS captures,
              SUM(revives) AS revives, SUM(veh_damage) AS vehDamage, SUM(veh_kills) AS vehKills,
              COUNT(*) AS n
       FROM player_match_stats WHERE uid = ?`
    ),
    pBattles: db.prepare(
      `SELECT mp.faction, m.winners FROM match_players mp JOIN matches m ON m.match_id = mp.match_id
       WHERE mp.uid = ?`
    ),
    pRole: db.prepare(
      `SELECT json_extract(payload, '$.data.role') AS role, COUNT(*) AS n FROM events
       WHERE type = 'player_spawn' AND json_extract(payload, '$.data.uid') = ?
         AND COALESCE(json_extract(payload, '$.data.role'), '') <> ''
       GROUP BY role ORDER BY n DESC LIMIT 1`
    ),
    pStreakRows: db.prepare(
      `SELECT match_id, ts, 1 AS kill FROM kills WHERE killer_uid = ? AND ${VALID_KILL}
       UNION ALL
       SELECT match_id, ts, 0 AS kill FROM kills WHERE victim_uid = ?
       ORDER BY match_id, ts, kill`
    ),
    pRank: db.prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT killer_uid, COUNT(*) AS k FROM kills WHERE ${VALID_KILL} GROUP BY killer_uid
       ) WHERE k > ?`
    ),
    pSessions: db.prepare(
      `SELECT e.match_id, e.type, e.ts, mp.faction FROM events e
       LEFT JOIN match_players mp ON mp.match_id = e.match_id AND mp.uid = ?
       WHERE e.type IN ('player_join', 'player_leave', 'player_spawn')
         AND json_extract(e.payload, '$.data.uid') = ?
       ORDER BY e.match_id, e.ts`
    ),
    pMatchKills: db.prepare(
      `SELECT match_id,
              SUM(CASE WHEN ${VALID_KILL} AND victim_is_ai = 0 THEN 1 ELSE 0 END) AS pvp,
              SUM(CASE WHEN ${VALID_KILL} AND victim_is_ai = 1 THEN 1 ELSE 0 END) AS ai,
              SUM(CASE WHEN team_kill = 1 AND victim_uid <> killer_uid THEN 1 ELSE 0 END) AS tk
       FROM kills WHERE killer_uid = ? GROUP BY match_id`
    ),
    pMatchCounters: db.prepare('SELECT * FROM player_match_stats WHERE uid = ?'),
    pSpawns: db.prepare(
      `SELECT match_id, ts FROM events
       WHERE type = 'player_spawn' AND json_extract(payload, '$.data.uid') = ? ORDER BY ts`
    ),
    pLeaves: db.prepare(
      `SELECT match_id, ts FROM events
       WHERE type = 'player_leave' AND json_extract(payload, '$.data.uid') = ? ORDER BY ts`
    ),
    pDeaths: db.prepare('SELECT match_id, ts FROM kills WHERE victim_uid = ? ORDER BY ts'),
    pMatchEnd: db.prepare(
      `SELECT COALESCE(m.ended_at, (SELECT MAX(ts) FROM events e WHERE e.match_id = m.match_id)) AS end
       FROM matches m WHERE m.match_id = ?`
    ),

    match: db.prepare('SELECT * FROM matches WHERE match_id = ?'),
    matchShots: db.prepare('SELECT uid, shots, squad FROM player_match_stats WHERE match_id = ?'),
    // Отряд из последнего спавна в матче (если счётчики не пришли или в них нет отряда).
    matchSpawnSquads: db.prepare(
      `SELECT json_extract(payload, '$.data.uid') AS uid, json_extract(payload, '$.data.squad') AS squad FROM events
       WHERE match_id = ? AND type = 'player_spawn' ORDER BY ts`
    ),
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
    dLeavesTs: db.prepare(
      `SELECT json_extract(payload, '$.data.uid') AS uid, ts FROM events
       WHERE match_id = ? AND type = 'player_leave' ORDER BY ts`
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
      `SELECT weapon, MAX(weapon_name) AS weapon_name, COUNT(*) AS n FROM kills
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

  // Личное время жизни: от возрождения до первого из — смерть, выход, следующее возрождение, конец матча.
  function lifeOf(uid) {
    const group = (rows) => {
      const m = new Map();
      for (const r of rows) {
        if (!m.has(r.match_id)) m.set(r.match_id, []);
        m.get(r.match_id).push(r.ts);
      }
      return m;
    };
    const spawns = group(q.pSpawns.all(uid));
    const deaths = group(q.pDeaths.all(uid));
    const leaves = group(q.pLeaves.all(uid));
    let sum = 0;
    let n = 0;
    let longest = 0;
    for (const [matchId, list] of spawns) {
      const end = (q.pMatchEnd.get(matchId) || {}).end;
      list.forEach((ts, i) => {
        const after = (arr) => (arr || []).find((t) => t >= ts);
        const ends = [after(deaths.get(matchId)), after(leaves.get(matchId)), list[i + 1], end].filter((v) => v != null);
        if (!ends.length) return;
        const life = Math.min(...ends) - ts;
        if (life > 0) {
          sum += life;
          n++;
          if (life > longest) longest = life;
        }
      });
    }
    return { avgLifeSec: n ? sum / n : 0, longestLifeSec: longest, lives: n };
  }

  // Наибольшая серия: убийства подряд без смерти, в пределах одного матча.
  function bestStreak(uid) {
    let best = 0;
    let cur = 0;
    let match = null;
    for (const r of q.pStreakRows.all(uid, uid)) {
      if (r.match_id !== match) {
        match = r.match_id;
        cur = 0;
      }
      if (r.kill) best = Math.max(best, ++cur);
      else cur = 0;
    }
    return best;
  }

  // Бои по сторонам и победы/поражения. Ничья и незавершённые матчи не считаются.
  function battlesOf(uid) {
    const byFaction = {};
    let wins = 0;
    let losses = 0;
    for (const r of q.pBattles.all(uid)) {
      if (r.faction) byFaction[r.faction] = (byFaction[r.faction] || 0) + 1;
      const winners = safeJson(r.winners, []);
      if (!r.faction || !Array.isArray(winners) || !winners.length) continue;
      if (winners.includes(r.faction)) wins++;
      else losses++;
    }
    const mainFaction = Object.entries(byFaction).sort((a, b) => b[1] - a[1])[0];
    return { byFaction, wins, losses, mainFaction: mainFaction ? mainFaction[0] : '' };
  }

  // Личные счётчики из мода. tracked = мод уже присылал их (иначе в карточке прочерки).
  function counters(uid) {
    const c = q.pCounters.get(uid) || {};
    return {
      tracked: (c.n || 0) > 0,
      assists: c.assists || 0,
      hits: c.hits || 0,
      shots: c.shots || 0,
      captures: c.captures || 0,
      revives: c.revives || 0,
      vehDamage: c.vehDamage || 0,
      vehKills: c.vehKills || 0,
    };
  }

  // Время в игре по сторонам: от входа (или первого спавна) до выхода либо конца матча.
  function playtimeOf(uid) {
    const byFaction = {};
    let total = 0;
    let match = null;
    let start = null;
    let faction = '';
    const close = (until) => {
      if (start == null || until == null || until <= start) return;
      const sec = until - start;
      total += sec;
      if (faction) byFaction[faction] = (byFaction[faction] || 0) + sec;
      start = null;
    };
    const matchEnd = (id) => (q.pMatchEnd.get(id) || {}).end;
    for (const r of q.pSessions.all(uid, uid)) {
      if (r.match_id !== match) {
        if (match) close(matchEnd(match));
        match = r.match_id;
        start = null;
      }
      faction = r.faction || faction;
      if (r.type === 'player_leave') close(r.ts);
      else if (start == null) start = r.ts;
    }
    if (match) close(matchEnd(match));
    return { playSec: total, playByFaction: byFaction };
  }

  // Рекорд очков за один матч — по той же формуле, что и общие очки.
  function bestMatchScore(uid) {
    const per = new Map();
    const row = (id) => {
      if (!per.has(id)) per.set(id, { pvpKills: 0, aiKills: 0, teamKills: 0, assists: 0, captures: 0, revives: 0, vehKills: 0 });
      return per.get(id);
    };
    for (const k of q.pMatchKills.all(uid)) Object.assign(row(k.match_id), { pvpKills: k.pvp || 0, aiKills: k.ai || 0, teamKills: k.tk || 0 });
    for (const c of q.pMatchCounters.all(uid)) {
      Object.assign(row(c.match_id), { assists: c.assists, captures: c.captures, revives: c.revives, vehKills: c.veh_kills });
    }
    let best = 0;
    for (const v of per.values()) best = Math.max(best, playerScore(v));
    return best;
  }

  function playerStats(uid) {
    const p = q.player.get(uid);
    if (!p) return null;

    const k = q.kills.get(uid);
    const d = q.deaths.get(uid);
    const pvp = k.pvp || 0;
    const ai = k.ai || 0;
    const deaths = d.deaths || 0;

    const s = {
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
      favWeaponName: (q.favWeapon.get(uid) || {}).weapon_name || '',
      ...lifeOf(uid),
      ...battlesOf(uid),
      ...counters(uid),
      ...playtimeOf(uid),
      bestScore: bestMatchScore(uid),
      bestStreak: bestStreak(uid),
      rank: q.pRank.get(pvp + ai).n + 1,
      firstSeen: p.first_seen,
      lastSeen: p.last_seen,
    };
    s.score = playerScore(s);
    Object.assign(s, levelOf(s.score));
    return s;
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
      players.set(p.uid, { uid: p.uid, name: p.name, faction: p.faction, kills: 0, pvp: 0, deaths: 0, longest: 0, shots: null, squad: '' });
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
    // Выстрелы — из личных счётчиков мода (0.4+); null, если мод их не прислал.
    for (const r of q.matchSpawnSquads.all(matchId)) {
      const p = players.get(r.uid);
      if (p && r.squad) p.squad = r.squad;
    }
    for (const r of q.matchShots.all(matchId)) {
      const p = players.get(r.uid);
      if (!p) continue;
      p.shots = r.shots;
      if (r.squad) p.squad = r.squad;
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
      title: m.title || '',
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
    // Жизнь заканчивается на первом из: смерть, выход с сервера, следующий спавн, конец матча.
    const leaves = new Map();
    for (const l of q.dLeavesTs.all(matchId)) {
      if (!l.uid) continue;
      if (!leaves.has(l.uid)) leaves.set(l.uid, []);
      leaves.get(l.uid).push(l.ts);
    }
    const spawnsBy = new Map();
    for (const sp of spawns) {
      if (!spawnsBy.has(sp.uid)) spawnsBy.set(sp.uid, []);
      spawnsBy.get(sp.uid).push(sp.ts);
    }
    let lifeSum = 0;
    let lifeN = 0;
    for (const sp of spawns) {
      const after = (list) => (list || []).find((t) => t >= sp.ts);
      const nextSpawn = (spawnsBy.get(sp.uid) || []).find((t) => t > sp.ts);
      const ends = [after(byUid.get(sp.uid)), after(leaves.get(sp.uid)), nextSpawn, end].filter((v) => v != null);
      const until = Math.min(...ends);
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

    const weapons = q.dWeapons.all(matchId).map((w) => ({ weapon: w.weapon, weaponName: w.weapon_name || '', kills: w.n, share: kills ? w.n / kills : 0 }));
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

// Очки игрока — прозрачная формула, одинаковая для всех.
const SCORE = { pvp: 100, ai: 50, assist: 50, capture: 200, revive: 100, vehKill: 300, teamKill: -300 };
function playerScore(s) {
  const v =
    s.pvpKills * SCORE.pvp + s.aiKills * SCORE.ai + s.assists * SCORE.assist + s.captures * SCORE.capture +
    s.revives * SCORE.revive + s.vehKills * SCORE.vehKill + s.teamKills * SCORE.teamKill;
  return Math.max(0, Math.round(v));
}

// Уровень растёт от очков: уровень N требует 500·(N−1)² очков. Звание — по уровню.
const RANKS = [
  [1, 'Рядовой'], [3, 'Ефрейтор'], [6, 'Младший сержант'], [10, 'Сержант'], [15, 'Старший сержант'],
  [20, 'Старшина'], [26, 'Прапорщик'], [32, 'Старший прапорщик'], [38, 'Младший лейтенант'],
  [44, 'Лейтенант'], [50, 'Старший лейтенант'], [57, 'Капитан'], [64, 'Майор'],
  [72, 'Подполковник'], [80, 'Полковник'],
];
function levelOf(score) {
  const level = Math.floor(Math.sqrt(Math.max(0, score) / 500)) + 1;
  let rankName = RANKS[0][1];
  for (const [from, name] of RANKS) if (level >= from) rankName = name;
  return { level, rankName };
}

function safeJson(s, def) {
  try {
    return s ? JSON.parse(s) : def;
  } catch {
    return def;
  }
}

module.exports = { SCORE, RANKS, createStats };
