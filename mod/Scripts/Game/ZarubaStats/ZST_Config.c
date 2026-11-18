//! Настройки мода. Хранятся в $profile:ZarubaStats/config.json на сервере.
class ZST_Config
{
	static const string DIR = "$profile:ZarubaStats";
	static const string FILE = "$profile:ZarubaStats/config.json";

	string m_sApiUrl = "http://127.0.0.1:8787";
	string m_sToken = "CHANGE_ME";
	string m_sServerId = "server-1";
	bool m_bEnabled = true;
	// Название для отчётов. Пусто — берётся название сервера из его настроек.
	string m_sMapName = "";

	//------------------------------------------------------------------------------------------------
	//! Читает конфиг. Если файла нет, создаёт его со значениями по умолчанию.
	static ZST_Config Load()
	{
		ZST_Config cfg = new ZST_Config();

		if (!FileIO.FileExists(FILE))
		{
			cfg.Save();
			Print("[ZarubaStats] Default config created: " + FILE, LogLevel.WARNING);
			return cfg;
		}

		JsonLoadContext ctx = new JsonLoadContext();
		if (!ctx.LoadFromFile(FILE))
		{
			Print("[ZarubaStats] Failed to read " + FILE, LogLevel.ERROR);
			return cfg;
		}

		ctx.ReadValue("apiUrl", cfg.m_sApiUrl);
		ctx.ReadValue("token", cfg.m_sToken);
		ctx.ReadValue("serverId", cfg.m_sServerId);
		ctx.ReadValue("enabled", cfg.m_bEnabled);
		ctx.ReadValue("mapName", cfg.m_sMapName);
		return cfg;
	}

	//------------------------------------------------------------------------------------------------
	void Save()
	{
		FileIO.MakeDirectory(DIR);

		PrettyJsonSaveContext ctx = new PrettyJsonSaveContext();
		ctx.WriteValue("apiUrl", m_sApiUrl);
		ctx.WriteValue("token", m_sToken);
		ctx.WriteValue("serverId", m_sServerId);
		ctx.WriteValue("enabled", m_bEnabled);
		ctx.WriteValue("mapName", m_sMapName);
		ctx.SaveToFile(FILE);
	}

	//------------------------------------------------------------------------------------------------
	bool IsReady()
	{
		return GetProblem().IsEmpty();
	}

	//------------------------------------------------------------------------------------------------
	//! Что не так с конфигом. Пустая строка, если всё в порядке. Значение токена не раскрывается.
	string GetProblem()
	{
		if (!m_bEnabled)
			return "enabled = false";

		if (m_sApiUrl.IsEmpty())
			return "apiUrl is empty";

		if (m_sToken.IsEmpty() || m_sToken == "CHANGE_ME")
			return "token is not set";

		return string.Empty;
	}
}
