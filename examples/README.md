# Recipes

Copy-pasteable workflows for driving the Fediverse through an LLM with
`activitypub-mcp`. Each recipe is written at the altitude you actually work at —
a natural-language prompt you give the assistant — and lists the tools it
triggers, what it needs, and what you get back.

## Read-only (no account, works out of the box)

| Recipe | What it does | Key tools |
|--------|--------------|-----------|
| [Research a topic across the Fediverse](recipes/research-a-topic.md) | Find instances, surface trending/searched posts, and digest them | `discover-instances`, `search`, `get-trending-posts`, `fetch-timeline` |
| [Profile a single account](recipes/account-digest.md) | Summarize who someone is and what they post about | `discover-actor`, `fetch-timeline`, `get-post-thread` |

These work on **any** ActivityPub server for `discover-actor` / `fetch-timeline`
(Mastodon, Misskey, Pleroma, Lemmy, PeerTube, GoToSocial, Pixelfed). The
instance-API tools (`search`, `get-trending-*`, `get-public-timeline`) require a
Mastodon- or Misskey-API instance.

## Write (requires `ACTIVITYPUB_ENABLE_WRITES=true` + a logged-in account)

| Recipe | What it does | Key tools |
|--------|--------------|-----------|
| [Draft and schedule a thread](recipes/draft-and-schedule-a-thread.md) | Compose a multi-post thread and schedule it for later | `post-status`, `reply-to-post`, `get-scheduled-posts` |
| [Triage notifications and reply](recipes/triage-notifications.md) | Read mentions in context and draft replies | `get-notifications`, `get-post-thread`, `reply-to-post` |
| [Post an image with alt text](recipes/post-image-with-alt-text.md) | Upload media with accessibility text and attach it to a post | `upload-media`, `post-status` |
| [Curate the best posts on a topic](recipes/curate-a-topic.md) | Find, then favourite / boost / bookmark good posts | `search`, `favourite-post`, `boost-post`, `bookmark-post` |

> **Before enabling writes,** read the [threat model](../SECURITY.md). Write
> tools mutate your real account. Log in with `npx activitypub-mcp login <instance>`.

See the [full tool reference](https://cameronrye.github.io/activitypub-mcp/docs/api/tools/)
for every parameter, and the [docs examples](https://cameronrye.github.io/activitypub-mcp/docs/guides/examples/)
for expected-output walkthroughs.
