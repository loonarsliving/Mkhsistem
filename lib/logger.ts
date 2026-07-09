/**
 * Structured JSON logger. Writes one JSON object per line to stdout/stderr —
 * Vercel (and any standard log collector) ingests this natively with no
 * extra setup, so this is functional in production the moment it's deployed,
 * not a stub waiting on a third-party account.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  environment: string;
  context?: LogContext;
}

/* eslint-disable no-console -- this module is the one sanctioned place all log levels write to stdout/stderr */
function writeToConsole(level: LogLevel, ...args: unknown[]) {
  console[level](...args);
}
/* eslint-enable no-console */

function write(level: LogLevel, message: string, context?: LogContext) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    environment: process.env.NODE_ENV ?? "development",
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
  };

  if (process.env.NODE_ENV === "development") {
    writeToConsole(level, `[${entry.timestamp}] ${level.toUpperCase()} ${message}`, context ?? "");
  } else {
    writeToConsole(level, JSON.stringify(entry));
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
};

/** Serializes an unknown thrown value into a loggable, JSON-safe shape. */
export function serializeError(error: unknown): { message: string; stack?: string; name?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack, name: error.name };
  }
  return { message: typeof error === "string" ? error : JSON.stringify(error) };
}
