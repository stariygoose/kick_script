import axios, { AxiosInstance } from "axios";
import { UserConfig, SendMessageResponse } from "../types/interfaces.js";
import { Logger } from "../utils/logger.js";
import { RetryHandler } from "../utils/retry-handler.js";
import UserAgent from 'user-agents';

export class KickSender {
  private baseUrl: string = `https://kick.com/api/v2/messages/send/`;
  private config: UserConfig;
  private logger: Logger;
  private axiosInstance: AxiosInstance;
  private retryHandler: RetryHandler;
  constructor(config: UserConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.retryHandler = new RetryHandler(logger);

    // Если userAgent не указан, генерируем случайный
    if (!this.config.userAgent) {
      this.config.userAgent = this.generateRandomUserAgent();
      this.logger.debug(`Auto-assigned user agent for ${this.config.username}: ${this.config.userAgent}`);
    }

    this.axiosInstance = axios.create({
      headers: {
        'User-Agent': this.config.userAgent,
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  private generateRandomUserAgent(): string {
    const userAgent = new UserAgent();
    return userAgent.toString();
  }

  public async sendMessage(chatId: string, message: string, abortSignal?: AbortSignal): Promise<SendMessageResponse> {
    try {
      return await this.retryHandler.execute(
        async () => {
          const response = await this.axiosInstance.post(
            this.baseUrl + chatId,
            {
              content: message,
              type: "message",
            },
            {
              signal: abortSignal
            }
          );

          // Logging is now handled in batch by UserManager
          return {
            success: true,
            data: response.data
          };
        },
        {
          maxAttempts: 3,
          delayMs: 1000,
          backoffMultiplier: 2,
          maxDelayMs: 8000
        },
        `send message from ${this.config.username}`
      );

    } catch (error: any) {
      const errorMsg = this.extractErrorMessage(error);
      const userErrorMsg = `User: ${this.config.username} - ${errorMsg}`;
      // Error logging is now handled in batch by UserManager

      return {
        success: false,
        error: userErrorMsg
      };
    }
  }

  private extractErrorMessage(error: any): string {
    if (error.response) {
      const statusCode = error.response.status;
      const statusText = error.response.statusText;
      
      if (statusCode === 403) {
        return `Access forbidden (${statusCode})`;
      } else if (statusCode === 429) {
        return `Rate limited (${statusCode})`;
      } else if (statusCode >= 500) {
        return `Server error (${statusCode})`;
      } else {
        return `Request failed with status code ${statusCode}`;
      }
    }
    
    return error.message || 'Unknown error';
  }

  public updateUserAgent(userAgent: string): void {
    this.config.userAgent = userAgent;
    this.axiosInstance.defaults.headers['User-Agent'] = userAgent;
    this.logger.debug(`Updated user agent for ${this.config.username}`);
  }

  public getUsername(): string {
    return this.config.username;
  }

  public getUserConfig(): UserConfig {
    return { ...this.config };
  }
}
