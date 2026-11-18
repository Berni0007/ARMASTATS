//! Буфер неотправленных событий: один файл на событие в $profile:ZarubaStats/outbox.
//! Файл пишется до отправки и удаляется после ответа хоста. Всё, что осталось, досылается позже.
class ZST_Outbox
{
	static const string DIR = "$profile:ZarubaStats/outbox";
	static const int MAX_FILES = 5000;

	protected static ref array<string> s_aFound;

	//------------------------------------------------------------------------------------------------
	static string PathFor(string eventId)
	{
		return DIR + "/" + eventId + ".json";
	}

	//------------------------------------------------------------------------------------------------
	static void Save(string eventId, string body)
	{
		FileIO.MakeDirectory("$profile:ZarubaStats");
		FileIO.MakeDirectory(DIR);

		FileHandle f = FileIO.OpenFile(PathFor(eventId), FileMode.WRITE);
		if (!f)
		{
			Print("[ZarubaStats] Outbox: cannot write " + eventId, LogLevel.ERROR);
			return;
		}

		f.WriteLine(body);
		f.Close();
	}

	//------------------------------------------------------------------------------------------------
	static void Remove(string eventId)
	{
		string path = PathFor(eventId);
		if (FileIO.FileExists(path))
			FileIO.DeleteFile(path);
	}

	//------------------------------------------------------------------------------------------------
	protected static void OnFileFound(string fileName, FileAttribute attributes = 0, string filesystem = string.Empty)
	{
		if (s_aFound.Count() < MAX_FILES)
			s_aFound.Insert(fileName);
	}

	//------------------------------------------------------------------------------------------------
	//! ID всех событий, ожидающих отправки.
	static array<string> List()
	{
		s_aFound = {};
		FileIO.FindFiles(OnFileFound, DIR, ".json");

		array<string> ids = {};
		foreach (string fileName : s_aFound)
		{
			// FindFiles может вернуть как полный путь, так и имя файла.
			string name = fileName;
			int slash = name.LastIndexOf("/");
			if (slash >= 0)
				name = name.Substring(slash + 1, name.Length() - slash - 1);

			if (name.EndsWith(".json"))
				ids.Insert(name.Substring(0, name.Length() - 5));
		}

		return ids;
	}

	//------------------------------------------------------------------------------------------------
	//! Текст события. Пусто, если файл не прочитался.
	static string Read(string eventId)
	{
		FileHandle f = FileIO.OpenFile(PathFor(eventId), FileMode.READ);
		if (!f)
			return string.Empty;

		string line;
		f.ReadLine(line);
		f.Close();
		return line;
	}
}
