import { Telegraf, Context, Markup } from 'telegraf';
import { UserManager } from '../managers/user-manager.js';
import { Logger } from '../utils/logger.js';
import { UserConfig, StreamerConfig, BroadcastOptions, SendMessageResponse } from '../types/interfaces.js';
import { writeFileSync, readFileSync } from 'fs';

export class TelegramBot {
  private bot: Telegraf;
  private userManager: UserManager;
  private logger: Logger;
  private adminChatId: string;
  private accountsFilePath: string = './accounts.yml';
  private userStates: Map<string, string> = new Map();
  private broadcastOptions: BroadcastOptions = { concurrency: 5, delayMs: 200 };

  constructor(token: string, adminChatId: string, userManager: UserManager, logger: Logger) {
    this.bot = new Telegraf(token);
    this.userManager = userManager;
    this.logger = logger;
    this.adminChatId = adminChatId;

    this.setupCommands();
    this.setupCallbacks();
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

    this.bot.catch((err: any, ctx) => {
      this.logger.error(`Bot error: ${err}`);
      if (this.isAdmin(ctx)) {
        ctx.reply(`❌ Ошибка: ${err.message || err}`);
      }
    });

    // Handle regular text messages for states
    this.bot.on('text', (ctx) => this.handleTextInput(ctx));
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

    this.bot.action('import_text', (ctx) => {
      ctx.answerCbQuery();
      this.startImportTextProcess(ctx);
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
      this.setBroadcastPreset(ctx, { concurrency: 10, delayMs: 100 }, 'Быстрый');
    });

    this.bot.action('set_balanced', (ctx) => {
      ctx.answerCbQuery();
      this.setBroadcastPreset(ctx, { concurrency: 5, delayMs: 200 }, 'Балансированный');
    });

    this.bot.action('set_safe', (ctx) => {
      ctx.answerCbQuery();
      this.setBroadcastPreset(ctx, { concurrency: 2, delayMs: 500 }, 'Безопасный');
    });
  }

  private isAdmin(ctx: Context): boolean {
    return true;
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
      ctx.reply('❌ Формат: /broadcast <chatId> <message>');
      return;
    }

    const chatId = args[0];
    const message = args.slice(1).join(' ');

    try {
      const statusMessage = await ctx.reply('🚀 Начинаю рассылку...');
      const startTime = Date.now();

      const result = await this.userManager.broadcastMessageConcurrent(chatId, message, this.broadcastOptions, (progress) => {
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

        // Update status message
        ctx.telegram.editMessageText(
          ctx.chat?.id,
          statusMessage.message_id,
          undefined,
          statusText
        ).catch(() => {
          // Ignore telegram rate limit errors
        });
      });

      // Calculate execution time
      const endTime = Date.now();
      const executionTime = Math.round((endTime - startTime) / 1000);

      // Prepare detailed summary
      const total = result.sent + result.failed;
      const successRate = total > 0 ? Math.round((result.sent / total) * 100) : 0;
      
      let finalMessage = `✅ Рассылка завершена!\n\n📊 ИТОГИ:\n`;
      finalMessage += `👥 Всего пользователей: ${total}\n`;
      finalMessage += `✅ Успешно отправлено: ${result.sent}\n`;
      finalMessage += `❌ Ошибок: ${result.failed}\n`;
      finalMessage += `📈 Успешность: ${successRate}%\n`;
      finalMessage += `⏱️ Время выполнения: ${executionTime} секунд\n`;

      // Add full error list if there were any failures
      if (result.failed > 0) {
        const failedResults = result.results.filter(r => !r.success);
        if (failedResults.length > 0) {
          finalMessage += `\n🔍 ПОЛНЫЙ СПИСОК ОШИБОК:\n`;
          
          failedResults.forEach((error: SendMessageResponse, index: number) => {
            const errorText = error.error || 'Неизвестная ошибка';
            finalMessage += `${index + 1}. ${errorText}\n`;
          });
        }
      }

      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        statusMessage.message_id,
        undefined,
        finalMessage
      );

