import winston from 'winston';

const colorize = winston.format.colorize();

const colors = {
  debug: '\x1b[36m',    // cyan
  info: '\x1b[32m',     // green
  warn: '\x1b[33m',     // yellow
  error: '\x1b[31m',    // red
  reset: '\x1b[0m'      // reset
};

export class Logger {
  private winstonLogger: winston.Logger;

  constructor(level: string = 'info') {
    this.winstonLogger = winston.createLogger({
      level: level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
          const color = colors[level as keyof typeof colors] || colors.reset;
          return `${color}[${timestamp}] [${level.toUpperCase()}] ${message}${colors.reset}`;
        })
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error'
        }),
        new winston.transports.File({
          filename: 'logs/combined.log'
        })
      ]
    });
  }

  debug(message: string, ...args: any[]): void {
    const formattedMessage = args.length > 0 ? `${message} ${JSON.stringify(args)}` : message;
    this.winstonLogger.debug(formattedMessage);
  }

  info(message: string, ...args: any[]): void {
    const formattedMessage = args.length > 0 ? `${message} ${JSON.stringify(args)}` : message;
    this.winstonLogger.info(formattedMessage);
  }

  warn(message: string, ...args: any[]): void {
    const formattedMessage = args.length > 0 ? `${message} ${JSON.stringify(args)}` : message;
    this.winstonLogger.warn(formattedMessage);
  }

  error(message: string, ...args: any[]): void {
    const formattedMessage = args.length > 0 ? `${message} ${JSON.stringify(args)}` : message;
    this.winstonLogger.error(formattedMessage);
  }

  setLevel(level: string): void {
    this.winstonLogger.level = level;
  }
}