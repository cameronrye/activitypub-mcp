import { z } from "zod";
import { MAX_RESPONSE_SIZE } from "../../config.js";
import { readJsonWithLimit } from "../../utils/fetch-helpers.js";
import type { AccountCredentials } from "../account-manager.js";
import {
  authenticatedFetch,
  type Relationship,
  RelationshipSchema,
} from "../adapters/write-adapter.js";
import { type AccountLite, AccountLiteSchema } from "./lists.js";

export async function getFollowRequests(
  account: AccountCredentials,
  options?: { limit?: number },
): Promise<AccountLite[]> {
  const params = new URLSearchParams({ limit: String(options?.limit ?? 40) });
  const response = await authenticatedFetch(account, `/api/v1/follow_requests?${params}`, {
    method: "GET",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get follow requests: HTTP ${response.status} - ${text}`);
  }
  return z.array(AccountLiteSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

async function decide(
  account: AccountCredentials,
  accountId: string,
  action: "authorize" | "reject",
): Promise<Relationship> {
  const response = await authenticatedFetch(
    account,
    `/api/v1/follow_requests/${accountId}/${action}`,
    { method: "POST" },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to ${action} follow request: HTTP ${response.status} - ${text}`);
  }
  return RelationshipSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export function acceptFollowRequest(
  account: AccountCredentials,
  accountId: string,
): Promise<Relationship> {
  return decide(account, accountId, "authorize");
}
export function rejectFollowRequest(
  account: AccountCredentials,
  accountId: string,
): Promise<Relationship> {
  return decide(account, accountId, "reject");
}
