import { AsyncLocalStorage } from "node:async_hooks";
import { configure, getConsoleSink } from "@logtape/logtape";
// Get log level from environment variable, default to 'info' for production
const logLevel = process.env.LOG_LEVEL ||
    "info";
await configure({
    contextLocalStorage: new AsyncLocalStorage(),
    sinks: {
        console: getConsoleSink(),
    },
    filters: {},
    loggers: [
        {
            category: "activitypub-mcp",
            lowestLevel: logLevel,
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
//# sourceMappingURL=logging.js.map