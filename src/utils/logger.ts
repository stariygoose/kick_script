import winston from 'winston';

export class Logger {
  private winstonLogger: winston.Logger;

  constructor(level: string = 'info') {
    this.winstonLogger = winston.createLogger({
      level: level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
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