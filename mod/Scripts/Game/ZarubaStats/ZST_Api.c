//! Ответ хоста на отправленное событие (API 1.9: SetOnSuccess / SetOnError).
class ZST_RestCallback : RestCallback
{
	protected string m_sType;
	protected string m_sEventId;

	//------------------------------------------------------------------------------------------------
	void ZST_RestCallback(string type, string eventId)
	{
		m_sType = type;
		m_sEventId = eventId;
		SetOnSuccess(HandleSuccess);
		SetOnError(HandleError);
	}

	//------------------------------------------------------------------------------------------------
	protected void HandleSuccess(RestCallback cb)
	{
		Print("[ZarubaStats] Sent: " + m_sType + ", HTTP " + cb.GetHttpCode());
		ZST_Api.GetInstance().OnDelivered(m_sEventId);
	}

	//------------------------------------------------------------------------------------------------
	protected void HandleError(RestCallback cb)
	{
		ZST_Api.GetInstance().OnFailed(m_sEventId);

		if (cb.GetRestResult() == ERestResult.EREST_ERROR_TIMEOUT)
		{
			Print("[ZarubaStats] Send timeout: " + m_sType + " (kept in outbox)", LogLevel.WARNING);
			return;
		}

		Print("[ZarubaStats] Send failed: " + m_sType + ": result " + typename.EnumToString(ERestResult, cb.GetRestResult()) + ", HTTP " + cb.GetHttpCode() + " (kept in outbox)", LogLevel.WARNING);
	}
}

//! Отправка событий на хост статистики.
//! Использование: ctx = Begin("kill"); ctx.WriteValue(...); Send("kill", ctx);
//! Каждое событие сначала пишется в буфер (ZST_Outbox) и удаляется оттуда после ответа хоста.
class ZST_Api
{
	protected static ref ZST_Api s_Instance;

	protected ref ZST_Config m_Config;
	protected string m_sMatchId;
	protected string m_sSession;
	protected int m_iSeq;
	protected string m_sLastEventId;
	protected bool m_bAutoFlush;

	// Колбэки держим в памяти, пока запрос не завершится.
	protected ref map<string, ref ZST_RestCallback> m_mInFlight = new map<string, ref ZST_RestCallback>();

	//------------------------------------------------------------------------------------------------
	static ZST_Api GetInstance()
	{
		if (!s_Instance)
			s_Instance = new ZST_Api();

		return s_Instance;
	}

	//------------------------------------------------------------------------------------------------
	void ZST_Api()
	{
		m_Config = ZST_Config.Load();
		// Уникальная метка запуска: ID событий не совпадут между перезапусками сервера.
		m_sSession = System.GetUnixTime().ToString();
	}

	//------------------------------------------------------------------------------------------------
	//! Перечитывает конфиг с диска. Вызывается при каждом старте игры.
	void ReloadConfig()
	{
		m_Config = ZST_Config.Load();
		Print("[ZarubaStats] Config: apiUrl=" + m_Config.m_sApiUrl + ", serverId=" + m_Config.m_sServerId + ", enabled=" + m_Config.m_bEnabled.ToString());
	}

	//------------------------------------------------------------------------------------------------
	ZST_Config GetConfig()
	{
		return m_Config;
	}

	//------------------------------------------------------------------------------------------------
	//! Новый матч: ID = serverId + время старта. Пишется в каждое событие.
	string StartMatch()
	{
		m_sMatchId = m_Config.m_sServerId + "-" + System.GetUnixTime();
		return m_sMatchId;
	}

	//------------------------------------------------------------------------------------------------
	string GetMatchId()
	{
		return m_sMatchId;
	}

	//------------------------------------------------------------------------------------------------
	protected string NextEventId()
	{
		m_iSeq++;
		return m_Config.m_sServerId + "-" + m_sSession + "-" + m_iSeq;
	}

	//------------------------------------------------------------------------------------------------
	//! Начинает событие: пишет заголовок и открывает объект data. Null, если мод не настроен.
	JsonSaveContext Begin(string type)
	{
		string problem = m_Config.GetProblem();
		if (!problem.IsEmpty())
		{
			Print("[ZarubaStats] Not configured (" + problem + "): check " + ZST_Config.FILE, LogLevel.WARNING);
			return null;
		}

		JsonSaveContext json = new JsonSaveContext();
		json.WriteValue("token", m_Config.m_sToken);
		json.WriteValue("serverId", m_Config.m_sServerId);
		m_sLastEventId = NextEventId();
		json.WriteValue("eventId", m_sLastEventId);
		json.WriteValue("type", type);
		json.WriteValue("ts", System.GetUnixTime());
		json.WriteValue("matchId", m_sMatchId);
		json.StartObject("data");
		return json;
	}

	//------------------------------------------------------------------------------------------------
	//! Закрывает объект data, кладёт событие в буфер и отправляет.
	void Send(string type, JsonSaveContext json)
	{
		if (!json)
			return;

		json.EndObject();
		string eventId = m_sLastEventId;
		string body = json.SaveToString();

		ZST_Outbox.Save(eventId, body);
		Post(type, eventId, body);
	}

	//------------------------------------------------------------------------------------------------
	//! Событие без дополнительных данных.
	void SendEvent(string type)
	{
		Send(type, Begin(type));
	}

	//------------------------------------------------------------------------------------------------
	//! Досылает всё, что осталось в буфере (после падения или недоступности хоста).
	void FlushOutbox()
	{
		if (!m_Config.IsReady())
			return;

		array<string> ids = ZST_Outbox.List();
		int resent;
		foreach (string eventId : ids)
		{
			if (m_mInFlight.Contains(eventId))
				continue;

			string body = ZST_Outbox.Read(eventId);
			if (body.IsEmpty())
			{
				ZST_Outbox.Remove(eventId);
				continue;
			}

			Post("resend", eventId, body);
			resent++;
		}

		if (resent > 0)
			Print("[ZarubaStats] Outbox: resending " + resent + " event(s)");
	}

	//------------------------------------------------------------------------------------------------
	//! Повторная отправка буфера раз в 2 минуты. Запускается один раз за жизнь сервера.
	void StartAutoFlush()
	{
		if (m_bAutoFlush)
			return;

		m_bAutoFlush = true;
		GetGame().GetCallqueue().CallLater(FlushOutbox, 120000, true);
	}

	//------------------------------------------------------------------------------------------------
	void OnDelivered(string eventId)
	{
		ZST_Outbox.Remove(eventId);
		m_mInFlight.Remove(eventId);
	}

	//------------------------------------------------------------------------------------------------
	void OnFailed(string eventId)
	{
		// Файл остаётся в буфере, его дошлёт FlushOutbox.
		m_mInFlight.Remove(eventId);
	}

	//------------------------------------------------------------------------------------------------
	protected void Post(string type, string eventId, string body)
	{
		RestContext ctx = GetGame().GetRestApi().GetContext(m_Config.m_sApiUrl);
		if (!ctx)
		{
			Print("[ZarubaStats] Failed to create RestContext for " + m_Config.m_sApiUrl, LogLevel.ERROR);
			return;
		}

		ctx.SetHeaders("Content-Type,application/json");

		ZST_RestCallback cb = new ZST_RestCallback(type, eventId);
		m_mInFlight.Set(eventId, cb);
		ctx.POST(cb, "/api/events", body);
	}
}
