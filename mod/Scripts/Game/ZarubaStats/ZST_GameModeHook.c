//! Точка входа мода: цепляемся к базовому гейммоду, чтобы работать на любом сценарии.
modded class SCR_BaseGameMode
{
	//------------------------------------------------------------------------------------------------
	protected override void OnGameStart()
	{
		super.OnGameStart();

		// Только сервер.
		if (!IsMaster())
			return;

		Print("[ZarubaStats] Загружен. Отправляю ping на хост.");
		ZST_Api api = ZST_Api.GetInstance();
		api.ReloadConfig();
		api.SendEvent("ping");
	}
}
