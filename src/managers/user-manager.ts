import { UserConfig, SendMessageResponse, StreamerConfig, BroadcastOptions } from '../types/interfaces.js';
import { KickSender } from '../controllers/kick-sender.controller.js';
import { Logger } from '../utils/logger.js';
import { AccountParser } from '../utils/account-parser.js';
import { watch, FSWatcher, writeFileSync } from 'fs';

export class UserManager {
  private senders = new Map<string, KickSender>();
  private streamers = new Map<string, StreamerConfig>();
  private logger: Logger;
  private accountParser: AccountParser;
  private fileWatcher: FSWatcher | null = null;
  private watchedFilePath: string | null = null;
  private nextSenderIndex = 0;

  constructor(logger: Logger) {
    this.logger = logger;
    this.accountParser = new AccountParser(logger);
  }

  public async sendMessageFromNextUser(
    streamerNickname: string,
    message: string,
  ): Promise<SendMessageFromNextUserResult> {
    const usernames = this.getAllUsernames();
    if (usernames.length === 0) {
      const error = "No users available to send a message";
      this.logger.error(error);
      return { response: { success: false, error }, username: null };
    }

    const username = usernames[this.nextSenderIndex];
    this.nextSenderIndex = (this.nextSenderIndex + 1) % usernames.length;

    this.logger.info(
      `Sending solo message from user ${username} (next index: ${this.nextSenderIndex})`,
    );

    const response = await this.sendMessageFromUser(username, streamerNickname, message);
    return { response, username };
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

  public async sendMessageFromUser(username: string, streamerNickname: string, message: string): Promise<SendMessageResponse> {
    const sender = this.senders.get(username);

    if (!sender) {
      const error = `User ${username} not found`;
      this.logger.error(error);
      return {
        success: false,
        error
      };
    }

    // Get streamer info and validate
    const streamer = this.streamers.get(streamerNickname);
    if (!streamer) {
      const error = `Стример "${streamerNickname}" не найден`;
      this.logger.error(error);
      return {
        success: false,
        error
      };
    }

    return await sender.sendMessage(streamer.chatId, message);
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

  public importFromFileAndOverwriteYaml(filePath: string, yamlFilePath: string): void {
    try {
      // Parse accounts from file
      const accounts = this.accountParser.parseAccountsFile(filePath);
      
      // Clear current accounts
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
      this.logger.info(`Imported ${accounts.length} accounts from file ${filePath} and updated YAML file: ${yamlFilePath}`);

    } catch (error) {
      this.logger.error(`Failed to import from file and overwrite YAML: ${error}`);
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
    streamerNickname: string,
    message: string,
    options: BroadcastOptions = {},
    stopCallback?: () => boolean,
    progressCallback?: (progress: {
      currentUser: string;
      currentIndex: number;
      totalUsers: number;
      sent: number;
      failed: number;
      result?: SendMessageResponse;
      streamerNickname?: string;
    }) => void
  ): Promise<{ sent: number; failed: number; results: SendMessageResponse[]; stopped?: boolean }> {
    // Get streamer info and validate
    const streamer = this.streamers.get(streamerNickname);
    if (!streamer) {
      throw new Error(`Стример "${streamerNickname}" не найден`);
    }

    const chatId = streamer.chatId;
    const { concurrency = 5, delayMs = 200, randomDelay } = options;
    const results: SendMessageResponse[] = [];
    let sent = 0;
    let failed = 0;
    const usernames = Array.from(this.senders.keys());
    const totalUsers = usernames.length;
    let processedCount = 0;

    this.logger.info(`Broadcasting message to ${totalUsers} users with concurrency ${concurrency}`);

    let stopped = false;
    const abortController = new AbortController();
    const recentResults: Array<{ username: string; success: boolean; error?: string }> = [];
    let logBatchCounter = 0;

    const userChunks: { username: string, originalIndex: number }[][] = Array.from({ length: concurrency }, () => []);
    for (let i = 0; i < totalUsers; i++) {
        userChunks[i % concurrency].push({ username: usernames[i], originalIndex: i });
    }

    const workerPromises = userChunks.map(async (chunk) => {
      for (const { username, originalIndex } of chunk) {
        if (stopCallback && stopCallback()) {
          stopped = true;
          abortController.abort();
          break;
        }

        const sender = this.senders.get(username);

        if (!sender) {
          const errorResult: SendMessageResponse = {
            success: false,
            error: `User: ${username} - Sender not found`
          };
          results[originalIndex] = errorResult;
          failed++;
        } else {
          try {
            const result = await sender.sendMessage(chatId, message, abortController.signal);
            results[originalIndex] = result;

            if (result.success) {
              sent++;
              recentResults.push({ username, success: true });
            } else {
              failed++;
              recentResults.push({ username, success: false, error: result.error });
            }
          } catch (error: any) {
            failed++;
            let errorMessage = `Unexpected error: ${error}`;
            if (error.name === 'AbortError' || error.message?.includes('aborted')) {
              errorMessage = `Request cancelled (broadcast stopped)`;
            }
            const errorResult: SendMessageResponse = {
              success: false,
              error: `User: ${username} - ${errorMessage}`
            };
            results[originalIndex] = errorResult;
            recentResults.push({ username, success: false, error: errorMessage });
          }
        }
        
        processedCount++;

        if (progressCallback) {
          setImmediate(() => {
            progressCallback({
              currentUser: username,
              currentIndex: processedCount,
              totalUsers,
              sent,
              failed,
              result: results[originalIndex],
              streamerNickname: streamerNickname
            });
          });
        }

        logBatchCounter++;
        if (logBatchCounter >= 20) {
          this.logResultsBatch(recentResults);
          recentResults.length = 0;
          logBatchCounter = 0;
        }

        if (randomDelay) {
          const randomWait = Math.floor(Math.random() * (randomDelay.max - randomDelay.min + 1)) + randomDelay.min;
          await this.delay(randomWait);
        } else if (delayMs > 0) {
          await this.delay(delayMs);
        }
      }
    });

    await Promise.all(workerPromises);

    if (recentResults.length > 0) {
      this.logResultsBatch(recentResults);
    }

    const statusMessage = stopped ? 'stopped by user' : 'completed';
    this.logger.info(`Concurrent broadcast ${statusMessage}: ${sent} sent, ${failed} failed`);
    return { sent, failed, results, stopped };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private logResultsBatch(results: Array<{ username: string; success: boolean; error?: string }>): void {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    if (successful.length > 0) {
      this.logger.info(`✅ Successfully sent (${successful.length}): ${successful.map(r => r.username).join(', ')}`);
    }

    if (failed.length > 0) {
      const errorGroups: { [key: string]: string[] } = {};
      
      failed.forEach(result => {
        const errorType = this.getErrorType(result.error || '');
        if (!errorGroups[errorType]) {
          errorGroups[errorType] = [];
        }
        errorGroups[errorType].push(result.username);
      });

      Object.entries(errorGroups).forEach(([errorType, usernames]) => {
        this.logger.error(`❌ ${errorType} (${usernames.length}): ${usernames.join(', ')}`);
      });
    }
  }

  private getErrorType(error: string): string {
    if (error.includes('Access forbidden') || error.includes('403')) {
      return 'Access forbidden';
    } else if (error.includes('Rate limited') || error.includes('429')) {
      return 'Rate limited';
    } else if (error.includes('Server error') || error.includes('5')) {
      return 'Server error';
    } else if (error.includes('cancelled') || error.includes('stopped')) {
      return 'Broadcast stopped';
    } else {
      return 'Other errors';
    }
  }

  public exportToTextFile(outputPath: string): void {
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

  public importFromYmlAndOverwrite(ymlFilePath: string, targetYmlPath: string): void {
    try {
      // Импортируем данные из исходного YML файла
      const { users, streamers } = this.accountParser.importFromFile(ymlFilePath);

      // Очищаем текущие данные
      this.senders.clear();
      this.streamers.clear();

      // Загружаем новые пользователи
      for (const user of users) {
        const sender = new KickSender(user, this.logger);
        this.senders.set(user.username, sender);
      }

      // Загружаем новых стримеров
      for (const [key, streamer] of Object.entries(streamers)) {
        this.streamers.set(key, streamer);
      }

      // Перезаписываем целевой YML файл
      this.exportToYaml(targetYmlPath);

      this.logger.info(`Imported ${users.length} users and ${Object.keys(streamers).length} streamers from ${ymlFilePath} and overwrote ${targetYmlPath}`);

    } catch (error) {
      this.logger.error(`Failed to import from YML and overwrite: ${error}`);
      throw error;
    }
  }

  public async broadcastMessageWithSlots(
    streamerNickname: string,
    baseWord: string,
    slotWords: string[],
    options: BroadcastOptions = {},
    stopCallback?: () => boolean,
    progressCallback?: (progress: {
      currentUser: string;
      currentIndex: number;
      totalUsers: number;
      sent: number;
      failed: number;
      result?: SendMessageResponse;
      streamerNickname?: string;
    }) => void
  ): Promise<{ sent: number; failed: number; results: SendMessageResponse[]; stopped?: boolean; reportFile?: string }> {
    // Get streamer info and validate
    const streamer = this.streamers.get(streamerNickname);
    if (!streamer) {
      throw new Error(`Стример "${streamerNickname}" не найден`);
    }

    if (!slotWords || slotWords.length === 0) {
      throw new Error(`Массив слов для ротации пуст`);
    }

    const chatId = streamer.chatId;
    const { concurrency = 5, delayMs = 200, randomDelay } = options;
    const results: SendMessageResponse[] = [];
    let sent = 0;
    let failed = 0;
    const usernames = Array.from(this.senders.keys());
    const totalUsers = usernames.length;
    let processedCount = 0;

    this.logger.info(`Broadcasting message with slots to ${totalUsers} users with concurrency ${concurrency}`);

    let stopped = false;
    const abortController = new AbortController();
    const recentResults: Array<{ username: string; success: boolean; error?: string }> = [];
    let logBatchCounter = 0;
    const messageReport: Array<{ username: string; message: string }> = [];

    const userChunks: { username: string, originalIndex: number }[][] = Array.from({ length: concurrency }, () => []);
    for (let i = 0; i < totalUsers; i++) {
        userChunks[i % concurrency].push({ username: usernames[i], originalIndex: i });
    }

    const workerPromises = userChunks.map(async (chunk) => {
      for (const { username, originalIndex } of chunk) {
        if (stopCallback && stopCallback()) {
          stopped = true;
          abortController.abort();
          break;
        }
        
        const sender = this.senders.get(username);

        if (!sender) {
          const errorResult: SendMessageResponse = {
            success: false,
            error: `User: ${username} - Sender not found`
          };
          results[originalIndex] = errorResult;
          failed++;
        } else {
          try {
            const slotWord = slotWords[originalIndex % slotWords.length];
            const message = `${baseWord} ${slotWord}`;

            const result = await sender.sendMessage(chatId, message, abortController.signal);
            results[originalIndex] = result;

            if (result.success) {
              sent++;
              recentResults.push({ username, success: true });
              messageReport.push({ username, message });
            } else {
              failed++;
              recentResults.push({ username, success: false, error: result.error });
            }
          } catch (error: any) {
            failed++;
            let errorMessage = `Unexpected error: ${error}`;
            if (error.name === 'AbortError' || error.message?.includes('aborted')) {
              errorMessage = `Request cancelled (broadcast stopped)`;
            }
            const errorResult: SendMessageResponse = {
              success: false,
              error: `User: ${username} - ${errorMessage}`
            };
            results[originalIndex] = errorResult;
            recentResults.push({ username, success: false, error: errorMessage });
          }
        }

        processedCount++;

        if (progressCallback) {
          setImmediate(() => {
            progressCallback({
              currentUser: username,
              currentIndex: processedCount,
              totalUsers,
              sent,
              failed,
              result: results[originalIndex],
              streamerNickname: streamerNickname
            });
          });
        }

        logBatchCounter++;
        if (logBatchCounter >= 20) {
          this.logResultsBatch(recentResults);
          recentResults.length = 0;
          logBatchCounter = 0;
        }

        if (randomDelay) {
          const randomWait = Math.floor(Math.random() * (randomDelay.max - randomDelay.min + 1)) + randomDelay.min;
          await this.delay(randomWait);
        } else if (delayMs > 0) {
          await this.delay(delayMs);
        }
      }
    });

    await Promise.all(workerPromises);

    if (recentResults.length > 0) {
      this.logResultsBatch(recentResults);
    }

    let reportFilePath: string | undefined = undefined;
    if (messageReport.length > 0) {
      try {
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        reportFilePath = `./broadcast_slots_report_${timestamp}.txt`;

        let reportContent = `ОТЧЕТ О РАССЫЛКЕ СО СЛОТАМИ\n`;
        reportContent += `Дата: ${new Date().toLocaleString('ru-RU')}\n`;
        reportContent += `Стример: ${streamerNickname}\n`;
        reportContent += `Базовое слово: ${baseWord}\n`;
        reportContent += `Всего отправлено: ${messageReport.length}\n`;
        reportContent += `${'='.repeat(60)}\n\n`;

        messageReport.forEach((entry) => {
          reportContent += `${entry.username} = ${entry.message}\n`;
        });

        writeFileSync(reportFilePath, reportContent, 'utf-8');
        this.logger.info(`Broadcast report created: ${reportFilePath}`);
      } catch (error) {
        this.logger.error(`Failed to create broadcast report: ${error}`);
        reportFilePath = undefined;
      }
    }

    const statusMessage = stopped ? 'stopped by user' : 'completed';
    this.logger.info(`Concurrent broadcast with slots ${statusMessage}: ${sent} sent, ${failed} failed`);
    return { sent, failed, results, stopped, reportFile: reportFilePath };
  }
}