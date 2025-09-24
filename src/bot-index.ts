import dotenv from 'dotenv';
import { UserManager } from "./managers/user-manager.js";
import { Logger } from "./utils/logger.js";
import { TelegramBot } from "./bot/telegram-bot.js";

dotenv.config();

async function main() {
  const logger = new Logger('info');
  const userManager = new UserManager(logger);

  try {
    logger.info("Starting Kick Bot Manager with Telegram interface");

    const botToken = process.env.BOT_TOKEN;

    if (!botToken) {
      throw new Error('BOT_TOKEN must be set in .env file');
    }

    await userManager.loadAccountsFromFile('./accounts.yml');
    logger.info(`Loaded ${userManager.getUserCount()} accounts`);

    const telegramBot = new TelegramBot(botToken, '', userManager, logger);

    process.on('SIGINT', () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      telegramBot.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      telegramBot.stop();
      process.exit(0);
    });

    await telegramBot.start();

  } catch (error) {
    logger.error(`Application error: ${error}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error("Unhandled error:", error);
  process.exit(1);
});