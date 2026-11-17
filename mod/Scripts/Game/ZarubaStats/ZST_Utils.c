//! Вспомогательные функции: данные игрока, фракция, оружие.
class ZST_Utils
{
	//------------------------------------------------------------------------------------------------
	//! Постоянный ID игровой личности. Пусто, если игрок не найден (например, ИИ).
	static string GetPlayerUid(int playerId)
	{
		if (playerId <= 0)
			return string.Empty;

		BackendApi backend = GetGame().GetBackendApi();
		if (!backend)
			return string.Empty;

		return backend.GetPlayerIdentityId(playerId);
	}

	//------------------------------------------------------------------------------------------------
	static string GetPlayerName(int playerId)
	{
		if (playerId <= 0)
			return string.Empty;

		return GetGame().GetPlayerManager().GetPlayerName(playerId);
	}

	//------------------------------------------------------------------------------------------------
	//! Ключ фракции игрока (например, US, USSR). Пусто, если фракции нет.
	static string GetPlayerFactionKey(int playerId)
	{
		if (playerId <= 0)
			return string.Empty;

		Faction faction = SCR_FactionManager.SGetPlayerFaction(playerId);
		if (!faction)
			return string.Empty;

		return faction.GetFactionKey();
	}

	//------------------------------------------------------------------------------------------------
	//! Ключ фракции сущности (для ИИ).
	static string GetEntityFactionKey(IEntity entity)
	{
		if (!entity)
			return string.Empty;

		FactionAffiliationComponent fac = FactionAffiliationComponent.Cast(entity.FindComponent(FactionAffiliationComponent));
		if (!fac)
			return string.Empty;

		Faction faction = fac.GetAffiliatedFaction();
		if (!faction)
			return string.Empty;

		return faction.GetFactionKey();
	}

	//------------------------------------------------------------------------------------------------
	//! Префаб оружия в руках у сущности. Пусто, если оружия нет.
	static string GetCurrentWeapon(IEntity entity)
	{
		if (!entity)
			return string.Empty;

		BaseWeaponManagerComponent wm = BaseWeaponManagerComponent.Cast(entity.FindComponent(BaseWeaponManagerComponent));
		if (!wm)
			return string.Empty;

		BaseWeaponComponent weapon = wm.GetCurrentWeapon();
		if (!weapon)
			return string.Empty;

		IEntity weaponEntity = weapon.GetOwner();
		if (!weaponEntity)
			return string.Empty;

		EntityPrefabData prefab = weaponEntity.GetPrefabData();
		if (!prefab)
			return string.Empty;

		return prefab.GetPrefabName();
	}

	//------------------------------------------------------------------------------------------------
	//! Дистанция между сущностями в метрах. -1, если какой-то нет.
	static float GetDistance(IEntity a, IEntity b)
	{
		if (!a || !b)
			return -1;

		return vector.Distance(a.GetOrigin(), b.GetOrigin());
	}
}
