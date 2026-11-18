//! Запрос к хосту статистики из чат-команды: отправка и ожидание ответа.
//! Хост отвечает готовой строкой для чата (text/plain).
class ZST_HostQuery
{
	protected static const float TIMEOUT_SEC = 15;

	protected ref RestCallback m_Callback;
	protected ref ScrServerCmdResult m_Result;
	protected bool m_bBusy;
	protected float m_fStartedAt;

	//------------------------------------------------------------------------------------------------
	//! Отправляет запрос kind с данными игрока. Возвращает результат PENDING или ошибку.
	ScrServerCmdResult Start(string kind, int playerId, string nick)
	{
		if (m_bBusy)
			return new ScrServerCmdResult("Подожди секунду и повтори команду.", EServerCmdResultType.ERR);

		ZST_Config cfg = ZST_Api.GetInstance().GetConfig();
		if (!cfg.IsReady())
			return new ScrServerCmdResult("Статистика на этом сервере не настроена.", EServerCmdResultType.ERR);

		JsonSaveContext json = new JsonSaveContext();
		json.WriteValue("token", cfg.m_sToken);
		json.WriteValue("serverId", cfg.m_sServerId);
		json.WriteValue("kind", kind);
		json.WriteValue("uid", ZST_Utils.GetPlayerUid(playerId));
		json.WriteValue("name", ZST_Utils.GetPlayerName(playerId));
		json.WriteValue("nick", nick);

		RestContext ctx = GetGame().GetRestApi().GetContext(cfg.m_sApiUrl);
		if (!ctx)
			return new ScrServerCmdResult("Сервер статистики недоступен.", EServerCmdResultType.ERR);

		ctx.SetHeaders("Content-Type,application/json");

		m_Callback = new RestCallback();
		m_Callback.SetOnSuccess(HandleSuccess);
		m_Callback.SetOnError(HandleError);

		m_Result = new ScrServerCmdResult(string.Empty, EServerCmdResultType.PENDING);
		m_bBusy = true;
		m_fStartedAt = GetGame().GetWorld().GetWorldTime() / 1000;
		ctx.POST(m_Callback, "/api/query", json.SaveToString());
		return m_Result;
	}

	//------------------------------------------------------------------------------------------------
	ScrServerCmdResult Update()
	{
		if (m_bBusy && GetGame().GetWorld().GetWorldTime() / 1000 - m_fStartedAt > TIMEOUT_SEC)
			Finish("Сервер статистики не ответил, попробуй позже.", false);

		return m_Result;
	}

	//------------------------------------------------------------------------------------------------
	protected void HandleSuccess(RestCallback cb)
	{
		string text = cb.GetData();
		text.Trim();
		if (text.IsEmpty())
			text = "Статистика сейчас недоступна.";

		Finish(text, true);
	}

	//------------------------------------------------------------------------------------------------
	protected void HandleError(RestCallback cb)
	{
		Finish("Сервер статистики не ответил, попробуй позже.", false);
	}

	//------------------------------------------------------------------------------------------------
	protected void Finish(string text, bool ok)
	{
		m_bBusy = false;
		EServerCmdResultType type = EServerCmdResultType.ERR;
		if (ok)
			type = EServerCmdResultType.OK;

		m_Result = new ScrServerCmdResult(text, type);
	}

	//------------------------------------------------------------------------------------------------
	//! Склеивает аргументы команды в ник, пропуская саму команду, если движок её передал.
	static string JoinArgs(array<string> argv, string keyword)
	{
		string nick;
		foreach (int i, string arg : argv)
		{
			if (i == 0 && arg.Contains(keyword))
				continue;

			if (!nick.IsEmpty())
				nick += " ";
			nick += arg;
		}

		nick.Trim();
		return nick;
	}
}

//! Чат-команда #stats: своя статистика. #stats ник: статистика другого игрока.
class ZST_StatsCommand : ScrServerCommand
{
	protected ref ZST_HostQuery m_Query = new ZST_HostQuery();

	//------------------------------------------------------------------------------------------------
	override string GetKeyword()
	{
		return "stats";
	}

	//------------------------------------------------------------------------------------------------
	override bool IsServerSide()
	{
		return true;
	}

	//------------------------------------------------------------------------------------------------
	override int RequiredChatPermission()
	{
		return EPlayerRole.NONE;
	}

	//------------------------------------------------------------------------------------------------
	override int RequiredRCONPermission()
	{
		return 0;
	}

	//------------------------------------------------------------------------------------------------
	override ref ScrServerCmdResult OnChatClientExecution(array<string> argv, int playerId)
	{
		return new ScrServerCmdResult(string.Empty, EServerCmdResultType.OK);
	}

	//------------------------------------------------------------------------------------------------
	override ref ScrServerCmdResult OnRCONExecution(array<string> argv)
	{
		return new ScrServerCmdResult("Use #stats in game chat.", EServerCmdResultType.ERR);
	}

	//------------------------------------------------------------------------------------------------
	override ref ScrServerCmdResult OnChatServerExecution(array<string> argv, int playerId)
	{
		return m_Query.Start("player", playerId, ZST_HostQuery.JoinArgs(argv, GetKeyword()));
	}

	//------------------------------------------------------------------------------------------------
	override ref ScrServerCmdResult OnUpdate()
	{
		return m_Query.Update();
	}
}

//! Чат-команда #link: код для привязки Discord-аккаунта (/link код в Discord).
class ZST_LinkCommand : ScrServerCommand
{
	protected ref ZST_HostQuery m_Query = new ZST_HostQuery();

	//------------------------------------------------------------------------------------------------
	override string GetKeyword()
	{
		return "link";
	}

	//------------------------------------------------------------------------------------------------
	override bool IsServerSide()
	{
		return true;
	}

	//------------------------------------------------------------------------------------------------
	override int RequiredChatPermission()
	{
		return EPlayerRole.NONE;
	}

	//------------------------------------------------------------------------------------------------
	override int RequiredRCONPermission()
	{
		return 0;
	}

	//------------------------------------------------------------------------------------------------
	override ref ScrServerCmdResult OnChatClientExecution(array<string> argv, int playerId)
	{
		return new ScrServerCmdResult(string.Empty, EServerCmdResultType.OK);
	}

	//------------------------------------------------------------------------------------------------
	override ref ScrServerCmdResult OnRCONExecution(array<string> argv)
	{
		return new ScrServerCmdResult("Use #link in game chat.", EServerCmdResultType.ERR);
	}

	//------------------------------------------------------------------------------------------------
	override ref ScrServerCmdResult OnChatServerExecution(array<string> argv, int playerId)
	{
		return m_Query.Start("link", playerId, string.Empty);
	}

	//------------------------------------------------------------------------------------------------
	override ref ScrServerCmdResult OnUpdate()
	{
		return m_Query.Update();
	}
}
