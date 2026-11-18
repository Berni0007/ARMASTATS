//! Запоминаем последнее прямое попадание в персонажа: тип урона, зону и источник.
//! По этим данным в момент гибели определяется, чем именно убили.
modded class SCR_CharacterDamageManagerComponent
{
	protected EDamageType m_eZST_LastType = -1;
	protected string m_sZST_LastSource;
	protected string m_sZST_LastZone;
	protected string m_sZST_LastSourceName;
	// Кто ранил (ID игрока → время попадания, мс) — для помощи в убийстве.
	protected ref map<int, float> m_mZST_Damagers = new map<int, float>();
	// Возрождение засчитывается один раз за каждую потерю сознания.
	protected bool m_bZST_ReviveCounted;

	//------------------------------------------------------------------------------------------------
	protected override void OnDamage(notnull BaseDamageContext damageContext)
	{
		super.OnDamage(damageContext);

		EDamageType type = damageContext.damageType;
		if (Replication.IsServer())
			ZST_CountPersonal(damageContext, type);

		// Кровотечение, лечение и регенерация не затирают попадание, которое к ним привело.
		if (type == EDamageType.BLEEDING || type == EDamageType.HEALING || type == EDamageType.REGENERATION)
			return;

		m_eZST_LastType = type;

		m_sZST_LastSource = string.Empty;
		m_sZST_LastSourceName = string.Empty;
		IEntity source = damageContext.damageSource;
		if (source)
		{
			EntityPrefabData prefab = source.GetPrefabData();
			if (prefab)
				m_sZST_LastSource = prefab.GetPrefabName();
			m_sZST_LastSourceName = ZST_Utils.GetDisplayName(source);
		}

		m_sZST_LastZone = string.Empty;
		if (damageContext.struckHitZone)
			m_sZST_LastZone = damageContext.struckHitZone.GetName();
	}

	//------------------------------------------------------------------------------------------------
	EDamageType ZST_GetLastType()
	{
		return m_eZST_LastType;
	}

	//------------------------------------------------------------------------------------------------
	string ZST_GetLastSource()
	{
		return m_sZST_LastSource;
	}

	//------------------------------------------------------------------------------------------------
	string ZST_GetLastZone()
	{
		return m_sZST_LastZone;
	}

	//------------------------------------------------------------------------------------------------
	string ZST_GetLastSourceName()
	{
		return m_sZST_LastSourceName;
	}

	//------------------------------------------------------------------------------------------------
	//! Личные счётчики: попадания и помощь (урон по чужим), возрождения (лечение союзника без сознания).
	protected void ZST_CountPersonal(BaseDamageContext damageContext, EDamageType type)
	{
		IEntity owner = GetOwner();
		bool unconscious = ZST_IsUnconscious(owner);
		if (!unconscious)
			m_bZST_ReviveCounted = false;

		Instigator instigator = damageContext.instigator;
		if (!instigator)
			return;

		int attackerId = instigator.GetInstigatorPlayerID();
		if (attackerId <= 0)
			return;

		int victimId = GetGame().GetPlayerManager().GetPlayerIdFromControlledEntity(owner);
		if (attackerId == victimId)
			return;

		ZST_Counters c = ZST_PlayerStats.GetInstance().Get(attackerId);
		if (!c)
			return;

		if (type == EDamageType.HEALING)
		{
			if (unconscious && !m_bZST_ReviveCounted)
			{
				m_bZST_ReviveCounted = true;
				c.m_iRevives++;
			}
			return;
		}

		if (type == EDamageType.BLEEDING || type == EDamageType.REGENERATION)
			return;

		// По своим попадания не считаем.
		IEntity attacker = GetGame().GetPlayerManager().GetPlayerControlledEntity(attackerId);
		string attackerFaction = ZST_Utils.GetEntityFactionKey(attacker);
		if (!attackerFaction.IsEmpty() && attackerFaction == ZST_Utils.GetEntityFactionKey(owner))
			return;

		c.m_iHits++;
		m_mZST_Damagers.Set(attackerId, GetGame().GetWorld().GetWorldTime());
	}

	//------------------------------------------------------------------------------------------------
	protected bool ZST_IsUnconscious(IEntity owner)
	{
		ChimeraCharacter character = ChimeraCharacter.Cast(owner);
		if (!character)
			return false;

		SCR_CharacterControllerComponent controller = SCR_CharacterControllerComponent.Cast(character.GetCharacterController());
		return controller && controller.IsUnconscious();
	}

	//------------------------------------------------------------------------------------------------
	//! Вызывается при смерти: помощь всем, кто ранил недавно, кроме убийцы.
	void ZST_CreditAssists(int killerId)
	{
		float now = GetGame().GetWorld().GetWorldTime();
		foreach (int playerId, float time : m_mZST_Damagers)
		{
			if (playerId == killerId || now - time > ZST_PlayerStats.ASSIST_WINDOW_MS)
				continue;

			ZST_Counters c = ZST_PlayerStats.GetInstance().Get(playerId);
			if (c)
				c.m_iAssists++;
		}

		m_mZST_Damagers.Clear();
	}
}
