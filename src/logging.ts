import { AsyncLocalStorage } from "node:async_hooks";
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  contextLocalStorage: new AsyncLocalStorage(),
  sinks: {
    console: getConsoleSink(),
  },
  filters: {},
  loggers: [
    {
      category: "activitypub-mcp-server",
      lowestLevel: "debug",
      sinks: ["console"],
    },
    { category: "fedify", lowestLevel: "info", sinks: ["console"] },
    {
      category: ["logtape", "meta"],
      lowestLevel: "warning",
      sinks: ["console"],
    },
  ],
});
