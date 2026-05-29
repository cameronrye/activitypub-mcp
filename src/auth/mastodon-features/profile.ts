import { MAX_RESPONSE_SIZE } from "../../config.js";
import { readJsonWithLimit } from "../../utils/fetch-helpers.js";
import type { AccountCredentials } from "../account-manager.js";
import {
  type AccountInfo,
  AccountInfoSchema,
  authenticatedFetch,
} from "../adapters/write-adapter.js";

export interface UpdateProfileOptions {
  displayName?: string;
  note?: string;
  bot?: boolean;
  locked?: boolean;
  fields?: Array<{ name: string; value: string }>;
}

export async function updateProfile(
  account: AccountCredentials,
  options: UpdateProfileOptions,
): Promise<AccountInfo> {
  const body: Record<string, unknown> = {};
  if (options.displayName !== undefined) body.display_name = options.displayName;
  if (options.note !== undefined) body.note = options.note;
  if (options.bot !== undefined) body.bot = options.bot;
  if (options.locked !== undefined) body.locked = options.locked;
  if (options.fields) {
    body.fields_attributes = options.fields.map((f) => ({ name: f.name, value: f.value }));
  }
  const response = await authenticatedFetch(account, "/api/v1/accounts/update_credentials", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update profile: HTTP ${response.status} - ${text}`);
  }
  return AccountInfoSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}
