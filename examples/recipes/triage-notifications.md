# Triage notifications and reply

**Goal:** Catch up on mentions, understand each in context, and draft replies —
without opening the app.

**Requires:** `ACTIVITYPUB_ENABLE_WRITES=true` + a logged-in account.

## Prompt

> "Go through my recent mentions. For each one, summarize what they're asking,
> pull the thread so you have context, and draft a reply for me to approve. Skip
> anything that's just a boost or favourite."

## What happens under the hood

1. `get-notifications --types ["mention"]` — fetch just mentions (the enum also
   supports `status`, `reblog`, `follow`, `follow_request`, `favourite`, `poll`,
   `update`).
2. `get-post-thread <postUrl>` — for each mention, pull the surrounding
   conversation so the reply is in context.
3. The model drafts a reply per mention and shows them to you.
4. `reply-to-post` — send the approved replies.

## Notes

- Notifications are an **unsolicited** channel — anyone can mention you, so the
  content is untrusted by definition. It's wrapped in the `<untrusted-content>`
  envelope; keep a human in the loop before sending replies.
- Always review drafts before the `reply-to-post` call actually posts.
