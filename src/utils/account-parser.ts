import { readFileSync, writeFileSync } from 'fs';
import UserAgent from 'user-agents';
import * as YAML from 'yaml';
import { UserConfig, AccountsConfig } from '../types/interfaces.js';
import { Logger } from './logger.js';

export class AccountParser {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  parseAccountsFile(filePath: string): UserConfig[] {
    try {
      this.logger.info(`Reading accounts from file: ${filePath}`);
      const fileContent = readFileSync(filePath, 'utf-8');

      // Try to parse as YAML first
      if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
        return this.parseYamlFormat(fileContent);
      }

      // Check if content looks like YAML (contains 'streamers:' or 'users:')
      if (fileContent.includes('streamers:') || fileContent.includes('users:')) {
        return this.parseYamlFormat(fileContent);
      }

      // Fall back to old text format
      return this.parseTextFormat(fileContent);

    } catch (error) {
      this.logger.error(`Failed to read accounts file: ${error}`);
      throw new Error(`Failed to parse accounts file: ${error}`);
    }
  }

  private parseYamlFormat(fileContent: string): UserConfig[] {
    try {
      const config = YAML.parse(fileContent) as AccountsConfig;

      if (!config || !config.users) {
        throw new Error('Invalid YAML format: missing users section');
      }

      const accounts: UserConfig[] = [];

      for (const [username, userConfig] of Object.entries(config.users)) {
        accounts.push({
          username,
          accessToken: userConfig.accessToken,
          userAgent: userConfig.userAgent || this.generateRandomUserAgent(),
          proxy: userConfig.proxy
        });
      }

      this.logger.info(`Successfully parsed ${accounts.length} accounts from YAML format`);
      return accounts;

    } catch (error) {
      this.logger.error(`Failed to parse YAML format: ${error}`);
      throw new Error(`Failed to parse YAML format: ${error}`);
    }
  }

  private parseTextFormat(fileContent: string): UserConfig[] {
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    const accounts: UserConfig[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.includes('=')) {
        this.logger.warn(`Invalid format at line ${i + 1}: ${line}`);
        continue;
      }

      const [username, accessToken] = line.split('=');

      if (!username || !accessToken) {
        this.logger.warn(`Invalid account data at line ${i + 1}: ${line}`);
        continue;
      }

      accounts.push({
        username: username.trim(),
        accessToken: accessToken.trim(),
        userAgent: this.generateRandomUserAgent()
      });
    }

    this.logger.info(`Successfully parsed ${accounts.length} accounts from text format`);
    return accounts;
  }

  parseStreamersFromFile(filePath: string): Record<string, {nickname: string, chatId: string}> {
    try {
      const fileContent = readFileSync(filePath, 'utf-8');

      if (filePath.endsWith('.yml') || filePath.endsWith('.yaml') ||
          fileContent.includes('streamers:') || fileContent.includes('users:')) {
        const config = YAML.parse(fileContent) as AccountsConfig;
        return config.streamers || {};
      }

      return {};
    } catch (error) {
      this.logger.error(`Failed to parse streamers: ${error}`);
      return {};
    }
  }

  exportToYaml(users: UserConfig[], streamers: Record<string, {nickname: string, chatId: string}>, outputPath: string): void {
    try {
      const config: AccountsConfig = {
        streamers,
        users: {}
      };

      // Convert users array to object format
      for (const user of users) {
        config.users[user.username] = {
          username: user.username,
          accessToken: user.accessToken,
          userAgent: user.userAgent,
          proxy: user.proxy
        };
      }

      const yamlContent = YAML.stringify(config, {
        indent: 2,
        lineWidth: 0
      });

      writeFileSync(outputPath, yamlContent, 'utf-8');
      this.logger.info(`Exported ${users.length} users and ${Object.keys(streamers).length} streamers to ${outputPath}`);

    } catch (error) {
      this.logger.error(`Failed to export to YAML: ${error}`);
      throw new Error(`Failed to export to YAML: ${error}`);
    }
  }

  exportToText(users: UserConfig[], outputPath: string): void {
    try {
      const lines = users.map(user => `${user.username}=${user.accessToken}`);
      const content = lines.join('\n') + '\n';

      writeFileSync(outputPath, content, 'utf-8');
      this.logger.info(`Exported ${users.length} users to text format: ${outputPath}`);

    } catch (error) {
      this.logger.error(`Failed to export to text format: ${error}`);
      throw new Error(`Failed to export to text format: ${error}`);
    }
  }

  importFromFile(filePath: string): { users: UserConfig[], streamers: Record<string, {nickname: string, chatId: string}> } {
    try {
      const users = this.parseAccountsFile(filePath);
      const streamers = this.parseStreamersFromFile(filePath);

      this.logger.info(`Imported ${users.length} users and ${Object.keys(streamers).length} streamers from ${filePath}`);

      return { users, streamers };

    } catch (error) {
      this.logger.error(`Failed to import from file: ${error}`);
      throw new Error(`Failed to import from file: ${error}`);
    }
  }

  private generateRandomUserAgent(): string {
    const userAgent = new UserAgent();
    return userAgent.toString();
  }
}