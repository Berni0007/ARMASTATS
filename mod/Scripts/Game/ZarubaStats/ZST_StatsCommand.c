//! Ответ хоста на запрос статистики из чата.
class ZST_QueryCallback : RestCallback
{
	protected ZST_StatsCommand m_Command;

	//------------------------------------------------------------------------------------------------
	void ZST_QueryCallback(ZST_StatsCommand command)
	{
		m_Command = command;
		SetOnSuccess(HandleSuccess);
		SetOnError(HandleError);
	}

	//------------------------------------------------------------------------------------------------
	protected void HandleSuccess(RestCallback cb)
	{
		// Хост отвечает JSON: {"ok":true,"text":"..."}
		string text;
		JsonLoadContext json = new JsonLoadContext();
		if (json.ImportFromString(cb.GetData()))
			json.ReadValue("text", text);

		if (text.IsEmpty())
			text = "Статистика сейчас недоступна.";

		m_Command.ZST_Finish(text, true);
	}

	//------------------------------------------------------------------------------------------------
	protected void HandleError(RestCallback cb)
	{
		m_Command.ZST_Finish("Сервер статистики не ответил, попробуй позже.", false);
	}
}

//! Чат-команда #stats: своя статистика. #stats ник: статистика другого игрока.
//! Ответ приходит от хоста статистики, поэтому команда ждёт его в состоянии PENDING.
class ZST_StatsCommand : ScrServerCommand
{
	protected static const float TIMEOUT_SEC = 15;

	protected ref ZST_QueryCallback m_Callback;
	protected ref ScrServerCmdResult m_Result;
	protected bool m_bBusy;
	protected float m_fStartedAt;

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
		if (m_bBusy)
			return new ScrServerCmdResult("Подожди секунду и повтори #stats.", EServerCmdResultType.ERR);

		ZST_Api api = ZST_Api.GetInstance();
		ZST_Config cfg = api.GetConfig();
		if (!cfg.IsReady())
			return new ScrServerCmdResult("Статистика на этом сервере не настроена.", EServerCmdResultType.ERR);

		// Аргументы: всё, кроме самой команды, — это ник.
		string nick;
		foreach (int i, string arg : argv)
		{
			if (i == 0 && arg.Contains("stats"))
				continue;

			if (!nick.IsEmpty())
				nick += " ";
			nick += arg;
		}
		nick.Trim();

		JsonSaveContext json = new JsonSaveContext();
		json.WriteValue("token", cfg.m_sToken);
		json.WriteValue("serverId", cfg.m_sServerId);
		json.WriteValue("kind", "player");
		if (nick.IsEmpty())
		{
			json.WriteValue("uid", ZST_Utils.GetPlayerUid(playerId));
			json.WriteValue("name", ZST_Utils.GetPlayerName(playerId));
		}
		else
		{
			json.WriteValue("name", nick);
		}

		RestContext ctx = GetGame().GetRestApi().GetContext(cfg.m_sApiUrl);
		if (!ctx)
			return new ScrServerCmdResult("Сервер статистики недоступен.", EServerCmdResultType.ERR);

		ctx.SetHeaders("Content-Type,application/json");
		m_Callback = new ZST_QueryCallback(this);
		m_Result = new ScrServerCmdResult(string.Empty, EServerCmdResultType.PENDING);
		m_bBusy = true;
		m_fStartedAt = GetGame().GetWorld().GetWorldTime() / 1000;
		ctx.POST(m_Callback, "/api/query", json.SaveToString());

		return m_Result;
	}

	//------------------------------------------------------------------------------------------------
	override ref ScrServerCmdResult OnUpdate()
	{
		if (m_bBusy && GetGame().GetWorld().GetWorldTime() / 1000 - m_fStartedAt > TIMEOUT_SEC)
			ZST_Finish("Сервер статистики не ответил, попробуй позже.", false);

		return m_Result;
	}

	//------------------------------------------------------------------------------------------------
	void ZST_Finish(string text, bool ok)
	{
		m_bBusy = false;
		EServerCmdResultType type = EServerCmdResultType.ERR;
		if (ok)
			type = EServerCmdResultType.OK;

		m_Result = new ScrServerCmdResult(text, type);
	}
}
