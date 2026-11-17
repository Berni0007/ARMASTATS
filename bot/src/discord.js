'use strict';

// Discord-бот: отчёт матча в канал и слэш-команды /stats и /top.
// Если DISCORD_TOKEN не задан, бот не запускается, а сервис просто копит статистику.

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');
const { matchEmbed, playerEmbed, topEmbed } = require('./format');

const COMMANDS = [
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Статистика игрока')
    .addStringOption((o) =>
      o.setName('ник').setDescription('Ник в игре').setRequired(true).setAutocomplete(true)
    ),
  new SlashCommandBuilder()
    .setName('top')
    .setDescription('Лучшие игроки по убийствам')
    .addIntegerOption((o) =>
      o.setName('сколько').setDescription('Сколько игроков показать (до 25)').setMinValue(3).setMaxValue(25)
    ),
].map((c) => c.toJSON());

function startDiscord(stats, cfg) {
  if (!cfg.token) {
    console.log('[discord] DISCORD_TOKEN не задан, бот выключен');
    return { reportMatch: () => {} };
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, async (c) => {
    console.log(`[discord] вошёл как ${c.user.tag}`);
    if (!cfg.guildId) {
      console.warn('[discord] DISCORD_GUILD_ID не задан, команды не зарегистрированы');
      return;
    }
    try {
      const rest = new REST().setToken(cfg.token);
      await rest.put(Routes.applicationGuildCommands(c.application.id, cfg.guildId), { body: COMMANDS });
      console.log('[discord] команды /stats и /top зарегистрированы');
    } catch (e) {
      console.error('[discord] не удалось зарегистрировать команды:', e.message);
    }
  });

  client.on(Events.InteractionCreate, async (it) => {
    try {
      if (it.isAutocomplete()) {
        const typed = it.options.getFocused();
        const list = stats.suggestPlayers(typed, 25);
        await it.respond(list.map((p) => ({ name: p.name.slice(0, 100), value: p.name.slice(0, 100) })));
        return;
      }

      if (!it.isChatInputCommand()) return;

      if (it.commandName === 'stats') {
        const nick = it.options.getString('ник', true);
        const found = stats.findPlayer(nick);
        if (!found) {
          await it.reply({ content: `Игрок «${nick}» не найден. Он должен хотя бы раз зайти на сервер.`, ephemeral: true });
          return;
        }
        await it.reply({ embeds: [playerEmbed(stats.playerStats(found.uid))] });
        return;
      }

      if (it.commandName === 'top') {
        const n = it.options.getInteger('сколько') || 10;
        await it.reply({ embeds: [topEmbed(stats.top(n))] });
      }
    } catch (e) {
      console.error('[discord] ошибка команды:', e);
      if (it.isRepliable() && !it.replied) {
        await it.reply({ content: 'Что-то пошло не так, попробуй ещё раз.', ephemeral: true }).catch(() => {});
      }
    }
  });

  client.login(cfg.token).catch((e) => console.error('[discord] вход не удался:', e.message));

  async function reportMatch(matchId) {
    const r = stats.matchReport(matchId);
    if (!r) return;

    if (r.durationSec < cfg.minMatchSec || r.playerCount < cfg.minPlayers) {
      console.log(`[discord] отчёт ${matchId} пропущен: ${Math.round(r.durationSec)} с, игроков ${r.playerCount}`);
      return;
    }
    if (!cfg.channelId) {
      console.warn('[discord] DISCORD_CHANNEL_ID не задан, отчёт не отправлен');
      return;
    }

    try {
      const channel = await client.channels.fetch(cfg.channelId);
      await channel.send({ embeds: [matchEmbed(r)] });
      stats.markReported(matchId);
      console.log(`[discord] отчёт ${matchId} отправлен`);
    } catch (e) {
      console.error(`[discord] отчёт ${matchId} не отправлен:`, e.message);
    }
  }

  return { reportMatch };
}

module.exports = { startDiscord };
