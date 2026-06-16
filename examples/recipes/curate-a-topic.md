# Curate the best posts on a topic

**Goal:** Find strong posts on a topic and act on them — favourite, boost to your
followers, and bookmark for later.

**Requires:** `ACTIVITYPUB_ENABLE_WRITES=true` + a logged-in account.

## Prompt

> "Find the most interesting recent posts about **the Fediverse** on
> mastodon.social. Show me the top 5; for the ones I approve, favourite them,
> boost them to my followers, and bookmark them so I can write about them later."

## What happens under the hood

1. `search mastodon.social "fediverse" --type statuses` (or
   `get-trending-posts mastodon.social`) — gather candidate posts.
2. The model presents the top picks for your approval.
3. Per approved post:
   - `favourite-post <postId>` — like it.
   - `boost-post <postId>` — share to your followers.
   - `bookmark-post <postId>` — save it for later.
4. Review later with `get-bookmarks` / `get-favourites`. Undo with
   `unfavourite-post`, `unboost-post`, `unbookmark-post`.

## Notes

- Each action is a separate write call — keep a human in the loop so boosts to
  your followers are intentional.
- Boosting amplifies content to everyone who follows you; prefer favourite +
  bookmark when you only want a private signal.
