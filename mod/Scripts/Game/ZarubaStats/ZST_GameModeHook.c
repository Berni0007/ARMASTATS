//! Точка входа мода: цепляемся к базовому гейммоду, чтобы работать на любом сценарии.
//! Все события собираются только на сервере.
modded class SCR_BaseGameMode
{
	//------------------------------------------------------------------------------------------------
	protected override void OnGameStart()
	{
		super.OnGameStart();

		if (!IsMaster())
			return;

		ZST_Api api = ZST_Api.GetInstance();
		api.ReloadConfig();
		string matchId = api.StartMatch();
		Print("[ZarubaStats] Loaded. Match " + matchId);

		// Досылаем то, что не ушло в прошлый раз (падение сервера, недоступный хост).
		api.FlushOutbox();
		api.StartAutoFlush();

		// Подписки. Через инвокеры, а не override, чтобы не зависеть от сигнатур методов гейммода.
		GetOnPlayerRegistered().Insert(ZST_OnPlayerRegistered);
		GetOnPlayerDisconnected().Insert(ZST_OnPlayerDisconnected);
		GetOnPlayerSpawned().Insert(ZST_OnPlayerSpawned);
		GetOnControllableDestroyed().Insert(ZST_OnControllableDestroyed);

		JsonSaveContext json = api.Begin("match_start");
		if (json)
		{
			json.WriteValue("world", GetGame().GetWorldFile());
			api.Send("match_start", json);
		}

		// Игроки, подключившиеся до старта гейммода (перезапуск сценария, Workbench).
		array<int> players = {};
		GetGame().GetPlayerManager().GetPlayers(players);
		foreach (int playerId : players)
		{
			ZST_OnPlayerRegistered(playerId);
		}
	}

	//------------------------------------------------------------------------------------------------
	protected override void OnGameModeEnd(SCR_GameModeEndData endData)
	{
		if (IsMaster())
			ZST_SendMatchEnd(endData);

		super.OnGameModeEnd(endData);
	}

	//------------------------------------------------------------------------------------------------
	protected void ZST_SendMatchEnd(SCR_GameModeEndData endData)
	{
		ZST_Api api = ZST_Api.GetInstance();
		JsonSaveContext json = api.Begin("match_end");
		if (!json)
			return;

		json.WriteValue("durationSec", GetElapsedTime());

		if (endData)
		{
			json.WriteValue("endReason", endData.GetEndReason());

			array<int> winnerFactionIds = {};
			endData.GetFactionWinnerIds(winnerFactionIds);

			array<string> winners = {};
			FactionManager fm = GetGame().GetFactionManager();
			foreach (int factionId : winnerFactionIds)
			{
				if (!fm)
					break;

				Faction f = fm.GetFactionByIndex(factionId);
				if (f)
					winners.Insert(f.GetFactionKey());
			}

			json.WriteValue("winners", winners);
		}

		api.Send("match_end", json);
	}

	//------------------------------------------------------------------------------------------------
	protected void ZST_OnPlayerRegistered(int playerId)
	{
		ZST_SendJoin(playerId, 0);
	}

	//------------------------------------------------------------------------------------------------
	//! UUID при первом входе бывает ещё не готов: повторяем через 2 с, до 5 раз.
	protected void ZST_SendJoin(int playerId, int attempt)
	{
		if (ZST_Utils.GetPlayerUid(playerId).IsEmpty() && attempt < 5)
		{
			GetGame().GetCallqueue().CallLater(ZST_SendJoin, 2000, false, playerId, attempt + 1);
			return;
		}

		ZST_Api api = ZST_Api.GetInstance();
		JsonSaveContext json = api.Begin("player_join");
		if (!json)
			return;

		json.WriteValue("playerId", playerId);
		json.WriteValue("uid", ZST_Utils.GetPlayerUid(playerId));
		json.WriteValue("name", ZST_Utils.GetPlayerName(playerId));
		api.Send("player_join", json);
	}

	//------------------------------------------------------------------------------------------------
	protected void ZST_OnPlayerDisconnected(int playerId, KickCauseCode cause, int timeout)
	{
		ZST_Api api = ZST_Api.GetInstance();
		JsonSaveContext json = api.Begin("player_leave");
		if (!json)
			return;

		json.WriteValue("playerId", playerId);
		json.WriteValue("uid", ZST_Utils.GetPlayerUid(playerId));
		json.WriteValue("name", ZST_Utils.GetPlayerName(playerId));
		api.Send("player_leave", json);
	}

	//------------------------------------------------------------------------------------------------
	//! Спавн игрока: фиксируем, за какую сторону он вышел в бой.
	protected void ZST_OnPlayerSpawned(int playerId, IEntity controlledEntity)
	{
		ZST_Api api = ZST_Api.GetInstance();
		JsonSaveContext json = api.Begin("player_spawn");
		if (!json)
			return;

		json.WriteValue("playerId", playerId);
		json.WriteValue("uid", ZST_Utils.GetPlayerUid(playerId));
		json.WriteValue("name", ZST_Utils.GetPlayerName(playerId));
		json.WriteValue("faction", ZST_Utils.GetPlayerFactionKey(playerId));
		api.Send("player_spawn", json);
	}

	//------------------------------------------------------------------------------------------------
	//! Гибель любого управляемого персонажа: игрока или ИИ.
	protected void ZST_OnControllableDestroyed(notnull SCR_InstigatorContextData ctx)
	{
		int victimId = ctx.GetVictimPlayerID();
		int killerId = ctx.GetKillerPlayerID();

		// ИИ, убитый ИИ, статистике не нужен.
		if (victimId <= 0 && killerId <= 0)
			return;

		IEntity victim = ctx.GetVictimEntity();
		IEntity killer = ctx.GetKillerEntity();

		ZST_Api api = ZST_Api.GetInstance();
		JsonSaveContext json = api.Begin("kill");
		if (!json)
			return;

		json.WriteValue("relation", typename.EnumToString(SCR_ECharacterDeathStatusRelations, ctx.GetVictimKillerRelation()));
		json.WriteValue("teamKill", ctx.DoesPlayerKillCountAsTeamKill());

		json.WriteValue("victimId", victimId);
		json.WriteValue("victimUid", ZST_Utils.GetPlayerUid(victimId));
		json.WriteValue("victimName", ZST_Utils.GetPlayerName(victimId));
		json.WriteValue("victimType", typename.EnumToString(SCR_ECharacterControlType, ctx.GetVictimCharacterControlType()));
		json.WriteValue("victimFaction", ZST_Utils.GetEntityFactionKey(victim));

		json.WriteValue("killerId", killerId);
		json.WriteValue("killerUid", ZST_Utils.GetPlayerUid(killerId));
		json.WriteValue("killerName", ZST_Utils.GetPlayerName(killerId));
		json.WriteValue("killerType", typename.EnumToString(SCR_ECharacterControlType, ctx.GetKillerCharacterControlType()));
		json.WriteValue("killerFaction", ZST_Utils.GetEntityFactionKey(killer));

		string weaponSource, damageType, hitZone;
		string weapon = ZST_Utils.ResolveWeapon(victim, killer, weaponSource, damageType, hitZone);
		json.WriteValue("weapon", weapon);
		json.WriteValue("weaponSource", weaponSource);
		json.WriteValue("damageType", damageType);
		json.WriteValue("hitZone", hitZone);
		json.WriteValue("distance", ZST_Utils.GetDistance(victim, killer));

		if (victim)
			json.WriteValue("pos", victim.GetOrigin());

		api.Send("kill", json);
	}
}
