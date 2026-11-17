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
  "enabled": true
}
```

## Обслуживание

- Журнал: `docker logs -f armastats`
- События: `/opt/armastats/bot/data/events.jsonl`
- Обновление: `cd /opt/armastats && git pull && cd bot && docker compose up -d --build`
