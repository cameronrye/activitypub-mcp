import { z } from "zod";
import { MAX_RESPONSE_SIZE } from "../../config.js";
import { readJsonWithLimit } from "../../utils/fetch-helpers.js";
import type { AccountCredentials } from "../account-manager.js";
import { authenticatedFetch } from "../adapters/write-adapter.js";

export const FilterSchema = z.object({
  id: z.string(),
  title: z.string(),
  context: z.array(z.string()),
  filter_action: z.enum(["warn", "hide"]),
  keywords: z
    .array(z.object({ id: z.string(), keyword: z.string(), whole_word: z.boolean() }))
    .default([]),
});
export type Filter = z.infer<typeof FilterSchema>;

export type FilterContext = "home" | "notifications" | "public" | "thread" | "account";

export interface CreateFilterOptions {
  title: string;
  context: FilterContext[];
  keywords: string[];
  filterAction?: "warn" | "hide";
  wholeWord?: boolean;
}

async function fail(response: Response, verb: string): Promise<never> {
  const text = await response.text();
  throw new Error(`Failed to ${verb}: HTTP ${response.status} - ${text}`);
}

export async function getFilters(account: AccountCredentials): Promise<Filter[]> {
  const response = await authenticatedFetch(account, "/api/v2/filters", { method: "GET" });
  if (!response.ok) await fail(response, "get filters");
  return z.array(FilterSchema).parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export async function createFilter(
  account: AccountCredentials,
  options: CreateFilterOptions,
): Promise<Filter> {
  const body = {
    title: options.title,
    context: options.context,
    filter_action: options.filterAction ?? "warn",
    keywords_attributes: options.keywords.map((keyword) => ({
      keyword,
      whole_word: options.wholeWord ?? false,
    })),
  };
  const response = await authenticatedFetch(account, "/api/v2/filters", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok) await fail(response, "create filter");
  return FilterSchema.parse(await readJsonWithLimit(response, MAX_RESPONSE_SIZE));
}

export async function deleteFilter(account: AccountCredentials, filterId: string): Promise<void> {
  const response = await authenticatedFetch(account, `/api/v2/filters/${filterId}`, {
    method: "DELETE",
  });
  if (!response.ok) await fail(response, "delete filter");
}
