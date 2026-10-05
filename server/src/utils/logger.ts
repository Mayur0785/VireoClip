import { config } from '../config/index.js';

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  requestId?: string;
  userId?: string;
  projectId?: string;
  detail?: unknown;
  [key: string]: unknown;
}

function normalizeContext(arg?: unknown): Record<string, unknown> {
  if (arg === undefined || arg === null) {
    return {};
  }
  if (arg instanceof Error) {
    return {
      error: arg.message,
      stack: config.isProduction ? undefined : arg.stack,
    };
  }
  if (typeof arg === 'object' && !Array.isArray(arg)) {
    return arg as Record<string, unknown>;
  }
  return { detail: arg };
}

function formatLog(entry: LogEntry): string {
  if (config.isProduction) {
    // Structured JSON for production log aggregators
    return JSON.stringify(entry);
  }
  // Readable format for development
  const tag = `[${entry.level.toUpperCase()}]`;
  const ts = `[${entry.timestamp}]`;
  const ctx = [
    entry.requestId ? `req=${entry.requestId}` : '',
    entry.userId ? `user=${entry.userId}` : '',
    entry.projectId ? `project=${entry.projectId}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const ctxStr = ctx ? ` (${ctx})` : '';
  const detailStr = entry.detail !== undefined ? ` ${typeof entry.detail === 'object' ? JSON.stringify(entry.detail) : entry.detail}` : '';
  const errorStr = entry.error ? ` [Error: ${entry.error}]` : '';
  return `${tag} ${ts}${ctxStr} ${entry.message}${detailStr}${errorStr}`;
}

function createLogEntry(
  level: LogLevel,
  message: string,
  contextOrDetail?: unknown,
  ...extra: unknown[]
): LogEntry {
  const baseContext = normalizeContext(contextOrDetail);
  if (extra.length > 0) {
    baseContext.extra = extra.length === 1 ? extra[0] : extra;
  }
  return {
    level,
    timestamp: new Date().toISOString(),
    message,
    ...baseContext,
  };
}

export const logger = {
  info: (message: string, contextOrDetail?: unknown, ...extra: unknown[]) => {
    const entry = createLogEntry('info', message, contextOrDetail, ...extra);
    console.log(formatLog(entry));
  },
  warn: (message: string, contextOrDetail?: unknown, ...extra: unknown[]) => {
    const entry = createLogEntry('warn', message, contextOrDetail, ...extra);
    console.warn(formatLog(entry));
  },
  error: (message: string, contextOrDetail?: unknown, ...extra: unknown[]) => {
    const entry = createLogEntry('error', message, contextOrDetail, ...extra);
    console.error(formatLog(entry));
  },
};
