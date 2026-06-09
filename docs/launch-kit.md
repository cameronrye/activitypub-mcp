# Launch Kit

Everything needed to run the coordinated launch. Distribution — not code quality —
has been the binding constraint across every review; this is the lever. The one
manual step the maintainer must do is **record the demo** (it needs real accounts
and a live Claude session). Everything else below is ready to copy/paste.

The hook is the product's most shareable angle: **a Claude session reading and
posting to the Fediverse, demoed on the Fediverse itself.**

---

## 1. Demo recording script (do this first — it's the centerpiece)

Record a ~20–30s screen capture (GIF or short MP4) of one continuous Claude session.
Save it to `docs/demo.gif`, then uncomment the demo block at the top of `README.md`.

Suggested shot list (keep it tight, no dead air):

1. **Explore** — "Find the @mastodon@mastodon.social account and summarize what
   they've posted recently." → show `discover-actor` + `fetch-timeline` results.
2. **Discover** — "What active Mastodon instances are there for developers?" →
   show `discover-instances --software mastodon` + a `search --type hashtags`.
3. **(Optional, writes on)** — "Post a hello to my Mastodon account." → show
   `post-status` succeeding, then open the live post in a browser tab.

Recording tips:
- 720p+, large terminal font, light or dark theme consistent with the site.
- Trim to the moments where a tool call returns — cut the thinking pauses.
- Target < 5 MB so it loads fast inline on GitHub/npm. `gifski`/`ffmpeg` can
  downscale and cap the frame rate (10–12 fps is plenty).
- A `.mp4`/`.webm` is fine too — GitHub renders short videos; npm needs a GIF or a
  hosted image, so a GIF is the safest single asset.

---

## 2. Show HN

**Title:**
`Show HN: ActivityPub MCP – let Claude read and post to Mastodon/Misskey`

**Body:**
> I built an MCP server that gives Claude (or any MCP client) tools to explore and
> interact with the Fediverse — Mastodon, Misskey, Pleroma, and compatible servers.
> It does WebFinger/NodeInfo discovery, reads timelines and threads, searches, and
> (opt-in) can post, reply, follow, and boost on your behalf.
>
> It's read-only by default. Writes are gated behind an explicit env flag and a
> per-account OAuth/MiAuth login. Untrusted Fediverse content is wrapped in an
> `<untrusted-content>` envelope before it reaches the model, all outbound requests
> go through an SSRF-guarded fetch (allow-list + IP pinning + redirect re-validation),
> and every write is audit-logged.
>
> `npx activitypub-mcp` or one-click install from the README. It's on npm and in the
> official MCP registry. Feedback welcome — especially on the security model and on
> which platforms to support next.
>
> Repo: https://github.com/cameronrye/activitypub-mcp
> Docs: https://cameronrye.github.io/activitypub-mcp/

Post Tue–Thu, ~8–10am ET. Reply to every comment in the first two hours.

---

## 3. Mastodon / Misskey (native — post from the very platforms it reads)

> 🧵 New: ActivityPub MCP — a Model Context Protocol server that lets an LLM like
> Claude explore and interact with the Fediverse.
>
> It reads timelines, threads, and trends across Mastodon, Misskey & Pleroma — and
> can post/reply/follow when you opt in. Read-only by default, security-first.
>
> This post was written with help from the thing itself. 🤖
>
> npm: `npx activitypub-mcp`
> Code: https://github.com/cameronrye/activitypub-mcp
>
> #Fediverse #Mastodon #Misskey #MCP #AI #LLM #ActivityPub

(Pin it. The "posted from the tool it demos" angle is the whole point — say so.)

---

## 4. r/LocalLLaMA (and r/selfhosted)

**Title:** `ActivityPub MCP: give your LLM read/write access to the Fediverse (Mastodon, Misskey, Pleroma)`

**Body:** lead with the demo GIF. Two sentences on what it does, one on the
security posture (read-only default, SSRF guard, untrusted-content envelope,
opt-in writes), then the install one-liner and repo link. Ask: "what platform or
workflow should I add next?"

---

## 5. MCP community (Discord / awesome-lists / directories)

- Post in the MCP Discord `#showcase` / `#servers` channel with the GIF + one-liner.
- Already listed on punkpeye/awesome-mcp-servers; confirm the entry is current.
- Re-index on Glama (needs maintainer login).
- Submit/refresh on mcpservers.org and any aggregator that accepts new servers.

---

## 6. One unified one-liner (use everywhere — npm, GitHub About, social)

> Read-only-by-default MCP server: let LLMs explore the Fediverse — Mastodon, Misskey, Pleroma.

---

## Pre-launch checklist (land before driving traffic)

- [x] API reference + getting-started examples corrected (this PR)
- [x] Scheduled-post bug fixed; remote error bodies fenced (this PR)
- [x] Unified tagline in npm/server.json/manifest (this PR)
- [ ] **Demo GIF recorded → `docs/demo.gif`, README block uncommented** (maintainer)
- [ ] GitHub repo: set About tagline to the one-liner; fix topics
      (drop `fedify`; add `mastodon`, `misskey`, `claude`, `llm`, `model-context-protocol`)
- [ ] GitHub repo: upload `public/og-image.png` as the social preview
- [x] Dead `/discussions` links removed (Discussions is disabled; links now point to Issues).
      Re-add them only if Discussions is enabled.
- [ ] Cut a patch release so the new npm description/tagline goes live
