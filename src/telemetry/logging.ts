import { AsyncLocalStorage } from "node:async_hooks";
import { configure, getConsoleSink } from "@logtape/logtape";

// Get log level from environment variable, default to 'info' for production
const logLevel =
  (process.env.LOG_LEVEL as "debug" | "info" | "warning" | "error" | "fatal") || "info";

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
