'use strict';

// Discord-бот: отчёт матча в канал, /stats, /top, /report.
// Отчёт и карточка игрока идут картинкой; если нарисовать не удалось — обычным embed.
// Если DISCORD_TOKEN не задан, бот не запускается, а сервис просто копит статистику.

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { matchEmbed, playerEmbed, topEmbed } = require('./format');
const { renderMatch, renderPlayer, renderTop } = require('./render');

const COMMANDS = [
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Статистика игрока')
    .addStringOption((o) =>
      o.setName('ник').setDescription('Ник в игре. Без ника — твоя статистика, если аккаунт привязан').setAutocomplete(true)
    ),
  new SlashCommandBuilder()
    .setName('link')
    .setDescription('Привязать Discord к игроку: код дадут в игре по команде #link')
    .addStringOption((o) => o.setName('код').setDescription('Код из игры').setRequired(true).setMinLength(6).setMaxLength(6)),
  new SlashCommandBuilder()
    .setName('top')
    .setDescription('Лучшие игроки по убийствам')
    .addIntegerOption((o) =>
      o.setName('сколько').setDescription('Сколько игроков показать (до 10)').setMinValue(3).setMaxValue(10)
    ),
  new SlashCommandBuilder()
    .setName('report')
    .setDescription('Переслать отчёт о последнем матче в канал отчётов')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map((c) => c.toJSON());

async function matchMessage(r) {
  try {
    return { files: [{ attachment: await renderMatch(r), name: 'match.png' }] };
  } catch (e) {
    console.error('[render] отчёт матча:', e.message);
    return { embeds: [matchEmbed(r)] };
  }
}

async function topMessage(rows) {
  try {
    return { files: [{ attachment: await renderTop(rows), name: 'top.png' }] };
  } catch (e) {
    console.error('[render] таблица лидеров:', e.message);
    return { embeds: [topEmbed(rows)] };
  }
}

async function playerMessage(s) {
  try {
    return { files: [{ attachment: await renderPlayer(s), name: 'player.png' }] };
  } catch (e) {
    console.error('[render] карточка игрока:', e.message);
    return { embeds: [playerEmbed(s)] };
  }
}

function startDiscord(stats, cfg) {
  if (!cfg.token) {
    console.log('[discord] DISCORD_TOKEN не задан, бот выключен');
    return { reportMatch: async () => {} };
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  // Проверка канала отчётов: видит ли его бот и каких прав не хватает.
  async function checkChannel(c) {
    if (!cfg.channelId) {
      console.warn('[discord] DISCORD_CHANNEL_ID не задан');
      return;
    }
    let channel;
    try {
      channel = await c.channels.fetch(cfg.channelId);
    } catch (e) {
      const guilds = c.guilds.cache.map((g) => `${g.name} (${g.id})`).join(', ') || 'нет';
      console.error(`[discord] канал ${cfg.channelId} недоступен: ${e.message}. Бот состоит на серверах: ${guilds}`);
      return;
    }
    const need = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
    ];
    const names = { ViewChannel: 'просматривать канал', SendMessages: 'отправлять сообщения', EmbedLinks: 'встраивать ссылки', AttachFiles: 'прикреплять файлы' };
    const perms = channel.guild ? channel.permissionsFor(channel.guild.members.me) : null;
    const missing = perms ? perms.missing(need).map((p) => names[p] || p) : [];
    const where = channel.guild ? `#${channel.name} на сервере ${channel.guild.name}` : channel.id;
    if (missing.length) console.error(`[discord] канал ${where}: не хватает прав: ${missing.join(', ')}`);
    else console.log(`[discord] канал отчётов ${where}: права в порядке`);
  }

  client.once(Events.ClientReady, async (c) => {
    console.log(`[discord] вошёл как ${c.user.tag}`);
    await checkChannel(c);
    if (!cfg.guildId) {
      console.warn('[discord] DISCORD_GUILD_ID не задан, команды не зарегистрированы');
      return;
    }
    try {
      const rest = new REST().setToken(cfg.token);
      await rest.put(Routes.applicationGuildCommands(c.application.id, cfg.guildId), { body: COMMANDS });
      console.log('[discord] команды /stats, /top, /link и /report зарегистрированы');
    } catch (e) {
      console.error('[discord] не удалось зарегистрировать команды:', e.message);
    }
  });

  async function sendToChannel(payload) {
    if (!cfg.channelId) throw new Error('DISCORD_CHANNEL_ID не задан');
    const channel = await client.channels.fetch(cfg.channelId);
    await channel.send(payload);
  }

  // force: отправить, даже если матч короче порога (для /report).
  async function reportMatch(matchId, { force = false } = {}) {
    const r = stats.matchReport(matchId);
    if (!r) return { ok: false, reason: 'матч не найден' };

    if (!force && (r.durationSec < cfg.minMatchSec || r.playerCount < cfg.minPlayers)) {
      console.log(`[discord] отчёт ${matchId} пропущен: ${Math.round(r.durationSec)} с, игроков ${r.playerCount}`);
      return { ok: false, reason: 'матч короче порога' };
    }

    try {
      await sendToChannel(await matchMessage(r));
      stats.markReported(matchId);
      console.log(`[discord] отчёт ${matchId} отправлен`);
      return { ok: true };
    } catch (e) {
      console.error(`[discord] отчёт ${matchId} не отправлен:`, e.message);
      return { ok: false, reason: e.message };
    }
  }

  client.on(Events.InteractionCreate, async (it) => {
    try {
      if (it.isAutocomplete()) {
        const list = stats.suggestPlayers(it.options.getFocused(), 25);
        await it.respond(list.map((p) => ({ name: p.name.slice(0, 100), value: p.name.slice(0, 100) })));
        return;
      }

      if (!it.isChatInputCommand()) return;

      if (it.commandName === 'stats') {
        const nick = it.options.getString('ник');
        let uid = null;
        if (nick) {
          const found = stats.findPlayer(nick);
          if (!found) {
            await it.reply({
              content: `Игрок «${nick}» не найден. Он должен хотя бы раз зайти на сервер.`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          uid = found.uid;
        } else {
          uid = stats.linkedUid(it.user.id);
          if (!uid) {
            await it.reply({
              content: 'Укажи ник или привяжи аккаунт: напиши в игре #link и введи здесь /link код.',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
        }
        await it.deferReply();
        await it.editReply(await playerMessage(stats.playerStats(uid)));
        return;
      }

      if (it.commandName === 'link') {
        const player = stats.useLinkCode(it.options.getString('код', true), it.user.id);
        await it.reply({
          content: player
            ? `Готово: твой Discord привязан к игроку ${player.name}. Теперь /stats без ника покажет твою статистику.`
            : 'Код неверный или истёк. Напиши в игре #link, чтобы получить новый.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (it.commandName === 'top') {
        const n = it.options.getInteger('сколько') || 10;
        await it.deferReply();
        await it.editReply(await topMessage(stats.top(n)));
        return;
      }

      if (it.commandName === 'report') {
        await it.deferReply({ flags: MessageFlags.Ephemeral });
        const matchId = stats.lastMatchId();
        if (!matchId) {
          await it.editReply('Ни один матч ещё не закончился.');
          return;
        }
        const res = await reportMatch(matchId, { force: true });
        await it.editReply(res.ok ? `Отчёт о матче ${matchId} отправлен в канал.` : `Не отправлен: ${res.reason}`);
      }
    } catch (e) {
      console.error('[discord] ошибка команды:', e);
      const msg = { content: 'Что-то пошло не так, попробуй ещё раз.', flags: MessageFlags.Ephemeral };
      if (it.deferred) await it.editReply(msg.content).catch(() => {});
      else if (it.isRepliable() && !it.replied) await it.reply(msg).catch(() => {});
    }
  });

  client.login(cfg.token).catch((e) => console.error('[discord] вход не удался:', e.message));

  return { reportMatch };
}

module.exports = { startDiscord };
