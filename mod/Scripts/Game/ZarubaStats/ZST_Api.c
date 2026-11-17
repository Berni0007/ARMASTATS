//! Ответ хоста на отправленное событие (API 1.9: SetOnSuccess / SetOnError).
class ZST_RestCallback : RestCallback
{
	protected string m_sType;

	//------------------------------------------------------------------------------------------------
	void ZST_RestCallback(string type)
	{
		m_sType = type;
		SetOnSuccess(HandleSuccess);
		SetOnError(HandleError);
	}

	//------------------------------------------------------------------------------------------------
	protected void HandleSuccess(RestCallback cb)
	{
		Print("[ZarubaStats] Sent: " + m_sType + ", HTTP " + cb.GetHttpCode());
	}

	//------------------------------------------------------------------------------------------------
	protected void HandleError(RestCallback cb)
	{
		if (cb.GetRestResult() == ERestResult.EREST_ERROR_TIMEOUT)
		{
			Print("[ZarubaStats] Send timeout: " + m_sType, LogLevel.ERROR);
			return;
		}

		Print("[ZarubaStats] Send failed: " + m_sType + ": result " + typename.EnumToString(ERestResult, cb.GetRestResult()) + ", HTTP " + cb.GetHttpCode() + ", body " + cb.GetData(), LogLevel.ERROR);
	}
}

//! Отправка событий на хост статистики.
//! Использование: ctx = Begin("kill"); ctx.WriteValue(...); Send("kill", ctx);
class ZST_Api
{
	protected static ref ZST_Api s_Instance;

	protected ref ZST_Config m_Config;
	protected string m_sMatchId;
	// Колбэки держим в памяти, пока запрос не завершится.
	protected ref array<ref ZST_RestCallback> m_aCallbacks = {};

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
		json.WriteValue("type", type);
		json.WriteValue("ts", System.GetUnixTime());
		json.WriteValue("matchId", m_sMatchId);
		json.StartObject("data");
		return json;
	}

	//------------------------------------------------------------------------------------------------
	//! Закрывает объект data и отправляет событие.
	void Send(string type, JsonSaveContext json)
	{
		if (!json)
			return;

		json.EndObject();
		Post(type, json.SaveToString());
	}

	//------------------------------------------------------------------------------------------------
	//! Событие без дополнительных данных.
	void SendEvent(string type)
	{
		Send(type, Begin(type));
	}

	//------------------------------------------------------------------------------------------------
	protected void Post(string type, string body)
	{
		RestContext ctx = GetGame().GetRestApi().GetContext(m_Config.m_sApiUrl);
		if (!ctx)
		{
			Print("[ZarubaStats] Failed to create RestContext for " + m_Config.m_sApiUrl, LogLevel.ERROR);
			return;
		}

		ctx.SetHeaders("Content-Type,application/json");

		// Простая защита от роста списка: старые колбэки уже отработали.
		if (m_aCallbacks.Count() > 64)
			m_aCallbacks.Clear();

		ZST_RestCallback cb = new ZST_RestCallback(type);
		m_aCallbacks.Insert(cb);
		ctx.POST(cb, "/api/events", body);
	}
}
