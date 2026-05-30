import { z } from "zod";
import { MAX_RESPONSE_SIZE } from "../../config.js";
import { readJsonWithLimit } from "../../utils/fetch-helpers.js";
import type { AccountCredentials } from "../account-manager.js";
import { authenticatedFetch, type Status, StatusSchema } from "../adapters/write-adapter.js";

export const ListSchema = z.object({
  id: z.string(),
  title: z.string(),
  replies_policy: z.enum(["followed", "list", "none"]).optional(),
  exclusive: z.boolean().optional(),
});
export type List = z.infer<typeof ListSchema>;

export const AccountLiteSchema = z.object({
  id: z.string(),
  username: z.string(),
  acct: z.string(),
  display_name: z.string().optional(),
  url: z.string(),
});
export type AccountLite = z.infer<typeof AccountLiteSchema>;

export interface ListOptions {
  title: string;
  repliesPolicy?: "followed" | "list" | "none";
  exclusive?: boolean;
}

function listBody(options: Partial<ListOptions>): string {
  const body: Record<string, unknown> = {};
  if (options.title !== undefined) body.title = options.title;
  if (options.repliesPolicy) body.replies_policy = options.repliesPolicy;
  if (options.exclusive !== undefined) body.exclusive = options.exclusive;
  return JSON.stringify(body);
}

async function fail(response: Response, verb: string): Promise<never> {
  const text = await response.text();
  throw new Error(`Failed to ${verb}: HTTP ${response.status} - ${text}`);
}

export async function createList(account: AccountCredentials, options: ListOptions): Promise<List> {
  const response = await authenticatedFetch(account, "/api/v1/lists", {
    method: "POST",
    body: listBody(options),
  });
  if (!response.ok) await fail(response, "create list");
  return ListSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export async function getLists(account: AccountCredentials): Promise<List[]> {
  const response = await authenticatedFetch(account, "/api/v1/lists", { method: "GET" });
  if (!response.ok) await fail(response, "get lists");
  return z.array(ListSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export async function updateList(
  account: AccountCredentials,
  listId: string,
  options: Partial<ListOptions>,
): Promise<List> {
  const response = await authenticatedFetch(account, `/api/v1/lists/${listId}`, {
    method: "PUT",
    body: listBody(options),
  });
  if (!response.ok) await fail(response, "update list");
  return ListSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export async function deleteList(account: AccountCredentials, listId: string): Promise<void> {
  const response = await authenticatedFetch(account, `/api/v1/lists/${listId}`, {
    method: "DELETE",
  });
  if (!response.ok) await fail(response, "delete list");
}

export async function getListTimeline(
  account: AccountCredentials,
  listId: string,
  options?: { limit?: number; maxId?: string; minId?: string },
): Promise<Status[]> {
  const params = new URLSearchParams({ limit: String(options?.limit ?? 20) });
  if (options?.maxId) params.set("max_id", options.maxId);
  if (options?.minId) params.set("min_id", options.minId);
  const response = await authenticatedFetch(account, `/api/v1/timelines/list/${listId}?${params}`, {
    method: "GET",
  });
  if (!response.ok) await fail(response, "get list timeline");
  return z.array(StatusSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export async function addListAccounts(
  account: AccountCredentials,
  listId: string,
  accountIds: string[],
): Promise<void> {
  const response = await authenticatedFetch(account, `/api/v1/lists/${listId}/accounts`, {
    method: "POST",
    body: JSON.stringify({ account_ids: accountIds }),
  });
  if (!response.ok) await fail(response, "add list accounts");
}

export async function removeListAccounts(
  account: AccountCredentials,
  listId: string,
  accountIds: string[],
): Promise<void> {
  const response = await authenticatedFetch(account, `/api/v1/lists/${listId}/accounts`, {
    method: "DELETE",
    body: JSON.stringify({ account_ids: accountIds }),
  });
  if (!response.ok) await fail(response, "remove list accounts");
}

export async function getListAccounts(
  account: AccountCredentials,
  listId: string,
  options?: { limit?: number },
): Promise<AccountLite[]> {
  const params = new URLSearchParams({ limit: String(options?.limit ?? 40) });
  const response = await authenticatedFetch(account, `/api/v1/lists/${listId}/accounts?${params}`, {
    method: "GET",
  });
  if (!response.ok) await fail(response, "get list accounts");
  return z.array(AccountLiteSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}
