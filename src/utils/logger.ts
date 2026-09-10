/**
 * Secure Logger Utility
 *
 * Replaces console.log/error/warn to prevent sensitive data exposure.
 * - Only logs in development mode
 * - Automatically redacts sensitive data patterns
 * - Provides structured logging with categories
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Patterns to redact sensitive information
 */
const SENSITIVE_PATTERNS = [
  // JWT tokens (starts with ey...)
  { pattern: /ey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/]*/g, replacement: '[REDACTED_JWT]' },
  // Phone numbers (various formats)
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: '[REDACTED_PHONE]' },
  { pattern: /\b\d{10}\b/g, replacement: '[REDACTED_PHONE]' },
  { pattern: /\+\d{1,3}\s?\d{10}/g, replacement: '[REDACTED_PHONE]' },
  // OTP codes (4-6 digits)
  { pattern: /\b\d{4,6}\b/g, replacement: '[REDACTED_OTP]' },
  // Email addresses
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[REDACTED_EMAIL]' },
  // API keys (common prefixes)
  { pattern: /\b(sk|pk)_[a-zA-Z0-9]{20,}\b/g, replacement: '[REDACTED_API_KEY]' },
  // Access/refresh token keywords
  { pattern: /(access_token|refresh_token|auth_token|bearer)\s*[:=]\s*["']?[^"'\s]+["']?/gi, replacement: '$1: [REDACTED_TOKEN]' },
];

/**
 * Redact sensitive information from log messages
 */
const redactSensitiveData = (message: string): string => {
  let redacted = message;

  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }

  return redacted;
};

/**
 * Format log message with category and timestamp
 */
const formatMessage = (level: LogLevel, category: string, message: string): string => {
  const timestamp = new Date().toISOString();
  const levelUpper = level.toUpperCase().padEnd(5, ' ');
  return `[${timestamp}] ${levelUpper} [${category}] ${message}`;
};

/**
 * Stringify objects safely for logging
 */
const stringifyObject = (obj: unknown, redact: boolean = true): string => {
  try {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    return redact ? redactSensitiveData(str) : str;
  } catch (err) {
    return String(obj);
  }
};

/**
 * Core logging function
 */
const log = (
  level: LogLevel,
  category: string,
  message: unknown,
  ...args: unknown[]
): void => {
  // Only log in development mode
  if (!__DEV__) {
    // In production, only log errors
    if (level !== 'error') {
      return;
    }
  }

  const messageStr = stringifyObject(message);
  const formattedMessage = formatMessage(level, category, messageStr);

  // Process additional arguments
  const processedArgs = args.map(arg => stringifyObject(arg));

  // Use appropriate console method
  switch (level) {
    case 'error':
      console.error(formattedMessage, ...processedArgs);
      break;
    case 'warn':
      console.warn(formattedMessage, ...processedArgs);
      break;
    case 'info':
    case 'debug':
    default:
      console.log(formattedMessage, ...processedArgs);
      break;
  }
};

/**
 * Logger class with category support
 */
class Logger {
  private category: string;

  constructor(category: string) {
    this.category = category;
  }

  debug(message: unknown, ...args: unknown[]): void {
    log('debug', this.category, message, ...args);
  }

  info(message: unknown, ...args: unknown[]): void {
    log('info', this.category, message, ...args);
  }

  warn(message: unknown, ...args: unknown[]): void {
    log('warn', this.category, message, ...args);
  }

  error(message: unknown, ...args: unknown[]): void {
    log('error', this.category, message, ...args);
  }

  /**
   * Log without redaction (use sparingly and only for non-sensitive data)
   */
  unsafe(level: LogLevel, message: unknown, ...args: unknown[]): void {
    if (!__DEV__) return;

    const messageStr = typeof message === 'string' ? message : JSON.stringify(message, null, 2);
    const formattedMessage = formatMessage(level, this.category, messageStr);

    switch (level) {
      case 'error':
        console.error(formattedMessage, ...args);
        break;
      case 'warn':
        console.warn(formattedMessage, ...args);
        break;
      default:
        console.log(formattedMessage, ...args);
        break;
    }
  }
}

/**
 * Create a logger instance for a specific category
 */
export const createLogger = (category: string): Logger => {
  return new Logger(category);
};

/**
 * Default logger instance
 */
export const logger = createLogger('App');

/**
 * Category-specific logger instances
 */
export const authLogger = createLogger('Auth');
export const apiLogger = createLogger('API');
export const storageLogger = createLogger('Storage');
export const uiLogger = createLogger('UI');
export const serviceLogger = createLogger('Service');

/**
 * Manual redaction utility for custom use cases
 */
export const redactSensitive = redactSensitiveData;
