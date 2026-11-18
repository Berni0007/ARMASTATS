'use strict';

// Разбор событий от мода и запись в базу.

function str(v) {
  return typeof v === 'string' ? v : '';
}

function num(v, def = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : def;
}

function createIngest(db) {
  const q = {
    event: db.prepare(
      'INSERT INTO events (event_id, server_id, match_id, type, ts, payload, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ),
    capture: db.prepare(
      'INSERT INTO captures (match_id, ts, point, from_faction, to_faction, control) VALUES (?, ?, ?, ?, ?, ?)'
    ),
    matchPoints: db.prepare('UPDATE matches SET points_end = ? WHERE match_id = ?'),
    seen: db.prepare('SELECT 1 FROM events WHERE event_id = ?'),
    matchStart: db.prepare(
      `INSERT INTO matches (match_id, server_id, world, started_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(match_id) DO UPDATE SET world = excluded.world, started_at = excluded.started_at`
    ),
    matchEnsure: db.prepare(
      'INSERT OR IGNORE INTO matches (match_id, server_id, started_at) VALUES (?, ?, ?)'
    ),
    matchEnd: db.prepare(
      'UPDATE matches SET ended_at = ?, duration_sec = ?, end_reason = ?, winners = ? WHERE match_id = ?'
    ),
    player: db.prepare(
      `INSERT INTO players (uid, name, first_seen, last_seen) VALUES (?, ?, ?, ?)
       ON CONFLICT(uid) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen`
    ),
    matchPlayer: db.prepare(
      `INSERT INTO match_players (match_id, uid, name, faction) VALUES (?, ?, ?, ?)
       ON CONFLICT(match_id, uid) DO UPDATE SET
         name = excluded.name,
         faction = COALESCE(NULLIF(excluded.faction, ''), match_players.faction)`
    ),
    playerCounters: db.prepare(
      `INSERT INTO player_match_stats (match_id, uid, assists, hits, shots, captures, revives, veh_damage, veh_kills)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(match_id, uid) DO UPDATE SET
         assists = MAX(assists, excluded.assists), hits = MAX(hits, excluded.hits), shots = MAX(shots, excluded.shots),
         captures = MAX(captures, excluded.captures), revives = MAX(revives, excluded.revives),
         veh_damage = MAX(veh_damage, excluded.veh_damage), veh_kills = MAX(veh_kills, excluded.veh_kills)`
    ),
    kill: db.prepare(
      `INSERT INTO kills (match_id, server_id, ts, relation, team_kill,
         killer_uid, killer_name, killer_is_ai, killer_faction,
         victim_uid, victim_name, victim_is_ai, victim_faction, weapon, distance,
         weapon_source, damage_type, hit_zone, weapon_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
  };

  function touchPlayer(matchId, uid, name, faction, ts) {
    if (!uid) return;
    q.player.run(uid, name || uid, ts, ts);
    if (matchId) q.matchPlayer.run(matchId, uid, name || uid, faction || '');
  }

  // Возвращает { duplicate: true } для повтора, { matchEnded: matchId } в конце матча, иначе {}.
  return function ingest(event) {
    const type = event.type;
    const serverId = str(event.serverId);
    const matchId = str(event.matchId);
    const ts = num(event.ts, Math.floor(Date.now() / 1000));
    const d = event.data && typeof event.data === 'object' ? event.data : {};
    const result = {};
    const eventId = str(event.eventId) || null;

    // Повтор из буфера мода: событие уже учтено.
    if (eventId && q.seen.get(eventId)) return { duplicate: true };

    db.exec('BEGIN');
    try {
      q.event.run(eventId, serverId, matchId, type, ts, JSON.stringify(event), new Date().toISOString());

      if (matchId && type !== 'match_start') q.matchEnsure.run(matchId, serverId, ts);

      switch (type) {
        case 'match_start':
          if (matchId) q.matchStart.run(matchId, serverId, str(d.world), ts);
          break;

        case 'player_join':
        case 'player_leave':
          touchPlayer(matchId, str(d.uid), str(d.name), '', ts);
          break;

        case 'player_spawn':
          touchPlayer(matchId, str(d.uid), str(d.name), str(d.faction), ts);
          break;

        case 'kill': {
          // Игрок — тот, у кого есть ID игрока. ИИ приходит с ID <= 0.
          const killerIsAi = num(d.killerId) <= 0 ? 1 : 0;
          const victimIsAi = num(d.victimId) <= 0 ? 1 : 0;
          const killerUid = killerIsAi ? '' : str(d.killerUid);
          const victimUid = victimIsAi ? '' : str(d.victimUid);

          // Движок ставит teamKill только за убийство союзника-игрока.
          // Убийство союзного бота приходит как KILLED_BY_FRIENDLY_PLAYER без флага — это тоже тимкилл.
          const relation = str(d.relation);
          const teamKill = d.teamKill || relation.includes('FRIENDLY') ? 1 : 0;

          q.kill.run(
            matchId, serverId, ts, relation, teamKill,
            killerUid, str(d.killerName), killerIsAi, str(d.killerFaction),
            victimUid, str(d.victimName), victimIsAi, str(d.victimFaction),
            str(d.weapon), num(d.distance, -1),
            str(d.weaponSource), str(d.damageType), str(d.hitZone), str(d.weaponName)
          );

          touchPlayer(matchId, killerUid, str(d.killerName), str(d.killerFaction), ts);
          touchPlayer(matchId, victimUid, str(d.victimName), str(d.victimFaction), ts);
          break;
        }

        // Личные счётчики: мод шлёт нарастающий итог при выходе игрока и в конце матча.
        case 'player_stats':
          if (matchId && str(d.uid)) {
            q.playerCounters.run(
              matchId, str(d.uid),
              num(d.assists, 0), num(d.hits, 0), num(d.shots, 0), num(d.captures, 0),
              num(d.revives, 0), num(d.vehDamage, 0), num(d.vehKills, 0)
            );
          }
          break;

        case 'capture':
          q.capture.run(matchId, ts, str(d.point), str(d.from), str(d.to), d.control ? 1 : 0);
          break;

        case 'match_end': {
          const winners = Array.isArray(d.winners) ? d.winners.filter((w) => typeof w === 'string') : [];
          if (matchId) {
            q.matchEnd.run(ts, num(d.durationSec), num(d.endReason, -1), JSON.stringify(winners), matchId);
            // Владельцы точек на конец боя: { points: {имя: фракция}, controlPoints: [имена] }
            if (d.points && typeof d.points === 'object') {
              const control = Array.isArray(d.controlPoints) ? d.controlPoints.filter((x) => typeof x === 'string') : [];
              q.matchPoints.run(JSON.stringify({ points: d.points, control }), matchId);
            }
            result.matchEnded = matchId;
          }
          break;
        }

        default:
          break; // ping и неизвестные типы только пишутся в events
      }

      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    return result;
  };
}

module.exports = { createIngest };