      this.logger.info(`Broadcast completed via Telegram bot: ${result.sent} sent, ${result.failed} failed`);

    } catch (error) {
      ctx.reply(`❌ Ошибка рассылки: ${error}`);
      this.logger.error(`Broadcast failed via Telegram bot: ${error}`);
    }
  }

  private async handleSendMessage(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) return;

    const sendMsg = ctx.message as any;
    const args = sendMsg?.text?.split(' ').slice(1);
    if (!args || args.length < 3) {
      ctx.reply('❌ Формат: /sendmsg <username> <chatId> <message>');
      return;
    }

    const username = args[0];
    const chatId = args[1];
    const message = args.slice(2).join(' ');

    try {
      const result = await this.userManager.sendMessageFromUser(username, chatId, message);

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
      [Markup.button.callback('⚡ Настройки рассылки', 'broadcast_settings')],
      [Markup.button.callback('📁 Файлы', 'files_menu')],
      [Markup.button.callback('📊 Статистика', 'show_stats')],
    ]);

    const message = `🤖 Kick Bot Manager

Выберите действие:`;

    if (ctx.callbackQuery) {
      ctx.editMessageText(message, keyboard);
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

    ctx.editMessageText(message, keyboard);
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

    ctx.editMessageText(message, keyboard);
  }

  private showBroadcastMenu(ctx: Context): void {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📢 Начать рассылку', 'start_broadcast')],
      [Markup.button.callback('⬅️ Назад', 'main_menu')],
    ]);

    const message = `📢 Рассылка сообщений

Готово к рассылке пользователей: ${this.userManager.getUserCount()}`;

    ctx.editMessageText(message, keyboard);
  }

  private showFilesMenu(ctx: Context): void {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📥 Импорт из текста', 'import_text')],
      [Markup.button.callback('🔄 Перезагрузить файл', 'reload_accounts')],
      [Markup.button.callback('⬅️ Назад', 'main_menu')],
    ]);

    const message = `📁 Управление файлами

Текущий файл: ${this.accountsFilePath}`;

    ctx.editMessageText(message, keyboard);
  }

  private showBroadcastSettings(ctx: Context): void {
    const userCount = this.userManager.getUserCount();
    const estimatedTime = Math.ceil(userCount / (this.broadcastOptions.concurrency || 1)) * ((this.broadcastOptions.delayMs || 0) / 1000);

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('⚡ Быстро (10 потоков, 100ms)', 'set_fast')],
      [Markup.button.callback('⚖️ Балансированно (5 потоков, 200ms)', 'set_balanced')],
      [Markup.button.callback('🐌 Безопасно (2 потока, 500ms)', 'set_safe')],
      [Markup.button.callback('⬅️ Назад', 'main_menu')],
    ]);

    const message = `⚡ Настройки рассылки

Текущие параметры:
🔄 Конкурентность: ${this.broadcastOptions.concurrency}
⏱️ Задержка: ${this.broadcastOptions.delayMs}ms
📈 Время рассылки ${userCount} сообщений: ~${estimatedTime}с

Выберите пресет или используйте /setbroadcast <потоки> <задержка>:`;

    ctx.editMessageText(message, keyboard);
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
    ctx.editMessageText('📢 Рассылка сообщений\n\nВведите данные в формате:\nchatId message');
  }

  private startImportTextProcess(ctx: Context): void {
    const userId = this.getUserId(ctx);
    this.userStates.set(userId, 'waiting_import_text');
    ctx.editMessageText('📥 Импорт из текстового файла\n\nВставьте содержимое текстового файла в формате:\nusername=userId|token');
  }

  private async handleTextInput(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) return;

    const userId = this.getUserId(ctx);
    const state = this.userStates.get(userId);
    const message = ctx.message as any;
    const text = message?.text;

    if (!state || !text) return;

    this.userStates.delete(userId);

    switch (state) {
      case 'waiting_user_data':
        await this.processAddUser(ctx, text);
        break;
      case 'waiting_username_to_remove':
        await this.processRemoveUser(ctx, text);
        break;
      case 'waiting_streamer_data':
        await this.processAddStreamer(ctx, text);
        break;
      case 'waiting_streamer_to_remove':
        await this.processRemoveStreamer(ctx, text);
        break;
      case 'waiting_broadcast_data':
        await this.processBroadcast(ctx, text);
        break;
      case 'waiting_import_text':
        await this.processImportText(ctx, text);
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
      ctx.reply('❌ Неверный формат. Используйте: chatId message');
      return;
    }

    const chatId = parts[0];
    const message = parts.slice(1).join(' ');

    try {
      const statusMessage = await ctx.reply('🚀 Начинаю рассылку...');
      const startTime = Date.now();

      const result = await this.userManager.broadcastMessageConcurrent(chatId, message, this.broadcastOptions, (progress) => {
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

        // Update status message
        ctx.telegram.editMessageText(
          ctx.chat?.id,
          statusMessage.message_id,
          undefined,
          statusText
        ).catch(() => {
          // Ignore telegram rate limit errors
        });
      });

      // Calculate execution time
      const endTime = Date.now();
      const executionTime = Math.round((endTime - startTime) / 1000);

      // Prepare detailed summary
      const total = result.sent + result.failed;
      const successRate = total > 0 ? Math.round((result.sent / total) * 100) : 0;
      
      let finalMessage = `✅ Рассылка завершена!\n\n📊 ИТОГИ:\n`;
      finalMessage += `👥 Всего пользователей: ${total}\n`;
      finalMessage += `✅ Успешно отправлено: ${result.sent}\n`;
      finalMessage += `❌ Ошибок: ${result.failed}\n`;
      finalMessage += `📈 Успешность: ${successRate}%\n`;
      finalMessage += `⏱️ Время выполнения: ${executionTime} секунд\n`;

      // Add full error list if there were any failures
      if (result.failed > 0) {
        const failedResults = result.results.filter(r => !r.success);
        if (failedResults.length > 0) {
          finalMessage += `\n🔍 ПОЛНЫЙ СПИСОК ОШИБОК:\n`;
          
          failedResults.forEach((error: SendMessageResponse, index: number) => {
            const errorText = error.error || 'Неизвестная ошибка';
            finalMessage += `${index + 1}. ${errorText}\n`;
          });
        }
      }

      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        statusMessage.message_id,
        undefined,
        finalMessage,
        this.getBackToMenuKeyboard()
      );

    } catch (error) {
      ctx.reply(`❌ Ошибка рассылки: ${error}`, this.getBackToMenuKeyboard());
    }
  }

  private async processImportText(ctx: Context, textContent: string): Promise<void> {
    try {
      // Import from text content and overwrite YAML file
      this.userManager.importFromTextAndOverwriteYaml(textContent.trim(), this.accountsFilePath);
      
      // Get the count of imported users
      const userCount = this.userManager.getUserCount();
      
      ctx.reply(`✅ Импорт завершен успешно!\n\n📊 Импортировано пользователей: ${userCount}\n🔄 YAML файл обновлен: ${this.accountsFilePath}`, this.getBackToMenuKeyboard());
      
    } catch (error) {
      ctx.reply(`❌ Ошибка импорта: ${error}`, this.getBackToMenuKeyboard());
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


  public stop(): void {
    this.bot.stop();
    this.logger.info('Telegram bot stopped');
  }
}