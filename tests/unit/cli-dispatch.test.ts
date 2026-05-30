import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/cli/login.js", () => ({ runLogin: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/cli/logout.js", () => ({ runLogout: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/cli/accounts.js", () => ({ runAccounts: vi.fn().mockResolvedValue(undefined) }));

import { runAccounts } from "../../src/cli/accounts.js";
import { dispatchCli } from "../../src/cli/index.js";
import { runLogin } from "../../src/cli/login.js";

afterEach(() => vi.clearAllMocks());

describe("dispatchCli", () => {
  it("routes login and reports handled=true", async () => {
    expect(await dispatchCli(["login", "mastodon.test"])).toBe(true);
    expect(runLogin).toHaveBeenCalledWith(["mastodon.test"]);
  });

  it("routes accounts", async () => {
    expect(await dispatchCli(["accounts"])).toBe(true);
    expect(runAccounts).toHaveBeenCalledTimes(1);
  });

  it("returns false for no subcommand (server should start)", async () => {
    expect(await dispatchCli([])).toBe(false);
    expect(await dispatchCli(["--version"])).toBe(false);
  });
});
