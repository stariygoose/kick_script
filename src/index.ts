import { UserManager } from "./managers/user-manager.js";
import { Logger } from "./utils/logger.js";
import { RetryHandler } from "./utils/retry-handler.js";

async function main() {
  const logger = new Logger('info');
  const userManager = new UserManager(logger);
  const retryHandler = new RetryHandler(logger);

  try {
    logger.info("Starting Kick message sender application");

    await userManager.loadAccountsFromFile('./accounts.txt');

    const chatId = "78046505";
    const message = "test message";
    const delayBetweenMessages = 1000;

    logger.info(`Starting broadcast to chat ${chatId}`);
    logger.info(`Loaded ${userManager.getUserCount()} accounts`);

    const startTime = Date.now();

    const result = await retryHandler.execute(
      () => userManager.broadcastMessage(chatId, message, delayBetweenMessages),
      { maxAttempts: 2, delayMs: 2000 },
      'broadcast message'
    );

    const finishTime = Date.now();
    const duration = (finishTime - startTime) / 1000;

    logger.info(`Broadcast completed in ${duration} seconds`);
    logger.info(`Results: ${result.sent} sent, ${result.failed} failed`);

    if (result.failed > 0) {
      logger.warn("Some messages failed to send. Check logs for details.");
    }

  } catch (error) {
    logger.error(`Application error: ${error}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
