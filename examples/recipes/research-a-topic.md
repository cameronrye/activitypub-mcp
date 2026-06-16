# Research a topic across the Fediverse

**Goal:** Get a digest of what the Fediverse is saying about a topic, pulling
from multiple instances and accounts.

**Requires:** nothing — read-only, no account.

## Prompt

> "Research what people are saying about **local-first software** on the
> Fediverse. Find a couple of active tech instances, pull recent posts and
> trending discussion on the topic, look at a few of the most relevant authors'
> timelines, and give me a short digest with links."

## What happens under the hood

1. `discover-instances --software mastodon --language en --minUsers 1000` — find
   candidate instances (filters by software/size/language, not topic).
2. `search <instance> "local-first" --type statuses` and
   `get-trending-posts <instance>` — surface posts on the topic.
3. `discover-actor <handle>` + `fetch-timeline <handle>` — read the most relevant
   authors in their own words.
4. The model synthesizes a digest from the gathered posts.

## Notes

- All fetched content is wrapped in an `<untrusted-content>` envelope — the model
  treats posts as data, not instructions.
- Swap in any topic and any instance. `search`/`get-trending-posts` need a
  Mastodon- or Misskey-API instance; `discover-actor`/`fetch-timeline` work on any
  ActivityPub server.
