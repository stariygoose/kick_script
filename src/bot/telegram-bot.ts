import { Telegraf, Context, Markup } from 'telegraf';
import { UserManager } from '../managers/user-manager.js';
import { Logger } from '../utils/logger.js';
import { UserConfig, StreamerConfig, BroadcastOptions, SendMessageResponse } from '../types/interfaces.js';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import path from 'path';
import axios from 'axios';

export class TelegramBot {
  private bot: Telegraf;
  private userManager: UserManager;
  private logger: Logger;
  private adminChatId: string;
  private botToken: string;
  private accountsFilePath: string = './accounts.yml';
  private userStates: Map<string, string> = new Map();
  private broadcastOptions: BroadcastOptions = { concurrency: 3, delayMs: 500 };
  private allowedUsers: Set<number> = new Set();
  private lastMessageUpdate: number = 0;
  private messageUpdateThrottle: number = 5000;
  private activeBroadcasts: Map<string, { shouldStop: boolean }> = new Map();
  private updateCounter: number = 0;

  constructor(token: string, adminChatId: string, userManager: UserManager, logger: Logger) {
    this.bot = new Telegraf(token);
    this.userManager = userManager;
    this.logger = logger;
    this.adminChatId = adminChatId;
    this.botToken = token;

    this.loadAllowedUsers();
    this.setupMiddleware();
    this.setupCommands();
    this.setupCallbacks();
  }

  private loadAllowedUsers(): void {
    const allowedUsersEnv = process.env.ALLOWED_USERS;
    if (allowedUsersEnv) {
      const userIds = allowedUsersEnv.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      userIds.forEach(id => this.allowedUsers.add(id));
      this.logger.info(`Loaded ${userIds.length} allowed users`);
    } else {
      this.logger.warn('No ALLOWED_USERS found in environment variables. Bot will be accessible to everyone.');
    }
  }

  private setupMiddleware(): void {
    // Middleware для проверки доступа
    this.bot.use((ctx, next) => {
      const userId = ctx.from?.id;
      
      if (!userId) {
        this.logger.warn('Received message without user ID');
        return;
      }

      // Если список разрешенных пользователей пуст, разрешаем всем
      if (this.allowedUsers.size === 0) {
        return next();
      }

      // Проверяем, есть ли пользователь в списке разрешенных
      if (this.allowedUsers.has(userId)) {
        return next();
      }

      // Логируем попытку несанкционированного доступа
      this.logger.warn(`Unauthorized access attempt from user ID: ${userId}`);
      
      // Отправляем сообщение о запрете доступа
      ctx.reply('🚫 У вас нет доступа к этому боту.');
    });
  }

  private setupCommands(): void {
    this.bot.start((ctx) => {
      if (!this.isAdmin(ctx)) return;
      this.showMainMenu(ctx);
    });

    // Keep command interface for backward compatibility
    this.bot.command('menu', (ctx) => this.showMainMenu(ctx));
    this.bot.command('adduser', (ctx) => this.handleAddUser(ctx));
    this.bot.command('removeuser', (ctx) => this.handleRemoveUser(ctx));
    this.bot.command('searchuser', (ctx) => this.handleSearchUser(ctx));
    this.bot.command('listusers', (ctx) => this.handleListUsers(ctx));
    this.bot.command('broadcast', (ctx) => this.handleBroadcast(ctx));
    this.bot.command('sendmsg', (ctx) => this.handleSendMessage(ctx));
    this.bot.command('reload', (ctx) => this.handleReload(ctx));
    this.bot.command('stats', (ctx) => this.handleStats(ctx));
    this.bot.command('setbroadcast', (ctx) => this.handleSetBroadcast(ctx));
    this.bot.command('export', (ctx) => this.handleExport(ctx));
    this.bot.command('exporttxt', (ctx) => this.handleExportTxt(ctx));
    this.bot.command('importyml', (ctx) => this.handleImportYml(ctx));
    this.bot.command('sendas', (ctx) => this.handleSendAs(ctx));

    this.bot.catch((err: any, ctx) => {
      this.logger.error(`Bot error: ${err}`);
      if (this.isAdmin(ctx)) {
        ctx.reply(`❌ Ошибка: ${err.message || err}`);
      }
    });

    // Handle regular text messages for states
    this.bot.on('text', (ctx) => this.handleTextInput(ctx));
    
    // Handle document uploads
    this.bot.on('document', (ctx) => this.handleDocumentUpload(ctx));
  }

  private setupCallbacks(): void {
    this.bot.action('main_menu', (ctx) => {
      ctx.answerCbQuery();
      this.showMainMenu(ctx);
    });

    this.bot.action('users_menu', (ctx) => {
      ctx.answerCbQuery();
      this.showUsersMenu(ctx);
    });

    this.bot.action('streamers_menu', (ctx) => {
      ctx.answerCbQuery();
      this.showStreamersMenu(ctx);
    });

    this.bot.action('broadcast_menu', (ctx) => {
      ctx.answerCbQuery();
      this.showBroadcastMenu(ctx);
    });

    this.bot.action('files_menu', (ctx) => {
      ctx.answerCbQuery();
      this.showFilesMenu(ctx);
    });

    this.bot.action('add_user', (ctx) => {
      ctx.answerCbQuery();
      this.startAddUserProcess(ctx);
    });

    this.bot.action('remove_user', (ctx) => {
      ctx.answerCbQuery();
      this.startRemoveUserProcess(ctx);
    });

    this.bot.action('list_users', (ctx) => {
      ctx.answerCbQuery();
      this.handleListUsers(ctx);
    });

    this.bot.action('add_streamer', (ctx) => {
      ctx.answerCbQuery();
      this.startAddStreamerProcess(ctx);
    });

    this.bot.action('remove_streamer', (ctx) => {
      ctx.answerCbQuery();
      this.startRemoveStreamerProcess(ctx);
    });

    this.bot.action('list_streamers', (ctx) => {
      ctx.answerCbQuery();
      this.handleListStreamers(ctx);
    });

    this.bot.action('start_broadcast', (ctx) => {
      ctx.answerCbQuery();
      this.startBroadcastProcess(ctx);
    });

    this.bot.action('import_file', (ctx) => {
      ctx.answerCbQuery();
      this.startImportFileProcess(ctx);
    });

    this.bot.action('reload_accounts', (ctx) => {
      ctx.answerCbQuery();
      this.handleReload(ctx);
    });

    this.bot.action('show_stats', (ctx) => {
      ctx.answerCbQuery();
      this.handleStats(ctx);
    });

    this.bot.action('broadcast_settings', (ctx) => {
      ctx.answerCbQuery();
      this.showBroadcastSettings(ctx);
    });

    this.bot.action('set_fast', (ctx) => {
      ctx.answerCbQuery();
      this.setBroadcastPreset(ctx, { concurrency: 3, delayMs: 300 }, 'Быстрый');
    });

    this.bot.action('set_balanced', (ctx) => {
      ctx.answerCbQuery();
      this.setBroadcastPreset(ctx, { concurrency: 3, delayMs: 500 }, 'Балансированный');
    });


    this.bot.action('export_config', (ctx) => {
      ctx.answerCbQuery();
      this.handleExport(ctx);
    });

    this.bot.action('export_txt', (ctx) => {
      ctx.answerCbQuery();
      this.handleExportTxt(ctx);
    });

    this.bot.action('import_yml', (ctx) => {
      ctx.answerCbQuery();
      this.startImportYmlProcess(ctx);
    });

    this.bot.action('send_as_user', (ctx) => {
      ctx.answerCbQuery();
      this.startSendAsUserProcess(ctx);
    });

    this.bot.action(/^stop_broadcast_(.+)$/, (ctx) => {
      const broadcastId = ctx.match![1];
      this.logger.info(`Stop callback received for broadcast: ${broadcastId}`);
      this.handleStopBroadcast(ctx, broadcastId);
      
      // Answer callback query with timeout protection
      ctx.answerCbQuery('Останавливаем рассылку...').catch((error) => {
        this.logger.warn(`Failed to answer callback query: ${error.message}`);
      });
    });
  }

