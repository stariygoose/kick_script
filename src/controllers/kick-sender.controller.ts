import axios, { AxiosInstance } from "axios";
import { UserConfig, SendMessageResponse } from "../types/interfaces.js";
import { Logger } from "../utils/logger.js";

export class KickSender {
  private baseUrl: string = `https://kick.com/api/v2/messages/send/`;
  private config: UserConfig;
  private logger: Logger;
  private axiosInstance: AxiosInstance;

  constructor(config: UserConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;

    this.axiosInstance = axios.create({
      headers: {
        'User-Agent': config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  public async sendMessage(chatId: string, message: string): Promise<SendMessageResponse> {
    try {
      this.logger.debug(`Sending message to chat ${chatId} from user ${this.config.username}`);

      const response = await this.axiosInstance.post(
        this.baseUrl + chatId,
        {
          content: message,
          type: "message",
        }
      );

      this.logger.info(`Message sent successfully from ${this.config.username} to chat ${chatId}`);
      return {
        success: true,
        data: response.data
      };

    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
      const userErrorMsg = `User: ${this.config.username} - ${errorMsg}`;
      this.logger.error(`Failed to send message from ${this.config.username}: ${errorMsg}`);

      return {
        success: false,
        error: userErrorMsg
      };
    }
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
