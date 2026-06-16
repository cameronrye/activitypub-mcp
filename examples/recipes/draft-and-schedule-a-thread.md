# Draft and schedule a thread

**Goal:** Turn an idea into a polished multi-post thread and schedule it to go out
later.

**Requires:** `ACTIVITYPUB_ENABLE_WRITES=true` + a logged-in account
(`npx activitypub-mcp login <instance>`).

## Prompt

> "Draft a 3-post thread introducing my new open-source project **Foo** (a
> local-first note app). Keep each post under 500 characters, friendly tone, and
> schedule the first one for tomorrow at 9am my time. Show me the drafts before
> posting."

## What happens under the hood

1. The model drafts the thread and shows it to you for approval.
2. `post-status` with `scheduledAt` (ISO 8601, must be in the future) — schedules
   the first post. Returns a **scheduled-post id** (it is not published yet).
3. `reply-to-post` for posts 2 and 3, chaining each as a reply — or schedule them
   too.
4. `get-scheduled-posts` — confirm what's queued. Adjust with
   `update-scheduled-post` or `cancel-scheduled-post`.

## Notes

- `scheduledAt` must be in the future; the target instance enforces its own
  minimum lead time (typically ~5 minutes).
- A scheduled `post-status` returns a scheduled-post id, **not** a published post —
  replies can only chain once the parent has actually been published.
- Keep visibility in mind: pass `visibility: "public" | "unlisted" | "private" |
  "direct"`. Default is `public`.
