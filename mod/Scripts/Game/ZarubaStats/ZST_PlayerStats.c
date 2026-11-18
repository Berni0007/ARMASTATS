//! Личные счётчики игроков за матч: помощь, попадания, выстрелы, захваты, возрождения, техника.
//! Копятся на сервере и уходят событием player_stats нарастающим итогом —
//! при выходе игрока и в конце матча. Хост хранит последнее (максимальное) значение.
class ZST_Counters
{
	int m_iAssists;
	int m_iHits;
	int m_iShots;
	int m_iCaptures;
	int m_iRevives;
	float m_fVehDamage;
	int m_iVehKills;
}

//------------------------------------------------------------------------------------------------
class ZST_PlayerStats
{
	// Помощь засчитывается, если игрок ранил жертву не раньше чем за 30 с до смерти.
	static const float ASSIST_WINDOW_MS = 30000;

	protected static ref ZST_PlayerStats s_Instance;

	protected ref map<int, ref ZST_Counters> m_mCounters = new map<int, ref ZST_Counters>();
	// UID запоминаем при входе: в момент выхода он может быть уже недоступен.
	protected ref map<int, string> m_mUids = new map<int, string>();

	//------------------------------------------------------------------------------------------------
	static ZST_PlayerStats GetInstance()
	{
		if (!s_Instance)
			s_Instance = new ZST_PlayerStats();

		return s_Instance;
	}

	//------------------------------------------------------------------------------------------------
	void Reset()
	{
		m_mCounters.Clear();
	}

	//------------------------------------------------------------------------------------------------
	void RememberUid(int playerId, string uid)
	{
		if (playerId > 0 && !uid.IsEmpty())
			m_mUids.Set(playerId, uid);
	}

	//------------------------------------------------------------------------------------------------
	//! Счётчики игрока. null для ИИ и пустого ID.
	ZST_Counters Get(int playerId)
	{
		if (playerId <= 0)
			return null;

		ZST_Counters c = m_mCounters.Get(playerId);
		if (!c)
		{
			c = new ZST_Counters();
			m_mCounters.Set(playerId, c);
		}

		return c;
	}

	//------------------------------------------------------------------------------------------------
	void Send(int playerId)
	{
		ZST_Counters c = m_mCounters.Get(playerId);
		if (!c)
			return;

		string uid = m_mUids.Get(playerId);
		if (uid.IsEmpty())
			uid = ZST_Utils.GetPlayerUid(playerId);

		if (uid.IsEmpty())
			return;

		ZST_Api api = ZST_Api.GetInstance();
		JsonSaveContext json = api.Begin("player_stats");
		if (!json)
			return;

		json.WriteValue("playerId", playerId);
		json.WriteValue("uid", uid);
		json.WriteValue("assists", c.m_iAssists);
		json.WriteValue("hits", c.m_iHits);
		json.WriteValue("shots", c.m_iShots);
		json.WriteValue("captures", c.m_iCaptures);
		json.WriteValue("revives", c.m_iRevives);
		json.WriteValue("vehDamage", c.m_fVehDamage);
		json.WriteValue("vehKills", c.m_iVehKills);
		// Отряд на момент отправки: игрок мог сменить его по ходу боя.
		json.WriteValue("squad", ZST_Utils.GetPlayerSquad(playerId));
		api.Send("player_stats", json);
	}

	//------------------------------------------------------------------------------------------------
	void SendAll()
	{
		foreach (int playerId, ZST_Counters c : m_mCounters)
		{
			Send(playerId);
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Обработчик выстрела, подписывается на событие персонажа "OnProjectileShot" при спавне.
	void OnProjectileShot(int playerID, BaseWeaponComponent weapon, IEntity entity)
	{
		ZST_Counters c = Get(playerID);
		if (c)
			c.m_iShots++;
	}

	//------------------------------------------------------------------------------------------------
	void WatchShots(IEntity character)
	{
		if (!character)
			return;

		EventHandlerManagerComponent events = EventHandlerManagerComponent.Cast(character.FindComponent(EventHandlerManagerComponent));
		if (events)
			events.RegisterScriptHandler("OnProjectileShot", this, OnProjectileShot);
	}
}
