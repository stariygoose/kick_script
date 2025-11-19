export interface UserConfig {
  username: string;
  accessToken: string;
  userAgent?: string;
  proxy?: string;
}

export interface StreamerConfig {
  nickname: string;
  chatId: string;
}

export interface AccountsConfig {
  streamers: Record<string, StreamerConfig>;
  users: Record<string, UserConfig>;
}

export interface SendMessageResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export interface BroadcastOptions {
  concurrency?: number;
  delayMs?: number;
  randomDelay?: {
    min: number;
    max: number;
  };
}