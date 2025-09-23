import { Logger } from './logger.js';

export interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

export class RetryHandler {
  private logger: Logger;
  private defaultConfig: RetryConfig = {
    maxAttempts: 3,
    delayMs: 1000,
    backoffMultiplier: 2,
    maxDelayMs: 10000
  };

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async execute<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    operationName: string = 'operation'
  ): Promise<T> {
    const finalConfig = { ...this.defaultConfig, ...config };
    let lastError: any;
    let currentDelay = finalConfig.delayMs;

    for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
      try {
        this.logger.debug(`Executing ${operationName}, attempt ${attempt}/${finalConfig.maxAttempts}`);

        const result = await operation();

        if (attempt > 1) {
          this.logger.info(`${operationName} succeeded on attempt ${attempt}`);
        }

        return result;

      } catch (error) {
        lastError = error;
        this.logger.warn(`${operationName} failed on attempt ${attempt}: ${error}`);

        if (attempt < finalConfig.maxAttempts) {
          this.logger.debug(`Retrying ${operationName} in ${currentDelay}ms...`);
          await this.delay(currentDelay);

          currentDelay = Math.min(
            currentDelay * finalConfig.backoffMultiplier,
            finalConfig.maxDelayMs
          );
        }
      }
    }

    this.logger.error(`${operationName} failed after ${finalConfig.maxAttempts} attempts`);
    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}