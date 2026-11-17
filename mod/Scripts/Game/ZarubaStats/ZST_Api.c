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
		Print("[ZarubaStats] Отправлено: " + m_sType + ", HTTP " + cb.GetHttpCode() + " -> " + cb.GetData());
	}

	//------------------------------------------------------------------------------------------------
	protected void HandleError(RestCallback cb)
	{
		if (cb.GetRestResult() == ERestResult.EREST_ERROR_TIMEOUT)
		{
			Print("[ZarubaStats] Таймаут отправки " + m_sType, LogLevel.ERROR);
			return;
		}

		Print("[ZarubaStats] Ошибка отправки " + m_sType + ": результат " + typename.EnumToString(ERestResult, cb.GetRestResult()) + ", HTTP " + cb.GetHttpCode() + ", ответ " + cb.GetData(), LogLevel.ERROR);
	}
}

//! Отправка событий на хост статистики.
class ZST_Api
{
	protected static ref ZST_Api s_Instance;

	protected ref ZST_Config m_Config;
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
	ZST_Config GetConfig()
	{
		return m_Config;
	}

	//------------------------------------------------------------------------------------------------
	//! Шлёт событие без дополнительных данных.
	void SendEvent(string type)
	{
		if (!m_Config.IsReady())
		{
			Print("[ZarubaStats] Мод не настроен: проверь " + ZST_Config.FILE, LogLevel.WARNING);
			return;
		}

		JsonSaveContext json = new JsonSaveContext();
		json.WriteValue("token", m_Config.m_sToken);
		json.WriteValue("serverId", m_Config.m_sServerId);
		json.WriteValue("type", type);
		json.WriteValue("ts", System.GetUnixTime());

		Post(type, json.SaveToString());
	}

	//------------------------------------------------------------------------------------------------
	protected void Post(string type, string body)
	{
		RestContext ctx = GetGame().GetRestApi().GetContext(m_Config.m_sApiUrl);
		if (!ctx)
		{
			Print("[ZarubaStats] Не удалось создать RestContext для " + m_Config.m_sApiUrl, LogLevel.ERROR);
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
