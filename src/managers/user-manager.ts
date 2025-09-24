import { UserConfig, SendMessageResponse, StreamerConfig, BroadcastOptions } from '../types/interfaces.js';
import { KickSender } from '../controllers/kick-sender.controller.js';
import { Logger } from '../utils/logger.js';
import { AccountParser } from '../utils/account-parser.js';
import { watch, FSWatcher } from 'fs';

export class UserManager {
  private senders = new Map<string, KickSender>();
  private streamers = new Map<string, StreamerConfig>();
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
    const streamersData = this.accountParser.parseStreamersFromFile(filePath);

    // Очищаем текущие аккаунты и стримеров
    this.senders.clear();
    this.streamers.clear();

    // Загружаем новые аккаунты
    for (const account of accounts) {
      const sender = new KickSender(account, this.logger);
      this.senders.set(account.username, sender);
    }

    // Загружаем стримеров
    for (const [key, streamer] of Object.entries(streamersData)) {
      this.streamers.set(key, streamer);
    }

    this.logger.info(`Loaded ${accounts.length} accounts and ${Object.keys(streamersData).length} streamers into UserManager`);
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

  public async broadcastMessage(
    chatId: string,
    message: string,
    delayMs: number = 0,
    progressCallback?: (progress: {
      currentUser: string;
      currentIndex: number;
      totalUsers: number;
      sent: number;
      failed: number;
      result?: SendMessageResponse;
      streamerNickname?: string;
    }) => void
  ): Promise<{ sent: number; failed: number; results: SendMessageResponse[] }> {
    const results: SendMessageResponse[] = [];
    let sent = 0;
    let failed = 0;
    const usernames = Array.from(this.senders.keys());
    const totalUsers = usernames.length;

    // Find streamer nickname for the chatId
    const streamerNickname = Array.from(this.streamers.values())
      .find(streamer => streamer.chatId === chatId)?.nickname;

    this.logger.info(`Broadcasting message to ${totalUsers} users with ${delayMs}ms delay`);

    for (let i = 0; i < usernames.length; i++) {
      const username = usernames[i];
      const sender = this.senders.get(username);

      if (!sender) continue;

      try {
        const result = await sender.sendMessage(chatId, message);
        results.push(result);

        if (result.success) {
          sent++;
        } else {
          failed++;
        }

        // Call progress callback if provided
        if (progressCallback) {
          progressCallback({
            currentUser: username,
            currentIndex: i + 1,
            totalUsers,
            sent,
            failed,
            result,
            streamerNickname
          });
        }

        if (delayMs > 0 && totalUsers > 1) {
          await this.delay(delayMs);
        }

      } catch (error) {
        failed++;
        const errorResult: SendMessageResponse = {
          success: false,
          error: `User: ${username} - Unexpected error: ${error}`
        };
        results.push(errorResult);
        this.logger.error(`Unexpected error sending message from ${username}: ${error}`);

        // Call progress callback for error too
        if (progressCallback) {
          progressCallback({
            currentUser: username,
            currentIndex: i + 1,
            totalUsers,
            sent,
            failed,
            result: errorResult,
            streamerNickname
          });
        }
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

  public getStreamers(): Map<string, StreamerConfig> {
    return this.streamers;
  }

  public getStreamer(nickname: string): StreamerConfig | undefined {
    return this.streamers.get(nickname);
  }

  public addStreamer(nickname: string, config: StreamerConfig): void {
    this.streamers.set(nickname, config);
    this.logger.debug(`Added streamer ${nickname} to UserManager`);
  }

  public removeStreamer(nickname: string): boolean {
    const removed = this.streamers.delete(nickname);
    if (removed) {
      this.logger.debug(`Removed streamer ${nickname} from UserManager`);
    } else {
      this.logger.warn(`Streamer ${nickname} not found in UserManager`);
    }
    return removed;
  }

  public getAllStreamerNicknames(): string[] {
    return Array.from(this.streamers.keys());
  }

  public exportToYaml(outputPath: string): void {
    try {
      const users: UserConfig[] = [];
      for (const [username, sender] of this.senders) {
        users.push(sender.getUserConfig());
      }

      const streamersObject: Record<string, {nickname: string, chatId: string}> = {};
      for (const [key, streamer] of this.streamers) {
        streamersObject[key] = {
          nickname: streamer.nickname,
          chatId: streamer.chatId
        };
      }

      this.accountParser.exportToYaml(users, streamersObject, outputPath);
      this.logger.info(`Exported data to YAML: ${outputPath}`);

    } catch (error) {
      this.logger.error(`Failed to export to YAML: ${error}`);
      throw error;
    }
  }

  public exportToText(outputPath: string): void {
    try {
      const users: UserConfig[] = [];
      for (const [username, sender] of this.senders) {
        users.push(sender.getUserConfig());
      }

      this.accountParser.exportToText(users, outputPath);
      this.logger.info(`Exported users to text format: ${outputPath}`);

    } catch (error) {
      this.logger.error(`Failed to export to text format: ${error}`);
      throw error;
    }
  }

  public importFromTextAndOverwriteYaml(textContent: string, yamlFilePath: string): void {
    try {
      // Parse accounts from text content
      const accounts = this.accountParser.parseAccountsFromTextContent(textContent);
      
      // Clear current accounts and streamers
      this.senders.clear();
      
      // Load new accounts
      for (const account of accounts) {
        const sender = new KickSender(account, this.logger);
        this.senders.set(account.username, sender);
      }

      // Export to YAML (overwrite)
      const users: UserConfig[] = [];
      for (const [username, sender] of this.senders) {
        users.push(sender.getUserConfig());
      }

      // Keep existing streamers
      const streamersObject: Record<string, StreamerConfig> = {};
      for (const [nickname, streamer] of this.streamers) {
        streamersObject[nickname] = streamer;
      }

      this.accountParser.exportToYaml(users, streamersObject, yamlFilePath);
      this.logger.info(`Imported ${accounts.length} accounts from text and updated YAML file: ${yamlFilePath}`);

    } catch (error) {
      this.logger.error(`Failed to import from text and overwrite YAML: ${error}`);
      throw error;
    }
  }

  public importFromFile(filePath: string): void {
    try {
      const { users, streamers } = this.accountParser.importFromFile(filePath);

      // Clear existing data
      this.senders.clear();
      this.streamers.clear();

      // Load users
      for (const user of users) {
        const sender = new KickSender(user, this.logger);
        this.senders.set(user.username, sender);
      }

      // Load streamers
      for (const [key, streamer] of Object.entries(streamers)) {
        this.streamers.set(key, streamer);
      }

      this.logger.info(`Imported ${users.length} users and ${Object.keys(streamers).length} streamers from ${filePath}`);

    } catch (error) {
      this.logger.error(`Failed to import from file: ${error}`);
      throw error;
    }
  }

  public async broadcastMessageConcurrent(
    chatId: string,
    message: string,
    options: BroadcastOptions = {},
    progressCallback?: (progress: {
      currentUser: string;
      currentIndex: number;
      totalUsers: number;
      sent: number;
      failed: number;
      result?: SendMessageResponse;
      streamerNickname?: string;
    }) => void
  ): Promise<{ sent: number; failed: number; results: SendMessageResponse[] }> {
    const { concurrency = 5, delayMs = 200 } = options;
    const results: SendMessageResponse[] = [];
    let sent = 0;
    let failed = 0;
    const usernames = Array.from(this.senders.keys());
    const totalUsers = usernames.length;

    // Find streamer nickname for the chatId
    const streamerNickname = Array.from(this.streamers.values())
      .find(streamer => streamer.chatId === chatId)?.nickname;

    this.logger.info(`Broadcasting message to ${totalUsers} users with concurrency ${concurrency} and ${delayMs}ms delay`);

    // Process users in chunks with concurrency limit
    for (let i = 0; i < usernames.length; i += concurrency) {
      const chunk = usernames.slice(i, i + concurrency);

      // Process chunk concurrently
      const chunkPromises = chunk.map(async (username, chunkIndex) => {
        const globalIndex = i + chunkIndex;
        const sender = this.senders.get(username);

        if (!sender) {
          const errorResult: SendMessageResponse = {
            success: false,
            error: `User: ${username} - Sender not found`
          };
          results[globalIndex] = errorResult;
          failed++;

          if (progressCallback) {
            progressCallback({
              currentUser: username,
              currentIndex: globalIndex + 1,
              totalUsers,
              sent,
              failed,
              result: errorResult,
              streamerNickname
            });
          }
          return;
        }

        try {
          const result = await sender.sendMessage(chatId, message);
          results[globalIndex] = result;

          if (result.success) {
            sent++;
          } else {
            failed++;
          }

          // Call progress callback if provided
          if (progressCallback) {
            progressCallback({
              currentUser: username,
              currentIndex: globalIndex + 1,
              totalUsers,
              sent,
              failed,
              result,
              streamerNickname
            });
          }

        } catch (error) {
          failed++;
          const errorResult: SendMessageResponse = {
            success: false,
            error: `User: ${username} - Unexpected error: ${error}`
          };
          results[globalIndex] = errorResult;
          this.logger.error(`Unexpected error sending message from ${username}: ${error}`);

          // Call progress callback for error too
          if (progressCallback) {
            progressCallback({
              currentUser: username,
              currentIndex: globalIndex + 1,
              totalUsers,
              sent,
              failed,
              result: errorResult,
              streamerNickname
            });
          }
        }
      });

      // Wait for chunk to complete
      await Promise.all(chunkPromises);

      // Add delay between chunks (except for the last chunk)
      if (i + concurrency < usernames.length && delayMs > 0) {
        await this.delay(delayMs);
      }
    }

    this.logger.info(`Concurrent broadcast completed: ${sent} sent, ${failed} failed`);
    return { sent, failed, results };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}