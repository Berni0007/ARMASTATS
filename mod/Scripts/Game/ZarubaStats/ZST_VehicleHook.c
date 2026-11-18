//! Урон по технике и её уничтожение — в личные счётчики того, кто стрелял.
modded class SCR_VehicleDamageManagerComponent
{
	protected bool m_bZST_Destroyed;

	//------------------------------------------------------------------------------------------------
	protected override void OnDamage(notnull BaseDamageContext damageContext)
	{
		super.OnDamage(damageContext);

		if (!Replication.IsServer())
			return;

		Instigator instigator = damageContext.instigator;
		if (!instigator)
			return;

		int attackerId = instigator.GetInstigatorPlayerID();
		if (attackerId <= 0)
			return;

		// Своя техника не считается (у пустой техники стороны нет — считается).
		IEntity vehicle = GetOwner();
		IEntity attacker = GetGame().GetPlayerManager().GetPlayerControlledEntity(attackerId);
		string vehicleFaction = ZST_Utils.GetEntityFactionKey(vehicle);
		if (!vehicleFaction.IsEmpty() && vehicleFaction == ZST_Utils.GetEntityFactionKey(attacker))
			return;

		ZST_Counters c = ZST_PlayerStats.GetInstance().Get(attackerId);
		if (!c)
			return;

		if (damageContext.damageValue > 0)
			c.m_fVehDamage += damageContext.damageValue;

		if (!m_bZST_Destroyed && GetState() == EDamageState.DESTROYED)
		{
			m_bZST_Destroyed = true;
			c.m_iVehKills++;
		}
	}
}
