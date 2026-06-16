# Profile a single account

**Goal:** Understand who an account is and what they post about, without scrolling
their profile yourself.

**Requires:** nothing — read-only, no account.

## Prompt

> "Give me a profile of **@gargron@mastodon.social** — who they are, what they
> mostly post about, and the gist of any thread they've started recently."

## What happens under the hood

1. `discover-actor @gargron@mastodon.social` — resolves the handle via WebFinger
   and returns the actor (bio, name, type).
2. `fetch-timeline @gargron@mastodon.social` — reads recent posts from the actor's
   outbox.
3. `get-post-thread <postUrl>` — for any post that's part of a conversation, pulls
   the surrounding thread for context.
4. The model summarizes themes and notable threads.

## Notes

- Works on **any** ActivityPub server, not just Mastodon — try a Lemmy community
  (`@technology@lemmy.world`), a PeerTube channel, or a GoToSocial account.
- Content warnings are surfaced with a `⚠️ CW:` marker, so sensitive posts are
  flagged before their body is shown.
