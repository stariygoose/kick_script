export interface UserConfig {
  username: string;
  accessToken: string;
  userAgent?: string;
  proxy?: string;
}

export interface SendMessageResponse {
  success: boolean;
  data?: any;
  error?: string;
}