import { DiscordBot } from './bot.js';

const bot = new DiscordBot();

bot.start().catch((err: unknown) => {
  if (err instanceof Error && err.message.includes('discord_bot_token is missing')) {
    process.exit(1);
  }
  console.error('[DiscordBot] 起動時致命的エラー:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[DiscordBot] 未処理のPromise拒絶:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[DiscordBot] 未捕捉の例外:', err);
  process.exit(1);
});
