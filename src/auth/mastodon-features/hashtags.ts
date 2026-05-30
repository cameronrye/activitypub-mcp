import { z } from "zod";
import { MAX_RESPONSE_SIZE } from "../../config.js";
import { readJsonWithLimit } from "../../utils/fetch-helpers.js";
import type { AccountCredentials } from "../account-manager.js";
import { authenticatedFetch } from "../adapters/write-adapter.js";

export const TagSchema = z.object({
  name: z.string(),
  url: z.string(),
  following: z.boolean().optional(),
  history: z.array(z.unknown()).optional(),
});
export type Tag = z.infer<typeof TagSchema>;

function normalizeTag(name: string): string {
  return encodeURIComponent(name.trim().replace(/^#/, ""));
}

async function tagAction(
  account: AccountCredentials,
  name: string,
  action: "follow" | "unfollow",
): Promise<Tag> {
  const response = await authenticatedFetch(
    account,
    `/api/v1/tags/${normalizeTag(name)}/${action}`,
    { method: "POST" },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to ${action} hashtag: HTTP ${response.status} - ${text}`);
  }
  return TagSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export function followHashtag(account: AccountCredentials, name: string): Promise<Tag> {
  return tagAction(account, name, "follow");
}
export function unfollowHashtag(account: AccountCredentials, name: string): Promise<Tag> {
  return tagAction(account, name, "unfollow");
}
