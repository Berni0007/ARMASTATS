# Развёртывание на хосте

Хост: Linux с Docker и Caddy. Сервис слушает `127.0.0.1:8787`, наружу выходит через Caddy по адресу
`https://warcon.zaruba-server.online/armastats`.

## 1. Код

```
cd /opt
git clone https://github.com/Berni0007/ARMASTATS.git armastats
cd /opt/armastats/bot
```

## 2. Секрет

```
cp .env.example .env
nano .env
```

Вписать свой `STATS_TOKEN`. Этот же токен пойдёт в `config.json` мода.

## 3. Запуск

```
mkdir -p data && chown 1000:1000 data
docker compose up -d --build
curl http://127.0.0.1:8787/health
```

Ожидаемый ответ: `{"ok":true}`.

## 4. Caddy

В `/etc/caddy/Caddyfile` внутри блока `warcon.zaruba-server.online { ... }`, перед строкой
`reverse_proxy 127.0.0.1:3000`, добавить:

```
	handle_path /armastats/* {
		reverse_proxy 127.0.0.1:8787
	}
```

Проверить и применить:

```
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
curl https://warcon.zaruba-server.online/armastats/health
```

## 5. Мод

В `profile/ZarubaStats/config.json` игрового сервера:

```json
{
  "apiUrl": "https://warcon.zaruba-server.online/armastats",
  "token": "тот же STATS_TOKEN",
  "serverId": "zaruba-1",
  "enabled": true,
  "mapName": ""
}
```

`mapName` — название для отчётов. Пусто — берётся название сервера из его настроек.
Применяется со следующего матча.

## 6. Discord-бот

1. https://discord.com/developers/applications → **New Application** → имя `ZARUBA Stats`.
2. Вкладка **Bot** → **Reset Token** → скопировать токен.
3. Вкладка **OAuth2 → URL Generator**: scopes `bot` и `applications.commands`,
   права `Send Messages`, `Embed Links`. Открыть ссылку и добавить бота на свой сервер Discord.
4. В Discord включить режим разработчика (Настройки → Расширенные), затем ПКМ по серверу →
   **Копировать ID сервера**, ПКМ по каналу отчётов → **Копировать ID канала**.
5. Вписать в `/opt/armastats/bot/.env`:

```
DISCORD_TOKEN=...
DISCORD_GUILD_ID=...
DISCORD_CHANNEL_ID=...
MATCH_REPORT_MIN_SEC=60
MATCH_REPORT_MIN_PLAYERS=1
```

6. Перезапустить: `cd /opt/armastats/bot && docker compose up -d --build`.

Команды в Discord: `/stats ник` (с подсказкой ников), `/top`.

## 7. Оформление картинок

Папка `/opt/armastats/bot/data/branding/` (создать вручную). Всё необязательно,
изменения подхватываются без перезапуска:

| Файл | Что делает |
|---|---|
| `branding.json` | названия, подписи и цвета сторон, красивые названия карт, заголовок. Образец: `bot/branding.example.json` |
| `background.jpg` или `.png` | фон картинки «Статистика боя» (затемняется автоматически) |
| `logo.png` или `.jpg` | лого в шапке вместо ZARUBA |
| `emblems/<КЛЮЧ>.png` | значок стороны вместо нарисованного щита; ключ как в игре: `US`, `USSR`, `FIA`… |

Ключи сторон видны в журнале событий (`victimFaction`, `killerFaction`).

Важно: государственные гербы и чужие товарные знаки (логотипы игр, эмблемы организаций)
используйте только если у вас есть на это право.

## Обслуживание

- Журнал: `docker logs -f armastats`
- События (сырой журнал): `/opt/armastats/bot/data/events.jsonl`
- База статистики: `/opt/armastats/bot/data/stats.db`. При первом запуске с пустой базой
  события из журнала переносятся в неё автоматически.
- Обновление: `cd /opt/armastats && git pull && cd bot && docker compose up -d --build`
