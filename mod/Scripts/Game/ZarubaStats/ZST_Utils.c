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
	//! Префаб техники, в которой сидит персонаж. Пусто, если он пеший.
	static string GetVehicle(IEntity entity)
	{
		ChimeraCharacter character = ChimeraCharacter.Cast(entity);
		if (!character || !character.IsInVehicle())
			return string.Empty;

		CompartmentAccessComponent access = character.GetCompartmentAccessComponent();
		if (!access)
			return string.Empty;

		IEntity vehicle = access.GetVehicle();
		if (!vehicle || !vehicle.GetPrefabData())
			return string.Empty;

		return vehicle.GetPrefabData().GetPrefabName();
	}

	//------------------------------------------------------------------------------------------------
	//! Чем убили. Возвращает префаб и заполняет способ (source):
	//! hands — оружие в руках, explosive — граната/мина/ракета, vehicle — техника.
	static string ResolveWeapon(IEntity victim, IEntity killer, out string source, out string damageType, out string hitZone)
	{
		source = string.Empty;
		damageType = string.Empty;
		hitZone = string.Empty;

		EDamageType type = -1;
		string damageSource;

		SCR_CharacterDamageManagerComponent dm;
		if (victim)
			dm = SCR_CharacterDamageManagerComponent.Cast(victim.FindComponent(SCR_CharacterDamageManagerComponent));

		if (dm)
		{
			type = dm.ZST_GetLastType();
			damageSource = dm.ZST_GetLastSource();
			hitZone = dm.ZST_GetLastZone();
			if (type >= 0)
				damageType = typename.EnumToString(EDamageType, type);
		}

		// Взрыв и осколки: источник урона — сам боеприпас.
		if ((type == EDamageType.EXPLOSIVE || type == EDamageType.FRAGMENTATION || type == EDamageType.INCENDIARY) && !damageSource.IsEmpty())
		{
			source = "explosive";
			return damageSource;
		}

		// Наезд: источник урона — машина.
		if (type == EDamageType.COLLISION && !damageSource.IsEmpty())
		{
			source = "vehicle";
			return damageSource;
		}

		// Стрелок в технике: убила техника (турель, пулемёт на крыше).
		string vehicle = GetVehicle(killer);
		if (!vehicle.IsEmpty())
		{
			source = "vehicle";
			return vehicle;
		}

		// Пуля: снаряд в источнике бесполезен, берём оружие из рук.
		string inHands = GetCurrentWeapon(killer);
		if (!inHands.IsEmpty())
		{
			source = "hands";
			return inHands;
		}

		if (!damageSource.IsEmpty())
		{
			source = "damage";
			return damageSource;
		}

		return string.Empty;
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
