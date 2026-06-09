import { AsyncLocalStorage } from "node:async_hooks";
import { configure, getConsoleSink } from "@logtape/logtape";

export type LogLevel = "debug" | "info" | "warning" | "error" | "fatal";

const LOG_LEVEL_ALIASES: Record<string, LogLevel> = {
  debug: "debug",
  info: "info",
  warn: "warning", // the CLI help documents `warn`; logtape's level is `warning`
  warning: "warning",
  error: "error",
  fatal: "fatal",
};

/**
 * Map a LOG_LEVEL env value to a logtape level. Accepts the documented `warn`
 * alias, is case-insensitive, and falls back to `info` for anything
 * unrecognized so a typo can't silently disable logging.
 */
export function normalizeLogLevel(raw: string | undefined): LogLevel {
  if (!raw) return "info";
  return LOG_LEVEL_ALIASES[raw.trim().toLowerCase()] ?? "info";
}

const logLevel = normalizeLogLevel(process.env.LOG_LEVEL);

// logtape's console sink maps info/debug to console.info/console.debug, which
// Node writes to stdout. Under the stdio transport stdout carries the MCP
// JSON-RPC stream, so any log byte written there corrupts the protocol. Route
// every level to stderr by giving the sink a console whose stdout-bound methods
// delegate to console.error.
const stderrConsole: Console = Object.assign(Object.create(console), {
  log: console.error.bind(console),
  info: console.error.bind(console),
  debug: console.error.bind(console),
  warn: console.error.bind(console),
});

await configure({
  contextLocalStorage: new AsyncLocalStorage(),
  sinks: {
    console: getConsoleSink({ console: stderrConsole }),
  },
  filters: {},
  loggers: [
    {
      category: "activitypub-mcp",
      lowestLevel: logLevel,
      sinks: ["console"],
    },
    {
      category: ["logtape", "meta"],
      lowestLevel: "warning",
      sinks: ["console"],
    },
  ],
});
