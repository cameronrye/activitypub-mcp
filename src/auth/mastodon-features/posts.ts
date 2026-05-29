import { MAX_RESPONSE_SIZE } from "../../config.js";
import { readJsonWithLimit } from "../../utils/fetch-helpers.js";
import type { AccountCredentials } from "../account-manager.js";
import { authenticatedFetch, type Status, StatusSchema } from "../adapters/write-adapter.js";

export interface EditPostOptions {
  status: string;
  spoilerText?: string;
  sensitive?: boolean;
  language?: string;
  mediaIds?: string[];
}

async function parseStatus(response: Response, verb: string): Promise<Status> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to ${verb}: HTTP ${response.status} - ${text}`);
  }
  return StatusSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export async function editPost(
  account: AccountCredentials,
  statusId: string,
  options: EditPostOptions,
): Promise<Status> {
  const body: Record<string, unknown> = { status: options.status };
  if (options.spoilerText !== undefined) body.spoiler_text = options.spoilerText;
  if (options.sensitive !== undefined) body.sensitive = options.sensitive;
  if (options.language) body.language = options.language;
  if (options.mediaIds?.length) body.media_ids = options.mediaIds;
  const response = await authenticatedFetch(account, `/api/v1/statuses/${statusId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return parseStatus(response, "edit post");
}

export async function pinPost(account: AccountCredentials, statusId: string): Promise<Status> {
  return parseStatus(
    await authenticatedFetch(account, `/api/v1/statuses/${statusId}/pin`, { method: "POST" }),
    "pin post",
  );
}

export async function unpinPost(account: AccountCredentials, statusId: string): Promise<Status> {
  return parseStatus(
    await authenticatedFetch(account, `/api/v1/statuses/${statusId}/unpin`, { method: "POST" }),
    "unpin post",
  );
}
