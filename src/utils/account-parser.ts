import { readFileSync } from 'fs';
import UserAgent from 'user-agents';
import { UserConfig } from '../types/interfaces.js';
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

      this.logger.info(`Successfully parsed ${accounts.length} accounts`);
      return accounts;

    } catch (error) {
      this.logger.error(`Failed to read accounts file: ${error}`);
      throw new Error(`Failed to parse accounts file: ${error}`);
    }
  }

  private generateRandomUserAgent(): string {
    const userAgent = new UserAgent();
    return userAgent.toString();
  }
}