  private isAdmin(ctx: Context): boolean {
    const userId = ctx.from?.id;
    
    if (!userId) {
      return false;
    }

    // Если список разрешенных пользователей пуст, разрешаем всем (обратная совместимость)
    if (this.allowedUsers.size === 0) {
      return true;
    }

    // Проверяем, есть ли пользователь в списке разрешенных
    return this.allowedUsers.has(userId);
  }

  private async handleAddUser(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) return;

    const message = ctx.message as any;
    const args = message?.text?.split(' ').slice(1);
    if (!args || args.length < 2) {
      ctx.reply('❌ Формат: /adduser <username> <token>');
      return;
    }

    const [username, token] = args;

    try {
      const userConfig: UserConfig = {
        username,
        accessToken: token
      };

      this.userManager.addUser(userConfig);
      await this.updateAccountsFile();

      ctx.reply(`✅ Пользователь ${username} добавлен`);
      this.logger.info(`Added user ${username} via Telegram bot`);

    } catch (error) {
      ctx.reply(`❌ Ошибка добавления: ${error}`);
      this.logger.error(`Failed to add user ${username}: ${error}`);
    }
  }

  private async handleRemoveUser(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) return;

    const msg = ctx.message as any;
    const args = msg?.text?.split(' ').slice(1);
    if (!args || args.length < 1) {
      ctx.reply('❌ Формат: /removeuser <username>');
      return;
    }

    const username = args[0];

    try {
      const removed = this.userManager.removeUser(username);

      if (removed) {
        await this.updateAccountsFile();
        ctx.reply(`✅ Пользователь ${username} удален`);
        this.logger.info(`Removed user ${username} via Telegram bot`);
      } else {
        ctx.reply(`❌ Пользователь ${username} не найден`);
      }

    } catch (error) {
      ctx.reply(`❌ Ошибка удаления: ${error}`);
      this.logger.error(`Failed to remove user ${username}: ${error}`);
    }
  }

  private async handleSearchUser(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) return;

    const searchMsg = ctx.message as any;
    const args = searchMsg?.text?.split(' ').slice(1);
    if (!args || args.length < 1) {
      ctx.reply('❌ Формат: /searchuser <username>');
      return;
    }

    const username = args[0];
    const sender = this.userManager.getSender(username);

    if (sender) {
      ctx.reply(`✅ Пользователь найден: ${username}`);
    } else {
      ctx.reply(`❌ Пользователь ${username} не найден`);
    }
  }

  private async handleListUsers(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) return;

    const usernames = this.userManager.getAllUsernames();

    if (usernames.length === 0) {
      ctx.reply('📋 Нет загруженных пользователей');
      return;
    }

    const userList = usernames.map((username, index) => `${index + 1}. ${username}`).join('\n');
    ctx.reply(`📋 Загружено пользователей (${usernames.length}):\n\n${userList}`);
  }

  private async handleBroadcast(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) return;

    const broadcastMsg = ctx.message as any;
    const args = broadcastMsg?.text?.split(' ').slice(1);
    if (!args || args.length < 2) {
      ctx.reply('❌ Формат: /broadcast <streamer_nickname> <message>');
      return;
    }

    const streamerNickname = args[0];
    const message = args.slice(1).join(' ');

    const broadcastId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.activeBroadcasts.set(broadcastId, { shouldStop: false });
    this.updateCounter = 0; // Reset counter for new broadcast
    this.logger.info(`Created broadcast ${broadcastId}`);

    try {

      const stopKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🛑 ОСТАНОВИТЬ РАССЫЛКУ', `stop_broadcast_${broadcastId}`)]
      ]);
      this.logger.info(`Created stop button for broadcast ${broadcastId}`);

      const statusMessage = await ctx.reply('🚀 Начинаю рассылку...', stopKeyboard);
      const startTime = Date.now();

      const result = await this.userManager.broadcastMessageConcurrent(streamerNickname, message, this.broadcastOptions, () => this.getBroadcastStopStatus(broadcastId), (progress) => {
        const percentage = Math.round((progress.currentIndex / progress.totalUsers) * 100);
        const progressBar = this.createProgressBar(percentage);

        let statusText = `📢 Рассылка сообщений\n\n`;
        statusText += `${progressBar} ${percentage}%\n\n`;
        statusText += `👤 Текущий пользователь: ${progress.currentUser}\n`;
        statusText += `📊 Прогресс: ${progress.currentIndex}/${progress.totalUsers}\n`;
        statusText += `✅ Отправлено: ${progress.sent}\n`;
        statusText += `❌ Ошибок: ${progress.failed}\n`;

        if (progress.streamerNickname) {
          statusText += `🎬 Стример: ${progress.streamerNickname}\n`;
        }

        if (progress.result && !progress.result.success) {
          statusText += `\n⚠️ Последняя ошибка:\n${progress.result.error}\n`;
        }

        // Update status message with rate limiting protection (only every 5th update)
        this.updateCounter++;
        if (this.updateCounter % 5 === 0) {
          this.updateTelegramMessage(ctx, statusMessage.message_id, statusText, stopKeyboard);
        }
      });

      // Calculate execution time
      const endTime = Date.now();
      const executionTime = Math.round((endTime - startTime) / 1000);

      // Prepare detailed summary
      const total = result.sent + result.failed;
      const successRate = total > 0 ? Math.round((result.sent / total) * 100) : 0;
      
      let finalMessage = result.stopped 
        ? `🛑 Рассылка остановлена!\n\n📊 ИТОГИ:\n`
        : `✅ Рассылка завершена!\n\n📊 ИТОГИ:\n`;
      
      finalMessage += `👥 Всего пользователей: ${total}\n`;
      finalMessage += `✅ Успешно отправлено: ${result.sent}\n`;
      finalMessage += `❌ Ошибок: ${result.failed}\n`;
      finalMessage += `📈 Успешность: ${successRate}%\n`;
      finalMessage += `⏱️ Время выполнения: ${executionTime} секунд\n`;

      // Create error file if there were failures
      let errorFile = null;
      if (result.failed > 0) {
        errorFile = await this.createErrorFile(result.results);
      }

      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        statusMessage.message_id,
        undefined,
        finalMessage
      );

      // Send error file if errors occurred
      if (errorFile) {
        await this.sendErrorFile(ctx, errorFile);
      }

      // Clean up broadcast tracking
      this.activeBroadcasts.delete(broadcastId);

      this.logger.info(`Broadcast completed via Telegram bot: ${result.sent} sent, ${result.failed} failed`);

    } catch (error) {
      // Clean up broadcast tracking on error
      this.activeBroadcasts.delete(broadcastId);
      ctx.reply(`❌ Ошибка рассылки: ${error}`);
      this.logger.error(`Broadcast failed via Telegram bot: ${error}`);
    }
  }

  private async handleSendMessage(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) return;

    const sendMsg = ctx.message as any;
    const args = sendMsg?.text?.split(' ').slice(1);
    if (!args || args.length < 3) {
      ctx.reply('❌ Формат: /sendmsg <username> <streamer_nickname> <message>');
      return;
    }

    const username = args[0];
    const streamerNickname = args[1];
    const message = args.slice(2).join(' ');

    try {
      const result = await this.userManager.sendMessageFromUser(username, streamerNickname, message);

      if (result.success) {
        ctx.reply(`✅ Сообщение отправлено от ${username}`);
        this.logger.info(`Message sent from ${username} via Telegram bot`);
      } else {
        ctx.reply(`❌ Ошибка отправки от ${username}: ${result.error}`);
      }

    } catch (error) {
      ctx.reply(`❌ Ошибка: ${error}`);
      this.logger.error(`Failed to send message from ${username} via Telegram bot: ${error}`);
    }
  }

  private async handleReload(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) return;

    try {
      await this.userManager.loadAccountsFromFile(this.accountsFilePath);
      const count = this.userManager.getUserCount();

      ctx.reply(`✅ Аккаунты перезагружены! Загружено: ${count}`);
      this.logger.info(`Accounts reloaded via Telegram bot: ${count} accounts`);

    } catch (error) {
      ctx.reply(`❌ Ошибка перезагрузки: ${error}`);
      this.logger.error(`Failed to reload accounts via Telegram bot: ${error}`);
    }
  }

  private async handleStats(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) return;

    const userCount = this.userManager.getUserCount();
    const streamersCount = this.userManager.getAllStreamerNicknames().length;

    // Calculate estimated broadcast time
    const estimatedTime = Math.ceil(userCount / (this.broadcastOptions.concurrency || 1)) * ((this.broadcastOptions.delayMs || 0) / 1000);

    ctx.reply(`📊 Статистика:
👥 Всего аккаунтов: ${userCount}
🎬 Всего стримеров: ${streamersCount}
📝 Файл: ${this.accountsFilePath}
🤖 Бот активен: ✅

⚡ Настройки рассылки:
🔄 Конкурентность: ${this.broadcastOptions.concurrency}
⏱️ Задержка: ${this.broadcastOptions.delayMs}ms
📈 Примерное время рассылки: ~${estimatedTime}с`);
  }

  private async handleSetBroadcast(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) return;

    const msg = ctx.message as any;
    const args = msg?.text?.split(' ').slice(1);
    if (!args || args.length < 2) {
      ctx.reply(`❌ Формат: /setbroadcast <concurrency> <delayMs>

Текущие настройки:
🔄 Конкурентность: ${this.broadcastOptions.concurrency}
⏱️ Задержка: ${this.broadcastOptions.delayMs}ms

Пример: /setbroadcast 3 300`);
      return;
    }

    const concurrency = parseInt(args[0]);
    const delayMs = parseInt(args[1]);

    if (isNaN(concurrency) || isNaN(delayMs) || concurrency < 1 || concurrency > 10 || delayMs < 0) {
      ctx.reply('❌ Неверные параметры!\nКонкурентность: 1-10\nЗадержка: >= 0');
      return;
    }

    this.broadcastOptions = { concurrency, delayMs };

    // Calculate new estimated time
    const userCount = this.userManager.getUserCount();
    const estimatedTime = Math.ceil(userCount / concurrency) * (delayMs / 1000);

    ctx.reply(`✅ Настройки рассылки обновлены!
🔄 Конкурентность: ${concurrency}
⏱️ Задержка: ${delayMs}ms
📈 Примерное время рассылки: ~${estimatedTime}с`);

    this.logger.info(`Broadcast settings updated: concurrency=${concurrency}, delay=${delayMs}ms`);
  }

  private async handleExport(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) return;

    try {
      const exportPath = `./export_${Date.now()}.yml`;
      
      // Экспортируем конфигурацию в временный файл
      this.userManager.exportToYaml(exportPath);
      
      // Отправляем файл пользователю
      await ctx.replyWithDocument({
        source: exportPath,
        filename: `users_config_${new Date().toISOString().split('T')[0]}.yml`
      }, {
        caption: `📤 Экспорт конфигурации пользователей (YML)\n\n👥 Всего пользователей: ${this.userManager.getUserCount()}\n🎬 Всего стримеров: ${this.userManager.getAllStreamerNicknames().length}`,
        ...this.getBackToMenuKeyboard()
      });

      // Удаляем временный файл
      if (existsSync(exportPath)) {
        unlinkSync(exportPath);
      }

      this.logger.info(`YML configuration exported and sent to user via Telegram bot`);

    } catch (error) {
      ctx.reply(`❌ Ошибка экспорта YML: ${error}`, this.getBackToMenuKeyboard());
      this.logger.error(`Failed to export YML configuration: ${error}`);
    }
  }

  private async handleExportTxt(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) return;

    try {
      const exportPath = `./export_${Date.now()}.txt`;
      
      // Экспортируем в текстовый формат
      this.userManager.exportToTextFile(exportPath);
      
      // Отправляем файл пользователю
      await ctx.replyWithDocument({
        source: exportPath,
        filename: `users_accounts_${new Date().toISOString().split('T')[0]}.txt`
      }, {
        caption: `📄 Экспорт аккаунтов в .txt формат\n\nФормат: username=userId|token\n👥 Всего пользователей: ${this.userManager.getUserCount()}`,
        ...this.getBackToMenuKeyboard()
      });

      // Удаляем временный файл
      if (existsSync(exportPath)) {
        unlinkSync(exportPath);
      }

      this.logger.info(`TXT configuration exported and sent to user via Telegram bot`);

    } catch (error) {
      ctx.reply(`❌ Ошибка экспорта TXT: ${error}`, this.getBackToMenuKeyboard());
      this.logger.error(`Failed to export TXT configuration: ${error}`);
    }
  }

  private async handleImportYml(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) return;

    const userId = this.getUserId(ctx);
    const state = this.userStates.get(userId);

    if (state !== 'waiting_yml_upload') {
      ctx.reply('❌ Неожиданная команда. Используйте кнопку "Импорт YML с перезаписью" в меню файлов.', this.getBackToMenuKeyboard());
      return;
    }

    const message = ctx.message as any;
    const document = message?.document;

    if (!document) {
      ctx.reply('❌ Не удалось получить файл', this.getBackToMenuKeyboard());
      return;
    }

    this.userStates.delete(userId);

    try {
      // Показываем сообщение о процессе
      const processingMsg = await ctx.reply('🔄 Обрабатываю YML файл и перезаписываю конфиг...');

      // Получаем файл из Telegram
      const fileInfo = await ctx.telegram.getFile(document.file_id);
      
      if (!fileInfo.file_path) {
        ctx.reply('❌ Не удалось получить путь к файлу', this.getBackToMenuKeyboard());
        return;
      }

      // Скачиваем файл
      const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${fileInfo.file_path}`;
      const response = await axios.get(fileUrl, { responseType: 'text' });
      
      // Сохраняем во временный файл
      const tempPath = `./temp_import_${Date.now()}.yml`;
      writeFileSync(tempPath, response.data, 'utf-8');

      // Импортируем с перезаписью
      this.userManager.importFromYmlAndOverwrite(tempPath, this.accountsFilePath);
      
      // Получаем статистику
      const userCount = this.userManager.getUserCount();
      const streamersCount = this.userManager.getAllStreamerNicknames().length;
      
      // Удаляем временный файл
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
      
      // Обновляем сообщение с результатом
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        processingMsg.message_id,
        undefined,
        `✅ Импорт YML завершен успешно!\n\n📁 Файл: ${document.file_name}\n👥 Загружено пользователей: ${userCount}\n🎬 Загружено стримеров: ${streamersCount}\n🔄 Конфиг перезаписан: ${this.accountsFilePath}`,
        this.getBackToMenuKeyboard()
      );
      
    } catch (error) {
      ctx.reply(`❌ Ошибка импорта YML: ${error}`, this.getBackToMenuKeyboard());
      this.logger.error(`YML import failed: ${error}`);
    }
  }

  private startImportYmlProcess(ctx: Context): void {
    const userId = this.getUserId(ctx);
    this.userStates.set(userId, 'waiting_yml_upload');
    ctx.editMessageText('📥 Импорт YML с перезаписью\n\nЗагрузите YML файл с конфигурацией пользователей и стримеров.\n⚠️ ВНИМАНИЕ: Это полностью перезапишет текущий конфиг!\n\n📎 Прикрепите файл как документ');
  }

  private async updateAccountsFile(): Promise<void> {
    try {
      // Export current state to the watched file
      this.userManager.exportToYaml(this.accountsFilePath);
      this.logger.info(`Updated accounts file: ${this.accountsFilePath}`);
    } catch (error) {
      this.logger.error(`Failed to update accounts file: ${error}`);
      throw error;
    }
  }

  public async start(): Promise<void> {
    try {
      await this.bot.launch();
      this.logger.info('Telegram bot started successfully');
      console.log('🤖 Telegram bot is running...');
    } catch (error) {
      this.logger.error(`Failed to start Telegram bot: ${error}`);
      throw error;
    }
  }

  private showMainMenu(ctx: Context): void {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('👥 Управление пользователями', 'users_menu')],
      [Markup.button.callback('🎬 Управление стримерами', 'streamers_menu')],
      [Markup.button.callback('📢 Рассылка сообщений', 'broadcast_menu')],
      [Markup.button.callback('💬 Отправить от пользователя', 'send_as_user')],
      [Markup.button.callback('⚡ Настройки рассылки', 'broadcast_settings')],
      [Markup.button.callback('📁 Файлы', 'files_menu')],
      [Markup.button.callback('📊 Статистика', 'show_stats')],
    ]);

    const message = `🤖 Kick Bot Manager

Выберите действие:`;

    if (ctx.callbackQuery) {
      // Попытаемся отредактировать, если не получится - отправим новое сообщение
      ctx.editMessageText(message, keyboard).catch(() => {
        ctx.reply(message, keyboard);
      });
    } else {
      ctx.reply(message, keyboard);
    }
  }

  private showUsersMenu(ctx: Context): void {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('➕ Добавить пользователя', 'add_user')],
      [Markup.button.callback('➖ Удалить пользователя', 'remove_user')],
      [Markup.button.callback('📋 Список пользователей', 'list_users')],
      [Markup.button.callback('⬅️ Назад', 'main_menu')],
    ]);

    const message = `👥 Управление пользователями

Всего пользователей: ${this.userManager.getUserCount()}`;

    ctx.editMessageText(message, keyboard).catch(() => {
      ctx.reply(message, keyboard);
    });
  }

  private showStreamersMenu(ctx: Context): void {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('➕ Добавить стримера', 'add_streamer')],
      [Markup.button.callback('➖ Удалить стримера', 'remove_streamer')],
      [Markup.button.callback('📋 Список стримеров', 'list_streamers')],
      [Markup.button.callback('⬅️ Назад', 'main_menu')],
    ]);

    const message = `🎬 Управление стримерами

Всего стримеров: ${this.userManager.getAllStreamerNicknames().length}`;

    ctx.editMessageText(message, keyboard).catch(() => {
      ctx.reply(message, keyboard);
    });
  }

  private showBroadcastMenu(ctx: Context): void {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📢 Начать рассылку', 'start_broadcast')],
      [Markup.button.callback('⬅️ Назад', 'main_menu')],
    ]);

    const message = `📢 Рассылка сообщений

Готово к рассылке пользователей: ${this.userManager.getUserCount()}`;

    ctx.editMessageText(message, keyboard).catch(() => {
      ctx.reply(message, keyboard);
    });
  }

  private showFilesMenu(ctx: Context): void {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📄 Импорт из .txt файла', 'import_file')],
      [Markup.button.callback('📄 Экспорт в .txt', 'export_txt')],
      [Markup.button.callback('📥 Импорт YML с перезаписью', 'import_yml')],
      [Markup.button.callback('📤 Экспорт конфига YML', 'export_config')],
      [Markup.button.callback('🔄 Перезагрузить файл', 'reload_accounts')],
      [Markup.button.callback('⬅️ Назад', 'main_menu')],
    ]);

    const message = `📁 Управление файлами

Текущий файл: ${this.accountsFilePath}`;

    ctx.editMessageText(message, keyboard).catch(() => {
      ctx.reply(message, keyboard);
    });
  }

  private showBroadcastSettings(ctx: Context): void {
    const userCount = this.userManager.getUserCount();
    const estimatedTime = Math.ceil(userCount / (this.broadcastOptions.concurrency || 1)) * ((this.broadcastOptions.delayMs || 0) / 1000);

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('⚡ Быстро (3 потока, 300ms)', 'set_fast')],
      [Markup.button.callback('⚖️ Балансированно (3 потока, 500ms)', 'set_balanced')],
      [Markup.button.callback('⬅️ Назад', 'main_menu')],
    ]);

    const message = `⚡ Настройки рассылки

Текущие параметры:
🔄 Конкурентность: ${this.broadcastOptions.concurrency}
⏱️ Задержка: ${this.broadcastOptions.delayMs}ms
📈 Время рассылки ${userCount} сообщений: ~${estimatedTime}с

Выберите пресет или используйте /setbroadcast <потоки> <задержка>:`;

    ctx.editMessageText(message, keyboard).catch(() => {
      ctx.reply(message, keyboard);
    });
  }

  private setBroadcastPreset(ctx: Context, options: BroadcastOptions, presetName: string): void {
    this.broadcastOptions = options;

    const userCount = this.userManager.getUserCount();
    const estimatedTime = Math.ceil(userCount / (options.concurrency || 1)) * ((options.delayMs || 0) / 1000);

    ctx.reply(`✅ Применен пресет "${presetName}"!
🔄 Конкурентность: ${options.concurrency}
⏱️ Задержка: ${options.delayMs}ms
📈 Новое время рассылки: ~${estimatedTime}с`);

    this.logger.info(`Broadcast preset "${presetName}" applied: concurrency=${options.concurrency}, delay=${options.delayMs}ms`);

    // Show updated settings
    setTimeout(() => this.showBroadcastSettings(ctx), 2000);
  }

  private startAddUserProcess(ctx: Context): void {
    const userId = this.getUserId(ctx);
    this.userStates.set(userId, 'waiting_user_data');
    ctx.editMessageText('➕ Добавление пользователя\n\nВведите данные в формате:\nusername token');
  }

  private startRemoveUserProcess(ctx: Context): void {
    const userId = this.getUserId(ctx);
    this.userStates.set(userId, 'waiting_username_to_remove');
    ctx.editMessageText('➖ Удаление пользователя\n\nВведите username пользователя для удаления:');
  }

  private startAddStreamerProcess(ctx: Context): void {
    const userId = this.getUserId(ctx);
    this.userStates.set(userId, 'waiting_streamer_data');
    ctx.editMessageText('➕ Добавление стримера\n\nВведите данные в формате:\nnickname chatId');
  }

  private startRemoveStreamerProcess(ctx: Context): void {
    const userId = this.getUserId(ctx);
    this.userStates.set(userId, 'waiting_streamer_to_remove');
    ctx.editMessageText('➖ Удаление стримера\n\nВведите nickname стримера для удаления:');
  }

  private startBroadcastProcess(ctx: Context): void {
    const userId = this.getUserId(ctx);
    this.userStates.set(userId, 'waiting_broadcast_data');
    
    const streamers = this.userManager.getAllStreamerNicknames();
    const streamersList = streamers.length > 0 ? `\n\n📺 Доступные стримеры:\n${streamers.join(', ')}` : '';
    
    ctx.editMessageText(`📢 Рассылка сообщений\n\nВведите данные в формате:\nstreamer_nickname message${streamersList}`);
  }

  private startImportFileProcess(ctx: Context): void {
    const userId = this.getUserId(ctx);
    this.userStates.set(userId, 'waiting_file_upload');
    ctx.editMessageText('📄 Импорт из .txt файла\n\nЗагрузите текстовый (.txt) файл с аккаунтами в формате:\nusername=userId|token\n\n📎 Прикрепите файл как документ');
  }

  private async handleTextInput(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) return;

    const userId = this.getUserId(ctx);
    const state = this.userStates.get(userId);
    const message = ctx.message as any;
    const text = message?.text;

    if (!state || !text) return;

    this.userStates.delete(userId);

    switch (true) {
      case state === 'waiting_user_data':
        await this.processAddUser(ctx, text);
        break;
      case state === 'waiting_username_to_remove':
        await this.processRemoveUser(ctx, text);
        break;
      case state === 'waiting_streamer_data':
        await this.processAddStreamer(ctx, text);
        break;
      case state === 'waiting_streamer_to_remove':
        await this.processRemoveStreamer(ctx, text);
        break;
      case state === 'waiting_broadcast_data':
        await this.processBroadcast(ctx, text);
        break;
      case state === 'waiting_send_as_user_data':
        await this.processSendAsUserData(ctx, text);
        break;
    }
  }

  private async processAddUser(ctx: Context, input: string): Promise<void> {
    const parts = input.trim().split(' ');
    if (parts.length < 2) {
      ctx.reply('❌ Неверный формат. Используйте: username token');
      return;
    }

    const [username, token] = parts;
    try {
      const userConfig: UserConfig = { username, accessToken: token };
      this.userManager.addUser(userConfig);
      await this.updateAccountsFile();
      ctx.reply(`✅ Пользователь ${username} добавлен`, this.getBackToMenuKeyboard());
    } catch (error) {
      ctx.reply(`❌ Ошибка добавления: ${error}`, this.getBackToMenuKeyboard());
    }
  }

  private async processRemoveUser(ctx: Context, username: string): Promise<void> {
    try {
      const removed = this.userManager.removeUser(username.trim());
      if (removed) {
        await this.updateAccountsFile();
        ctx.reply(`✅ Пользователь ${username} удален`, this.getBackToMenuKeyboard());
      } else {
        ctx.reply(`❌ Пользователь ${username} не найден`, this.getBackToMenuKeyboard());
      }
    } catch (error) {
      ctx.reply(`❌ Ошибка удаления: ${error}`, this.getBackToMenuKeyboard());
    }
  }

  private async processAddStreamer(ctx: Context, input: string): Promise<void> {
    const parts = input.trim().split(' ');
    if (parts.length < 2) {
      ctx.reply('❌ Неверный формат. Используйте: nickname chatId');
      return;
    }

    const [nickname, chatId] = parts;
    try {
      const streamerConfig: StreamerConfig = { nickname, chatId };
      this.userManager.addStreamer(nickname, streamerConfig);
      await this.updateAccountsFile();
      ctx.reply(`✅ Стример ${nickname} добавлен`, this.getBackToMenuKeyboard());
    } catch (error) {
      ctx.reply(`❌ Ошибка добавления стримера: ${error}`, this.getBackToMenuKeyboard());
    }
  }

  private async processRemoveStreamer(ctx: Context, nickname: string): Promise<void> {
    try {
      const trimmedNickname = nickname.trim();
      const streamer = this.userManager.getStreamer(trimmedNickname);
      
      if (!streamer) {
        ctx.reply(`❌ Стример ${trimmedNickname} не найден`, this.getBackToMenuKeyboard());
        return;
      }

      this.userManager.removeStreamer(trimmedNickname);
      await this.updateAccountsFile();
      ctx.reply(`✅ Стример ${trimmedNickname} удален`, this.getBackToMenuKeyboard());
    } catch (error) {
      ctx.reply(`❌ Ошибка удаления стримера: ${error}`, this.getBackToMenuKeyboard());
    }
  }

  private async processBroadcast(ctx: Context, input: string): Promise<void> {
    const parts = input.trim().split(' ');
    if (parts.length < 2) {
      ctx.reply('❌ Неверный формат. Используйте: streamer_nickname message');
      return;
    }

    const streamerNickname = parts[0];
    const message = parts.slice(1).join(' ');

    const broadcastId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.activeBroadcasts.set(broadcastId, { shouldStop: false });
    this.updateCounter = 0; // Reset counter for new broadcast
    this.logger.info(`Created broadcast ${broadcastId}`);

    try {

      const stopKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🛑 ОСТАНОВИТЬ РАССЫЛКУ', `stop_broadcast_${broadcastId}`)]
      ]);
      this.logger.info(`Created stop button for broadcast ${broadcastId}`);

      const statusMessage = await ctx.reply('🚀 Начинаю рассылку...', stopKeyboard);
      const startTime = Date.now();

      const result = await this.userManager.broadcastMessageConcurrent(streamerNickname, message, this.broadcastOptions, () => this.getBroadcastStopStatus(broadcastId), (progress) => {
        const percentage = Math.round((progress.currentIndex / progress.totalUsers) * 100);
        const progressBar = this.createProgressBar(percentage);

        let statusText = `📢 Рассылка сообщений\n\n`;
        statusText += `${progressBar} ${percentage}%\n\n`;
        statusText += `👤 Текущий пользователь: ${progress.currentUser}\n`;
        statusText += `📊 Прогресс: ${progress.currentIndex}/${progress.totalUsers}\n`;
        statusText += `✅ Отправлено: ${progress.sent}\n`;
        statusText += `❌ Ошибок: ${progress.failed}\n`;

        if (progress.streamerNickname) {
          statusText += `🎬 Стример: ${progress.streamerNickname}\n`;
        }

        if (progress.result && !progress.result.success) {
          statusText += `\n⚠️ Последняя ошибка:\n${progress.result.error}\n`;
        }

        // Update status message with rate limiting protection (only every 5th update)
        this.updateCounter++;
        if (this.updateCounter % 5 === 0) {
          this.updateTelegramMessage(ctx, statusMessage.message_id, statusText, stopKeyboard);
        }
      });

      // Calculate execution time
      const endTime = Date.now();
      const executionTime = Math.round((endTime - startTime) / 1000);

      // Prepare detailed summary
      const total = result.sent + result.failed;
      const successRate = total > 0 ? Math.round((result.sent / total) * 100) : 0;
      
      let finalMessage = result.stopped 
        ? `🛑 Рассылка остановлена!\n\n📊 ИТОГИ:\n`
        : `✅ Рассылка завершена!\n\n📊 ИТОГИ:\n`;
      
      finalMessage += `👥 Всего пользователей: ${total}\n`;
      finalMessage += `✅ Успешно отправлено: ${result.sent}\n`;
      finalMessage += `❌ Ошибок: ${result.failed}\n`;
      finalMessage += `📈 Успешность: ${successRate}%\n`;
      finalMessage += `⏱️ Время выполнения: ${executionTime} секунд\n`;

      // Create error file if there were failures
      let errorFile = null;
      if (result.failed > 0) {
        errorFile = await this.createErrorFile(result.results);
      }

      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        statusMessage.message_id,
        undefined,
        finalMessage,
        this.getBackToMenuKeyboard()
      );

      // Send error file if errors occurred
      if (errorFile) {
        await this.sendErrorFile(ctx, errorFile);
      }

      // Clean up broadcast tracking
      this.activeBroadcasts.delete(broadcastId);

    } catch (error) {
      // Clean up broadcast tracking on error
      this.activeBroadcasts.delete(broadcastId);
      ctx.reply(`❌ Ошибка рассылки: ${error}`, this.getBackToMenuKeyboard());
    }
  }

  private async processSendAsUserData(ctx: Context, input: string): Promise<void> {
    const parts = input.trim().split(' ');
    if (parts.length < 3) {
      ctx.reply('❌ Неверный формат. Используйте: username streamer_nickname message', this.getBackToMenuKeyboard());
      return;
    }

    const username = parts[0];
    const streamerNickname = parts[1];
    const message = parts.slice(2).join(' ');

    try {
      const result = await this.userManager.sendMessageFromUser(username, streamerNickname, message);

      if (result.success) {
        ctx.reply(`✅ Сообщение отправлено от пользователя ${username}`, this.getBackToMenuKeyboard());
        this.logger.info(`Message sent from ${username} via Telegram bot interface`);
      } else {
        ctx.reply(`❌ Ошибка отправки от ${username}: ${result.error}`, this.getBackToMenuKeyboard());
      }

    } catch (error) {
      ctx.reply(`❌ Ошибка: ${error}`, this.getBackToMenuKeyboard());
      this.logger.error(`Failed to send message from ${username} via Telegram bot interface: ${error}`);
    }
  }

  private async processImportFile(ctx: Context, filePath: string): Promise<void> {
    try {
      const trimmedPath = filePath.trim();
      
      // Import from file and overwrite YAML file
      this.userManager.importFromFileAndOverwriteYaml(trimmedPath, this.accountsFilePath);
      
      // Get the count of imported users
      const userCount = this.userManager.getUserCount();
      
      ctx.reply(`✅ Импорт завершен успешно!\n\n📁 Файл: ${trimmedPath}\n📊 Импортировано пользователей: ${userCount}\n🔄 YAML файл обновлен: ${this.accountsFilePath}`, this.getBackToMenuKeyboard());
      
    } catch (error) {
      ctx.reply(`❌ Ошибка импорта: ${error}`, this.getBackToMenuKeyboard());
    }
  }

  private async handleDocumentUpload(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) return;

    const userId = this.getUserId(ctx);
    const state = this.userStates.get(userId);

    if (state === 'waiting_file_upload') {
      await this.processTextFileUpload(ctx);
    } else if (state === 'waiting_yml_upload') {
      await this.handleImportYml(ctx);
    }
  }

  private async processTextFileUpload(ctx: Context): Promise<void> {
    const userId = this.getUserId(ctx);
    this.userStates.delete(userId);

    const message = ctx.message as any;
    const document = message?.document;

    if (!document) {
      ctx.reply('❌ Не удалось получить файл', this.getBackToMenuKeyboard());
      return;
    }

    try {
      // Show processing message
      const processingMsg = await ctx.reply('🔄 Обрабатываю файл...');

      // Get file info from Telegram
      const fileInfo = await ctx.telegram.getFile(document.file_id);
      
      if (!fileInfo.file_path) {
        ctx.reply('❌ Не удалось получить путь к файлу', this.getBackToMenuKeyboard());
        return;
      }

      // Download file from Telegram
      const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${fileInfo.file_path}`;
      const response = await axios.get(fileUrl, { responseType: 'text' });
      const fileContent = response.data;

      // Import from file content and overwrite YAML file
      this.userManager.importFromTextAndOverwriteYaml(fileContent, this.accountsFilePath);
      
      // Get the count of imported users
      const userCount = this.userManager.getUserCount();
      
      // Update processing message with result
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        processingMsg.message_id,
        undefined,
        `✅ Импорт завершен успешно!\n\n📁 Файл: ${document.file_name}\n📊 Импортировано пользователей: ${userCount}\n🔄 YAML файл обновлен: ${this.accountsFilePath}`,
        this.getBackToMenuKeyboard()
      );
      
    } catch (error) {
      ctx.reply(`❌ Ошибка импорта: ${error}`, this.getBackToMenuKeyboard());
      this.logger.error(`Document import failed: ${error}`);
    }
  }

  private createProgressBar(percentage: number): string {
    const totalBars = 10;
    const filledBars = Math.round((percentage / 100) * totalBars);
    const emptyBars = totalBars - filledBars;

    return '█'.repeat(filledBars) + '░'.repeat(emptyBars);
  }

  private handleListStreamers(ctx: Context): void {
    const streamers = this.userManager.getAllStreamerNicknames();

    if (streamers.length === 0) {
      ctx.reply('📋 Нет загруженных стримеров', this.getBackToMenuKeyboard());
      return;
    }

    const streamerList = streamers.map((nickname, index) => {
      const streamer = this.userManager.getStreamer(nickname);
      return `${index + 1}. ${nickname} (${streamer?.chatId})`;
    }).join('\n');

    ctx.reply(`📋 Загружено стримеров (${streamers.length}):\n\n${streamerList}`, this.getBackToMenuKeyboard());
  }


  private getBackToMenuKeyboard() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]);
  }

  private getUserId(ctx: Context): string {
    return ctx.from?.id.toString() || 'unknown';
  }

  private async handleSendAs(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) return;

    const message = ctx.message as any;
    const args = message?.text?.split(' ').slice(1);
    if (!args || args.length < 3) {
      ctx.reply('❌ Формат: /sendas <username> <streamer_nickname> <message>');
      return;
    }

    const username = args[0];
    const streamerNickname = args[1];
    const messageText = args.slice(2).join(' ');

    try {
      const result = await this.userManager.sendMessageFromUser(username, streamerNickname, messageText);

      if (result.success) {
        ctx.reply(`✅ Сообщение отправлено от ${username}`);
        this.logger.info(`Message sent from ${username} via Telegram bot`);
      } else {
        ctx.reply(`❌ Ошибка отправки от ${username}: ${result.error}`);
      }

    } catch (error) {
      ctx.reply(`❌ Ошибка: ${error}`);
      this.logger.error(`Failed to send message from ${username} via Telegram bot: ${error}`);
    }
  }

  private startSendAsUserProcess(ctx: Context): void {
    const userId = this.getUserId(ctx);
    this.userStates.set(userId, 'waiting_send_as_user_data');
    
    const userCount = this.userManager.getUserCount();
    const streamers = this.userManager.getAllStreamerNicknames();
    const streamersList = streamers.length > 0 ? `\n\n📺 Доступные стримеры:\n${streamers.join(', ')}` : '';
    
    ctx.editMessageText(`💬 Отправка сообщения от пользователя\n\nВведите данные в формате:\nusername streamer_nickname message\n\nПример: makar4ik shroud Привет!${streamersList}\n\n👥 Доступно пользователей: ${userCount}`);
  }

  private handleStopBroadcast(ctx: Context, broadcastId: string): void {
    this.logger.info(`Stop requested for broadcast ${broadcastId}`);
    const broadcast = this.activeBroadcasts.get(broadcastId);
    
    if (!broadcast) {
      this.logger.warn(`Broadcast ${broadcastId} not found in active broadcasts`);
      ctx.reply('❌ Рассылка уже завершена или не найдена').catch(() => {});
      return;
    }

    broadcast.shouldStop = true;
    this.logger.info(`Broadcast ${broadcastId} stop flag set to true`);
    
    // Don't send reply here - will be handled by broadcast completion
  }

  public getBroadcastStopStatus(broadcastId: string): boolean {
    const broadcast = this.activeBroadcasts.get(broadcastId);
    const shouldStop = broadcast?.shouldStop || false;
    if (shouldStop) {
      this.logger.info(`getBroadcastStopStatus: Broadcast ${broadcastId} should stop = true`);
    }
    return shouldStop;
  }

  private async updateTelegramMessage(ctx: Context, messageId: number, text: string, keyboard?: any): Promise<void> {
    const now = Date.now();
    
    if (now - this.lastMessageUpdate < this.messageUpdateThrottle) {
      return;
    }
    
    this.lastMessageUpdate = now;
    
    if (text.length > 4096) {
      text = text.substring(0, 4090) + '...';
    }
    
    try {
      // Add timeout to prevent hanging
      await Promise.race([
        ctx.telegram.editMessageText(
          ctx.chat?.id,
          messageId,
          undefined,
          text,
          keyboard
        ),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Update timeout')), 10000)
        )
      ]);
    } catch (error: any) {
      if (error.message === 'Update timeout') {
        this.logger.warn('Telegram message update timeout, increasing throttle');
        this.messageUpdateThrottle = Math.min(this.messageUpdateThrottle * 1.5, 15000);
        return;
      }
      
      if (error.code === 429) {
        const retryAfter = error.parameters?.retry_after || 10;
        this.logger.warn(`Telegram rate limited, retry after ${retryAfter}s`);
        this.messageUpdateThrottle = Math.max(this.messageUpdateThrottle, retryAfter * 1000);
        return;
      }
      
      if (error.code === 400 && (
        error.description?.includes('not modified') || 
        error.description?.includes('message is not modified')
      )) {
        return;
      }
      
      // Don't log other telegram errors to reduce noise
      if (!error.description?.includes('Bad Request')) {
        this.logger.warn(`Telegram message update failed: ${error.message}`);
      }
    }
  }

  private async createErrorFile(results: SendMessageResponse[]): Promise<string | null> {
    try {
      const failedResults = results.filter(r => !r.success);
      
      if (failedResults.length === 0) {
        return null;
      }

      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const errorFilePath = path.resolve(`./broadcast_errors_${timestamp}.txt`);
      
      let errorContent = `ДЕТАЛЬНЫЙ ОТЧЕТ ОБ ОШИБКАХ РАССЫЛКИ\n`;
      errorContent += `Дата: ${new Date().toLocaleString('ru-RU')}\n`;
      errorContent += `Всего ошибок: ${failedResults.length}\n`;
      errorContent += `${'='.repeat(60)}\n\n`;

      const errorGroups: { [key: string]: string[] } = {};

      // Группируем ошибки по типам
      failedResults.forEach((error, index) => {
        const errorText = error.error || 'Неизвестная ошибка';
        const errorType = this.extractErrorType(errorText);
        
        if (!errorGroups[errorType]) {
          errorGroups[errorType] = [];
        }
        errorGroups[errorType].push(`${index + 1}. ${errorText}`);
      });

      // Записываем сгруппированные ошибки
      Object.entries(errorGroups).forEach(([errorType, errors]) => {
        errorContent += `${errorType.toUpperCase()} (${errors.length} шт.):\n`;
        errorContent += `${'-'.repeat(40)}\n`;
        errors.forEach(error => {
          errorContent += `${error}\n`;
        });
        errorContent += `\n`;
      });

      writeFileSync(errorFilePath, errorContent, 'utf-8');
      this.logger.info(`Error file created: ${errorFilePath}`);
      
      return errorFilePath;

    } catch (error) {
      this.logger.error(`Failed to create error file: ${error}`);
      return null;
    }
  }

  private extractErrorType(errorText: string): string {
    if (errorText.includes('Access forbidden') || errorText.includes('403')) {
      return 'Доступ запрещен (403)';
    } else if (errorText.includes('Rate limited') || errorText.includes('429')) {
      return 'Превышение лимитов (429)';
    } else if (errorText.includes('Server error') || errorText.includes('5')) {
      return 'Ошибки сервера (5xx)';
    } else if (errorText.includes('400')) {
      return 'Неверный запрос (400)';
    } else if (errorText.includes('Network Error') || errorText.includes('timeout')) {
      return 'Сетевые ошибки';
    } else {
      return 'Прочие ошибки';
    }
  }

  private async sendErrorFile(ctx: Context, filePath: string): Promise<void> {
    try {
      const fileName = `errors_${new Date().toISOString().split('T')[0]}.txt`;
      
      await ctx.replyWithDocument({
        source: filePath,
        filename: fileName
      }, {
        caption: `📄 Детальный отчет об ошибках рассылки\n\n⚠️ В файле содержится подробная информация о всех неудачных попытках отправки сообщений.`,
        ...this.getBackToMenuKeyboard()
      });

      // Удаляем временный файл
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }

      this.logger.info(`Error file sent and cleaned up: ${filePath}`);

    } catch (error) {
      this.logger.error(`Failed to send error file: ${error}`);
      
      // Попытаемся удалить файл в случае ошибки
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    }
  }

  public stop(): void {
    this.bot.stop();
    this.logger.info('Telegram bot stopped');
  }
}