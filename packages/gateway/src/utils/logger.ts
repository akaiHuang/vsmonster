/**
 * Structured JSON logger for VSMONSTER Gateway
 *
 * Outputs one JSON object per log line for easy parsing by log aggregators.
 * Provides both a singleton `logger` (backward-compatible) and a
 * `createLogger(module)` factory for module-scoped loggers.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel =
  process.env.NODE_ENV === 'development' || process.env.DEBUG ? 'debug' : 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

/**
 * Core log function — writes a single JSON line to stdout/stderr.
 *
 * The `extra` rest-args keep backward compatibility with call-sites that pass
 * additional arguments (e.g. `logger.error('msg:', errorObj)`).  When the first
 * extra arg is a plain object it is merged into `data`; otherwise extra args
 * are serialised under `data.extra`.
 */
function log(
  level: LogLevel,
  module: string,
  message: string,
  data?: Record<string, unknown>,
  ...extra: unknown[]
): void {
  if (!shouldLog(level)) return;

  let mergedData: Record<string, unknown> | undefined = data;

  // Handle legacy call-sites: logger.error('msg:', someError)
  if (!mergedData && extra.length > 0) {
    const first = extra[0];
    if (first instanceof Error) {
      mergedData = { error: first.message, stack: first.stack };
    } else if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
      mergedData = first as Record<string, unknown>;
    } else {
      mergedData = { extra: extra.length === 1 ? extra[0] : extra };
    }
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    ...(mergedData && { data: mergedData }),
  };

  const output = JSON.stringify(entry);

  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export interface Logger {
  debug(msg: string, ...args: any[]): void;
  info(msg: string, ...args: any[]): void;
  warn(msg: string, ...args: any[]): void;
  error(msg: string, ...args: any[]): void;
  setLevel(level: LogLevel): void;
}

/**
 * Create a logger scoped to a specific module name.
 *
 * Usage:
 *   const log = createLogger('task-manager');
 *   log.info('Task created', { taskId: '123', userId: 'u1' });
 */
export function createLogger(module: string): Logger {
  return {
    debug: (msg: string, ...args: any[]) => log('debug', module, msg, undefined, ...args),
    info: (msg: string, ...args: any[]) => log('info', module, msg, undefined, ...args),
    warn: (msg: string, ...args: any[]) => log('warn', module, msg, undefined, ...args),
    error: (msg: string, ...args: any[]) => log('error', module, msg, undefined, ...args),
    setLevel: (level: LogLevel) => {
      currentLevel = level;
    },
  };
}

/**
 * Default singleton logger (module = "gateway").
 * Backward-compatible — existing `import { logger }` call-sites keep working.
 */
export const logger: Logger = createLogger('gateway');
