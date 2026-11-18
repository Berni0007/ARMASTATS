//! Точки захвата (базы Conflict): события захвата и снимок владельцев в конце матча.
modded class SCR_CampaignMilitaryBaseComponent
{
	// Все базы на карте. Слабые ссылки: удалённая база превращается в null.
	protected static ref array<SCR_CampaignMilitaryBaseComponent> s_aZST_Bases = {};

	//------------------------------------------------------------------------------------------------
	override void OnPostInit(IEntity owner)
	{
		super.OnPostInit(owner);
		s_aZST_Bases.Insert(this);
	}

	//------------------------------------------------------------------------------------------------
	protected override void OnFactionChanged(FactionAffiliationComponent owner, Faction previousFaction, Faction faction)
	{
		super.OnFactionChanged(owner, previousFaction, faction);

		// Только сервер и только настоящий захват: начальная раздача баз при старте — не захват.
		if (!Replication.IsServer() || !previousFaction || !faction || previousFaction == faction)
			return;

		SCR_BaseGameMode gameMode = SCR_BaseGameMode.Cast(GetGame().GetGameMode());
		if (!gameMode || gameMode.GetElapsedTime() < 10)
			return;

		ZST_Api api = ZST_Api.GetInstance();
		JsonSaveContext json = api.Begin("capture");
		if (!json)
			return;

		json.WriteValue("point", ZST_GetPointName());
		json.WriteValue("from", previousFaction.GetFactionKey());
		json.WriteValue("to", faction.GetFactionKey());
		json.WriteValue("control", IsControlPoint());
		api.Send("capture", json);
	}

	//------------------------------------------------------------------------------------------------
	string ZST_GetPointName()
	{
		string name = GetBaseName();
		if (name.IsEmpty())
			name = WidgetManager.Translate(GetCallsignDisplayName());

		if (name.IsEmpty())
			name = "?";

		return name;
	}

	//------------------------------------------------------------------------------------------------
	//! Пишет в событие владельцев всех точек: points { имя: ключ фракции }, controlPoints [имена].
	static void ZST_WriteSnapshot(JsonSaveContext json)
	{
		array<string> controlPoints = {};
		map<string, int> seen = new map<string, int>();

		json.StartObject("points");
		foreach (SCR_CampaignMilitaryBaseComponent base : s_aZST_Bases)
		{
			if (!base)
				continue;

			// Одинаковые имена различаем номером.
			string name = base.ZST_GetPointName();
			int n = seen.Get(name) + 1;
			seen.Set(name, n);
			if (n > 1)
				name = name + " " + n;

			string owner;
			Faction f = base.GetFaction();
			if (f)
				owner = f.GetFactionKey();

			json.WriteValue(name, owner);
			if (base.IsControlPoint())
				controlPoints.Insert(name);
		}
		json.EndObject();

		json.WriteValue("controlPoints", controlPoints);
	}
}
