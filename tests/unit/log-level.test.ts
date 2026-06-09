import { describe, expect, it } from "vitest";
import { normalizeLogLevel } from "../../src/telemetry/logging.js";

/**
 * The CLI help documents LOG_LEVEL as `debug, info, warn, error`, but logtape's
 * level is spelled `warning`. Accept the documented `warn` as an alias, and fall
 * back to `info` for anything unrecognized so a typo can't silently disable logs.
 */
describe("normalizeLogLevel", () => {
  it("maps the documented 'warn' alias to logtape's 'warning'", () => {
    expect(normalizeLogLevel("warn")).toBe("warning");
  });

  it("passes through valid logtape levels unchanged", () => {
    for (const level of ["debug", "info", "warning", "error", "fatal"]) {
      expect(normalizeLogLevel(level)).toBe(level);
    }
  });

  it("is case-insensitive and trims surrounding whitespace", () => {
    expect(normalizeLogLevel("  WARN ")).toBe("warning");
    expect(normalizeLogLevel("INFO")).toBe("info");
  });

  it("defaults to info for undefined or unrecognized values", () => {
    expect(normalizeLogLevel(undefined)).toBe("info");
    expect(normalizeLogLevel("bogus")).toBe("info");
  });
});
