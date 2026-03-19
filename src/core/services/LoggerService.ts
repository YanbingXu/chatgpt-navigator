/**
 * LoggerService — structured logging for the extension.
 * No console.log in production; use this service instead.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_PREFIX = '[ChatGPT-Nav]';

class LoggerServiceImpl {
  private isDev: boolean;

  constructor() {
    this.isDev = import.meta.env.DEV;
  }

  debug(tag: string, ...args: unknown[]): void {
    if (this.isDev) {
      console.debug(`${LOG_PREFIX}[${tag}]`, ...args);
    }
  }

  info(tag: string, ...args: unknown[]): void {
    if (this.isDev) {
      console.info(`${LOG_PREFIX}[${tag}]`, ...args);
    }
  }

  warn(tag: string, ...args: unknown[]): void {
    console.warn(`${LOG_PREFIX}[${tag}]`, ...args);
  }

  error(tag: string, ...args: unknown[]): void {
    console.error(`${LOG_PREFIX}[${tag}]`, ...args);
  }
}

export const LoggerService = new LoggerServiceImpl();
