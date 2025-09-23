import { UserConfig, SendMessageResponse } from '../types/interfaces.js';
import { KickSender } from '../controllers/kick-sender.controller.js';
import { Logger } from '../utils/logger.js';
import { AccountParser } from '../utils/account-parser.js';
import { watch, FSWatcher } from 'fs';

export class UserManager {
  private senders = new Map<string, KickSender>();
  private logger: Logger;
  private accountParser: AccountParser;
  private fileWatcher: FSWatcher | null = null;
  private watchedFilePath: string | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
    this.accountParser = new AccountParser(logger);
  }

  public async loadAccountsFromFile(filePath: string, enableWatcher: boolean = true): Promise<void> {
    try {
      this.reloadAccountsFromFile(filePath);

      if (enableWatcher) {
        this.startFileWatcher(filePath);
      }
    } catch (error) {
      this.logger.error(`Failed to load accounts: ${error}`);
      throw error;
    }
  }

  private reloadAccountsFromFile(filePath: string): void {
    const accounts = this.accountParser.parseAccountsFile(filePath);

    // Очищаем текущие аккаунты
    this.senders.clear();

    // Загружаем новые аккаунты
    for (const account of accounts) {
      const sender = new KickSender(account, this.logger);
      this.senders.set(account.username, sender);
    }

    this.logger.info(`Loaded ${accounts.length} accounts into UserManager`);
  }

  public addUser(config: UserConfig): void {
    const sender = new KickSender(config, this.logger);
    this.senders.set(config.username, sender);
    this.logger.debug(`Added user ${config.username} to UserManager`);
  }

  public removeUser(username: string): boolean {
    const removed = this.senders.delete(username);
    if (removed) {
      this.logger.debug(`Removed user ${username} from UserManager`);
    } else {
      this.logger.warn(`User ${username} not found in UserManager`);
    }
    return removed;
  }

  public getSender(username: string): KickSender | undefined {
    return this.senders.get(username);
  }

  public getAllUsernames(): string[] {
    return Array.from(this.senders.keys());
  }

  public getUserCount(): number {
    return this.senders.size;
  }

  public async sendMessageFromUser(username: string, chatId: string, message: string): Promise<SendMessageResponse> {
    const sender = this.senders.get(username);

    if (!sender) {
      const error = `User ${username} not found`;
      this.logger.error(error);
      return {
        success: false,
        error
      };
    }

    return await sender.sendMessage(chatId, message);
  }

  public async broadcastMessage(chatId: string, message: string, delayMs: number = 0): Promise<{ sent: number; failed: number; results: SendMessageResponse[] }> {
    const results: SendMessageResponse[] = [];
    let sent = 0;
    let failed = 0;

    this.logger.info(`Broadcasting message to ${this.senders.size} users with ${delayMs}ms delay`);

    for (const [username, sender] of this.senders) {
      try {
        const result = await sender.sendMessage(chatId, message);
        results.push(result);

        if (result.success) {
          sent++;
        } else {
          failed++;
        }

        if (delayMs > 0 && this.senders.size > 1) {
          await this.delay(delayMs);
        }

      } catch (error) {
        failed++;
        const errorResult: SendMessageResponse = {
          success: false,
          error: `Unexpected error for ${username}: ${error}`
        };
        results.push(errorResult);
        this.logger.error(`Unexpected error sending message from ${username}: ${error}`);
      }
    }

    this.logger.info(`Broadcast completed: ${sent} sent, ${failed} failed`);
    return { sent, failed, results };
  }

  public updateUserAgent(username: string, userAgent: string): boolean {
    const sender = this.senders.get(username);

    if (!sender) {
      this.logger.warn(`Cannot update user agent for ${username}: user not found`);
      return false;
    }

    sender.updateUserAgent(userAgent);
    return true;
  }

  private startFileWatcher(filePath: string): void {
    // Останавливаем предыдущий watcher если он есть
    this.stopFileWatcher();

    this.watchedFilePath = filePath;
    this.fileWatcher = watch(filePath, (eventType) => {
      if (eventType === 'change') {
        this.logger.info(`Accounts file ${filePath} changed, reloading accounts...`);
        try {
          this.reloadAccountsFromFile(filePath);
        } catch (error) {
          this.logger.error(`Failed to reload accounts after file change: ${error}`);
        }
      }
    });

    this.logger.info(`Started watching accounts file: ${filePath}`);
  }

  public stopFileWatcher(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
      this.logger.info(`Stopped watching accounts file: ${this.watchedFilePath}`);
      this.watchedFilePath = null;
    }
  }

  public isWatchingFile(): boolean {
    return this.fileWatcher !== null;
  }

  public getWatchedFilePath(): string | null {
    return this.watchedFilePath;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}