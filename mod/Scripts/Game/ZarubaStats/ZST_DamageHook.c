//! Запоминаем последнее прямое попадание в персонажа: тип урона, зону и источник.
//! По этим данным в момент гибели определяется, чем именно убили.
modded class SCR_CharacterDamageManagerComponent
{
	protected EDamageType m_eZST_LastType = -1;
	protected string m_sZST_LastSource;
	protected string m_sZST_LastZone;

	//------------------------------------------------------------------------------------------------
	protected override void OnDamage(notnull BaseDamageContext damageContext)
	{
		super.OnDamage(damageContext);

		// Кровотечение, лечение и регенерация не затирают попадание, которое к ним привело.
		EDamageType type = damageContext.damageType;
		if (type == EDamageType.BLEEDING || type == EDamageType.HEALING || type == EDamageType.REGENERATION)
			return;

		m_eZST_LastType = type;

		m_sZST_LastSource = string.Empty;
		IEntity source = damageContext.damageSource;
		if (source)
		{
			EntityPrefabData prefab = source.GetPrefabData();
			if (prefab)
				m_sZST_LastSource = prefab.GetPrefabName();
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
}
