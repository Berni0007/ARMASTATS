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
	//! Игровое название предмета или техники — то же, что видит игрок в инвентаре/редакторе.
	//! Работает и для модового оружия. Пусто, если у предмета нет названия.
	static string GetDisplayName(IEntity entity)
	{
		if (!entity)
			return string.Empty;

		string name;

		InventoryItemComponent item = InventoryItemComponent.Cast(entity.FindComponent(InventoryItemComponent));
		if (item)
		{
			ItemAttributeCollection attributes = item.GetAttributes();
			if (attributes)
			{
				UIInfo info = attributes.GetUIInfo();
				if (info)
					name = info.GetName();
			}
		}

		if (name.IsEmpty())
		{
			BaseWeaponComponent weapon = BaseWeaponComponent.Cast(entity.FindComponent(BaseWeaponComponent));
			if (weapon)
			{
				UIInfo info = weapon.GetUIInfo();
				if (info)
					name = info.GetName();
			}
		}

		if (name.IsEmpty())
		{
			SCR_EditableEntityComponent editable = SCR_EditableEntityComponent.Cast(entity.FindComponent(SCR_EditableEntityComponent));
			if (editable)
			{
				SCR_UIInfo info = editable.GetInfo();
				if (info)
					name = info.GetName();
			}
		}

		if (name.IsEmpty())
			return string.Empty;

		// Ключ локализации (#AR-...) переводим; если перевода нет — отдаём как есть, хост разберётся.
		string translated = WidgetManager.Translate(name);
		if (!translated.IsEmpty())
			name = translated;

		return name;
	}

	//------------------------------------------------------------------------------------------------
	//! Название сервера из его настроек (server config → name). Пусто в Workbench и локальной игре.
	static string GetServerName()
	{
		BackendApi backend = GetGame().GetBackendApi();
		if (!backend)
			return string.Empty;

		DSSession session = backend.GetDSSession();
		if (!session)
			return string.Empty;

		return session.Name();
	}

	//------------------------------------------------------------------------------------------------
	//! Отряд игрока: своё название отряда, иначе позывной (например «Альфа 1-1»). Пусто — не в отряде.
	static string GetPlayerSquad(int playerId)
	{
		SCR_GroupsManagerComponent groups = SCR_GroupsManagerComponent.GetInstance();
		if (!groups)
			return string.Empty;

		SCR_AIGroup group = groups.GetPlayerGroup(playerId);
		if (!group)
			return string.Empty;

		string name = group.GetCustomName();
		if (!name.IsEmpty())
			return name;

		SCR_CallsignGroupComponent callsign = SCR_CallsignGroupComponent.Cast(group.FindComponent(SCR_CallsignGroupComponent));
		if (callsign)
		{
			string company, platoon, squad, character, format;
			callsign.GetCallsignNames(company, platoon, squad, character, format);
			name = WidgetManager.Translate(format, WidgetManager.Translate(company), WidgetManager.Translate(platoon), WidgetManager.Translate(squad), "");
			name = name.Trim();
		}

		if (name.IsEmpty())
			name = "Отряд " + group.GetGroupID();

		return name;
	}

	//------------------------------------------------------------------------------------------------
	//! Роль игрока = название выбранного набора снаряжения (лоадаута). Пусто, если не определить.
	static string GetPlayerRole(int playerId)
	{
		PlayerController pc = GetGame().GetPlayerManager().GetPlayerController(playerId);
		if (!pc)
			return string.Empty;

		SCR_PlayerLoadoutComponent loadoutComp = SCR_PlayerLoadoutComponent.Cast(pc.FindComponent(SCR_PlayerLoadoutComponent));
		if (!loadoutComp)
			return string.Empty;

		SCR_BasePlayerLoadout loadout = loadoutComp.GetLoadout();
		if (!loadout)
			return string.Empty;

		string name = loadout.GetLoadoutName();
		if (name.IsEmpty())
			return string.Empty;

		string translated = WidgetManager.Translate(name);
		if (!translated.IsEmpty())
			name = translated;

		return name;
	}

	//------------------------------------------------------------------------------------------------
	//! Префаб текущего оружия в руках. Пусто, если оружия нет.
	static IEntity GetCurrentWeaponEntity(IEntity entity)
	{
		if (!entity)
			return null;

		BaseWeaponManagerComponent wm = BaseWeaponManagerComponent.Cast(entity.FindComponent(BaseWeaponManagerComponent));
		if (!wm)
			return null;

		BaseWeaponComponent weapon = wm.GetCurrentWeapon();
		if (!weapon)
			return null;

		return weapon.GetOwner();
	}

	//------------------------------------------------------------------------------------------------
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
	static IEntity GetVehicleEntity(IEntity entity)
	{
		ChimeraCharacter character = ChimeraCharacter.Cast(entity);
		if (!character || !character.IsInVehicle())
			return null;

		CompartmentAccessComponent access = character.GetCompartmentAccessComponent();
		if (!access)
			return null;

		BaseCompartmentSlot slot = access.GetCompartment();
		if (!slot)
			return null;

		IEntity vehicle = slot.GetOwner();
		if (vehicle)
			vehicle = vehicle.GetRootParent();

		return vehicle;
	}

	//------------------------------------------------------------------------------------------------
	static string GetVehicle(IEntity entity)
	{
		ChimeraCharacter character = ChimeraCharacter.Cast(entity);
		if (!character || !character.IsInVehicle())
			return string.Empty;

		CompartmentAccessComponent access = character.GetCompartmentAccessComponent();
		if (!access)
			return string.Empty;

		// Место в технике → его владелец → корневая сущность (сама машина, а не башня или турель).
		BaseCompartmentSlot slot = access.GetCompartment();
		if (!slot)
			return string.Empty;

		IEntity vehicle = slot.GetOwner();
		if (vehicle)
			vehicle = vehicle.GetRootParent();

		if (!vehicle || !vehicle.GetPrefabData())
			return string.Empty;

		return vehicle.GetPrefabData().GetPrefabName();
	}

	//------------------------------------------------------------------------------------------------
	//! Чем убили. Возвращает префаб и заполняет способ (source):
	//! hands — оружие в руках, explosive — граната/мина/ракета, vehicle — техника.
	static string ResolveWeapon(IEntity victim, IEntity killer, out string source, out string damageType, out string hitZone, out string weaponName)
	{
		source = string.Empty;
		weaponName = string.Empty;
		damageType = string.Empty;
		hitZone = string.Empty;

		EDamageType type = -1;
		string damageSource;
		string damageSourceName;

		SCR_CharacterDamageManagerComponent dm;
		if (victim)
			dm = SCR_CharacterDamageManagerComponent.Cast(victim.FindComponent(SCR_CharacterDamageManagerComponent));

		if (dm)
		{
			type = dm.ZST_GetLastType();
			damageSource = dm.ZST_GetLastSource();
			damageSourceName = dm.ZST_GetLastSourceName();
			hitZone = dm.ZST_GetLastZone();
			if (type >= 0)
				damageType = typename.EnumToString(EDamageType, type);
		}

		// Взрыв и осколки: источник урона — сам боеприпас.
		if ((type == EDamageType.EXPLOSIVE || type == EDamageType.FRAGMENTATION || type == EDamageType.INCENDIARY) && !damageSource.IsEmpty())
		{
			source = "explosive";
			weaponName = damageSourceName;
			return damageSource;
		}

		// Наезд: источник урона — машина.
		if (type == EDamageType.COLLISION && !damageSource.IsEmpty())
		{
			source = "vehicle";
			weaponName = damageSourceName;
			return damageSource;
		}

		// Стрелок в технике: убила техника (турель, пулемёт на крыше).
		string vehicle = GetVehicle(killer);
		if (!vehicle.IsEmpty())
		{
			source = "vehicle";
			weaponName = GetDisplayName(GetVehicleEntity(killer));
			return vehicle;
		}

		// Пуля: снаряд в источнике бесполезен, берём оружие из рук.
		string inHands = GetCurrentWeapon(killer);
		if (!inHands.IsEmpty())
		{
			source = "hands";
			weaponName = GetDisplayName(GetCurrentWeaponEntity(killer));
			return inHands;
		}

		if (!damageSource.IsEmpty())
		{
			source = "damage";
			weaponName = damageSourceName;
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
