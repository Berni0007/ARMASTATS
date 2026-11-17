//! Настройки мода. Хранятся в $profile:ZarubaStats/config.json на сервере.
class ZST_Config
{
	static const string DIR = "$profile:ZarubaStats";
	static const string FILE = "$profile:ZarubaStats/config.json";

	string m_sApiUrl = "http://127.0.0.1:8787";
	string m_sToken = "CHANGE_ME";
	string m_sServerId = "server-1";
	bool m_bEnabled = true;

	//------------------------------------------------------------------------------------------------
	//! Читает конфиг. Если файла нет, создаёт его со значениями по умолчанию.
	static ZST_Config Load()
	{
		ZST_Config cfg = new ZST_Config();

		if (!FileIO.FileExists(FILE))
		{
			cfg.Save();
			Print("[ZarubaStats] Создан конфиг по умолчанию: " + FILE, LogLevel.WARNING);
			return cfg;
		}

		JsonLoadContext ctx = new JsonLoadContext();
		if (!ctx.LoadFromFile(FILE))
		{
			Print("[ZarubaStats] Не удалось прочитать " + FILE, LogLevel.ERROR);
			return cfg;
		}

		ctx.ReadValue("apiUrl", cfg.m_sApiUrl);
		ctx.ReadValue("token", cfg.m_sToken);
		ctx.ReadValue("serverId", cfg.m_sServerId);
		ctx.ReadValue("enabled", cfg.m_bEnabled);
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
			return "пустой apiUrl";

		if (m_sToken.IsEmpty() || m_sToken == "CHANGE_ME")
			return "не задан token";

		return string.Empty;
	}
}
