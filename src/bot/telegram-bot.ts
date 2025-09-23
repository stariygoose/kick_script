import { Telegraf, Context } from 'telegraf';
import { UserManager } from '../managers/user-manager.js';
import { Logger } from '../utils/logger.js';
import { UserConfig } from '../types/interfaces.js';
import { writeFileSync, readFileSync } from 'fs';

export class TelegramBot {
  private bot: Telegraf;
  private userManager: UserManager;
  private logger: Logger;
  private adminChatId: string;
  private accountsFilePath: string = './accounts.txt';

  constructor(token: string, adminChatId: string, userManager: UserManager, logger: Logger) {
    this.bot = new Telegraf(token);
    this.userManager = userManager;
    this.logger = logger;
    this.adminChatId = adminChatId;

    this.setupCommands();
  }

  private setupCommands(): void {
    this.bot.start((ctx) => {
      if (!this.isAdmin(ctx)) return;

      ctx.reply(`🤖 Kick Bot Manager запущен!

Доступные команды:
/adduser <username> <token> - Добавить пользователя
/removeuser <username> - Удалить пользователя
/searchuser <username> - Найти пользователя
/listusers - Показать всех пользователей
/broadcast <chatId> <message> - Отправить сообщение всем
/sendmsg <username> <chatId> <message> - Отправить от конкретного пользователя
/reload - Перезагрузить аккаунты из файла
/stats - Статистика`);
    });

    this.bot.command('adduser', (ctx) => this.handleAddUser(ctx));
    this.bot.command('removeuser', (ctx) => this.handleRemoveUser(ctx));
    this.bot.command('searchuser', (ctx) => this.handleSearchUser(ctx));
    this.bot.command('listusers', (ctx) => this.handleListUsers(ctx));
    this.bot.command('broadcast', (ctx) => this.handleBroadcast(ctx));
    this.bot.command('sendmsg', (ctx) => this.handleSendMessage(ctx));
    this.bot.command('reload', (ctx) => this.handleReload(ctx));
    this.bot.command('stats', (ctx) => this.handleStats(ctx));

    this.bot.catch((err: any, ctx) => {
      this.logger.error(`Bot error: ${err}`);
      if (this.isAdmin(ctx)) {
        ctx.reply(`❌ Ошибка: ${err.message || err}`);
      }
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
      this.appendToAccountsFile(username, token);

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
        this.removeFromAccountsFile(username);
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
      ctx.reply('🚀 Начинаю рассылку...');

      const result = await this.userManager.broadcastMessage(chatId, message, 1000);

      ctx.reply(`✅ Рассылка завершена!\n📤 Отправлено: ${result.sent}\n❌ Ошибок: ${result.failed}`);
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
    const usernames = this.userManager.getAllUsernames();

    ctx.reply(`📊 Статистика:
👥 Всего аккаунтов: ${userCount}
📝 Файл: ${this.accountsFilePath}
🤖 Бот активен: ✅`);
  }

  private appendToAccountsFile(username: string, token: string): void {
    try {
      const newLine = `${username}=${token}\n`;
      writeFileSync(this.accountsFilePath, newLine, { flag: 'a' });
    } catch (error) {
      this.logger.error(`Failed to append to accounts file: ${error}`);
      throw error;
    }
  }

  private removeFromAccountsFile(username: string): void {
    try {
      const content = readFileSync(this.accountsFilePath, 'utf-8');
      const lines = content.split('\n').filter(line => {
        if (!line.trim()) return false;
        const [user] = line.split('=');
        return user.trim() !== username;
      });

      writeFileSync(this.accountsFilePath, lines.join('\n') + '\n');
    } catch (error) {
      this.logger.error(`Failed to remove from accounts file: ${error}`);
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

  public stop(): void {
    this.bot.stop();
    this.logger.info('Telegram bot stopped');
  }
}