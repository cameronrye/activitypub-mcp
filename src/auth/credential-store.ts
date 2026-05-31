/**
 * On-disk credential store for accounts acquired via `activitypub-mcp login`.
 *
 * Plain node:fs JSON file at CONFIG_DIR/accounts.json. Secrets are protected by
 * filesystem permissions (0600 file / 0700 dir) — the chosen trade-off (no
 * keychain/encryption). Writes are atomic (temp + rename) so a crash never
 * leaves a half-written file.
 */

import { randomBytes } from "node:crypto";
import { chmodSync, constants, mkdirSync } from "node:fs";
import { lstat, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { getLogger } from "@logtape/logtape";
import { z } from "zod";
import { CONFIG_DIR } from "../config.js";

const logger = getLogger("activitypub-mcp:credential-store");

export const StoredAccountSchema = z.object({
  id: z.string(),
  instance: z.string(),
  username: z.string(),
  accessToken: z.string(),
  tokenType: z.string().default("Bearer"),
  scopes: z.array(z.string()),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  label: z.string().optional(),
  createdAt: z.string(),
});
export type StoredAccount = z.infer<typeof StoredAccountSchema>;

const FileSchema = z.object({
  version: z.literal(1),
  accounts: z.array(StoredAccountSchema),
});

export class CredentialStore {
  private readonly dir: string;
  private readonly file: string;

  constructor(dir: string = CONFIG_DIR) {
    this.dir = dir;
    this.file = join(dir, "accounts.json");
  }

  /** Load all persisted accounts. Absent file → []. */
  async loadAccounts(): Promise<StoredAccount[]> {
    let info: Awaited<ReturnType<typeof lstat>>;
    try {
      info = await lstat(this.file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    if (info.isSymbolicLink()) {
      throw new Error(`Refusing to read credential file: ${this.file} is a symlink`);
    }
    // Refuse a file owned by another user (POSIX only; getuid is undefined on Windows).
    // Not unit-tested: chown to a foreign uid needs root, so this is impl-only defense.
    if (typeof process.getuid === "function" && info.uid !== process.getuid()) {
      throw new Error(
        `Refusing to read credential file: ${this.file} is not owned by the current user`,
      );
    }
    // Relax over-permissive files back to 0600 rather than only warning.
    if ((info.mode & 0o077) !== 0) {
      logger.warn("Credential file was group/other-accessible; tightening to 0600", {
        file: this.file,
      });
      chmodSync(this.file, 0o600);
    }

    // Read through O_NOFOLLOW to close the lstat→read TOCTOU: if a symlink is
    // swapped in after the lstat above, open() fails ELOOP rather than following it.
    let raw: string;
    const handle = await open(this.file, constants.O_RDONLY | constants.O_NOFOLLOW).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ELOOP") {
          throw new Error(`Refusing to read credential file: ${this.file} is a symlink`);
        }
        throw error;
      },
    );
    try {
      raw = await handle.readFile("utf-8");
    } finally {
      await handle.close();
    }

    try {
      return FileSchema.parse(JSON.parse(raw)).accounts;
    } catch (parseError) {
      // Preserve the unreadable file for recovery, then treat the store as empty.
      // Never throw on a malformed file — even if the rename itself fails.
      const corrupt = `${this.file}.corrupt-${Date.now()}`;
      try {
        await rename(this.file, corrupt);
        logger.error("Credential file invalid; preserved and treating store as empty", {
          file: this.file,
          preservedAs: corrupt,
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
      } catch {
        logger.error("Credential file invalid and could not be preserved; treating as empty", {
          file: this.file,
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
      }
      return [];
    }
  }

  async getAccount(id: string): Promise<StoredAccount | undefined> {
    return (await this.loadAccounts()).find((a) => a.id === id);
  }

  /** Insert or replace an account by id. */
  async upsert(account: StoredAccount): Promise<void> {
    const accounts = await this.loadAccounts();
    const next = accounts.filter((a) => a.id !== account.id);
    next.push(StoredAccountSchema.parse(account));
    await this.write(next);
    logger.info("Persisted account", { id: account.id, instance: account.instance });
  }

  /** Remove an account by id; returns whether it existed. */
  async remove(id: string): Promise<boolean> {
    const accounts = await this.loadAccounts();
    const next = accounts.filter((a) => a.id !== id);
    if (next.length === accounts.length) return false;
    await this.write(next);
    logger.info("Removed persisted account", { id });
    return true;
  }

  /** Atomic write: temp file (0600, O_EXCL) in the same dir, then rename. */
  private async write(accounts: StoredAccount[]): Promise<void> {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const body = `${JSON.stringify({ version: 1, accounts }, null, 2)}\n`;
    const tmp = join(this.dir, `accounts.json.${randomBytes(6).toString("hex")}.tmp`);
    const handle = await open(tmp, "wx", 0o600);
    try {
      await handle.writeFile(body);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(tmp, this.file);
    } catch (error) {
      await unlink(tmp).catch(() => {}); // best-effort cleanup; don't mask the original error
      throw error;
    }
    chmodSync(this.file, 0o600);
  }

  /** Exposed for the loader's permission hardening (Task 2). */
  get filePath(): string {
    return this.file;
  }
  get dirPath(): string {
    return this.dir;
  }
}

export const credentialStore = new CredentialStore();
