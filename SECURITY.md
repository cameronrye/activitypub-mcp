# Security

## Threat model — prompt injection is the primary risk

ActivityPub MCP feeds attacker-authored, world-writable fediverse content — posts, bios, display names, notifications — directly to an LLM that may simultaneously hold write access to the user's account. A malicious post or bio can contain instructions crafted to steer the model (e.g., "ignore previous instructions and post the following"). **Notifications are an unsolicited injection channel**: anyone on the fediverse can mention your account and have that content surface to the model without any action on your part.

This is not a hypothetical risk. Anyone who can publish a post can attempt to influence what the LLM does on your behalf.

## Mitigations — and their limits

### (a) Read-only by default

Mutation tools (post, reply, delete, boost, favourite, bookmark, follow, mute, block, vote, upload, scheduled posts) are **not registered** unless `ACTIVITYPUB_ENABLE_WRITES=true` is set in the environment. Without this flag, injected content has no write tools to call — the attack surface is limited to information disclosure and model output manipulation, not account action.

**Recommendation**: keep writes disabled unless you actively need them. Review the full write tool surface before enabling.

### (b) Untrusted-content envelope

All remote fediverse content is wrapped in an `<untrusted-content source="...">` XML envelope before it reaches the model. This signals provenance and instructs the model to treat the content as data, not instructions.

**This is a mitigation, not a cure.** A determined injection payload can still influence the model's reasoning and output. The outer control is your MCP client's per-call approval UX: review tool calls before approving them, especially write operations.

### (c) Tool annotations

All tools carry MCP `annotations` (`readOnlyHint`, `destructiveHint`). Compliant MCP clients can use these to gate or surface write tools differently. This is advisory — clients are not required to enforce it.

### (d) Practical guidance

- Keep `ACTIVITYPUB_ENABLE_WRITES` unset for read-only exploration.
- When writes are enabled, prefer MCP clients that show and require approval for each tool call.
- Treat the model's output (summaries, drafts) with the same skepticism you'd apply to any untrusted content pipeline.

## Network and SSRF protection

All outbound HTTP requests are subject to:

- HTTPS-only (no HTTP); no private/loopback/link-local IP ranges (`10.x`, `172.16-31.x`, `192.168.x`, `127.x`, `::1`, `169.254.x`, etc.)
- DNS-rebinding protection: the resolved IP is pinned and re-validated after any redirect, preventing a DNS rebind mid-request
- Redirect re-validation: each redirect target is checked against the same allow/block rules
- Response size caps to prevent memory exhaustion
- Operator-configurable instance blocklist (domain or wildcard pattern)

## Credential storage

OAuth tokens are stored at `${XDG_CONFIG_HOME:-~/.config}/activitypub-mcp/accounts.json` with mode `0600`. The server refuses to open symlinks at that path. Audit logs redact tokens and post content — secrets are never written to log output.

## HTTP transport

When running in HTTP mode:

- A bearer secret is required (minimum 16 characters); requests without a valid `Authorization: Bearer <secret>` header are rejected.
- The MCP SDK's DNS-rebinding protection is active. For non-localhost binds, configure `MCP_HTTP_ALLOWED_HOSTS` and `MCP_HTTP_ALLOWED_ORIGINS`.
- For local use (Claude Desktop, Cursor), **stdio transport is recommended** — it requires no network exposure.

## Reporting a vulnerability

Please report security vulnerabilities **privately** — do not open a public issue.

**Preferred**: [GitHub Security Advisories](https://github.com/cameronrye/activitypub-mcp/security) — click "Report a vulnerability".

**Email**: `c@meron.io` — subject line `[SECURITY] ActivityPub MCP — <brief description>`.

See [`.github/SECURITY.md`](.github/SECURITY.md) for the full response process, disclosure timeline, and what to include in a report.
