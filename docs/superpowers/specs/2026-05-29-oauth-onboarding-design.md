# Browser-Based Login + Credential Persistence — Design

**Date:** 2026-05-29
**Status:** Approved (design)
**Sub-project:** 2 of 4 (foundation-first sequencing; follows the platform-aware write layer)

> This design was adversarially reviewed (Mastodon OAuth2 + Misskey MiAuth protocol
> fact-checks against upstream docs/source, codebase-fit, RFC 8252/7636/9700 security,
> and completeness). The protocol details below are verified; the network-plumbing,
> loopback-port, re-auth-seam, and credential-store sections reflect the review's
> corrections.

## Problem

Authenticated accounts are created **only** from environment variables at process
startup (`ACTIVITYPUB_DEFAULT_INSTANCE`/`ACTIVITYPUB_DEFAULT_TOKEN`, or the
pipe-delimited `ACTIVITYPUB_ACCOUNTS`) and live **in memory** for the lifetime of the
process (`src/auth/account-manager.ts`). Two consequences:

1. **No way to acquire a token.** Users must manually create an access token on their
   instance (Mastodon: Preferences → Development → New application; Misskey: Settings →
   API) and paste it into an env var. There is no OAuth/authorization flow anywhere in
   the codebase.
2. **Nothing persists.** The runtime account tools (`list-accounts`, `switch-account`)
   operate on the in-memory map; there is no durable store, so a token must be
   re-supplied on every launch.

SP1 (platform-aware write layer) made Misskey writes work, but a Misskey user still has
to hand-provision a token. SP2 closes that onboarding gap.

## Goal

Add a real browser-based login flow that acquires and **persists** an access token,
covering **Mastodon-family OAuth2** and **Misskey/Foundkey MiAuth**, routed by the
existing `getInstanceSoftware()` NodeInfo detection. Delivered as **CLI subcommands on
the existing `activitypub-mcp` bin** plus a **persistent credential store** that
`AccountManager` loads at startup.

The environment-variable path is **unchanged and remains first-class** for headless/CI
deployments. Persisted accounts are additive.

## Non-goals

- **No token refresh / expiry machinery.** Mastodon and Misskey access tokens are
  long-lived today; re-running `login` is the recovery path. (See "Token lifetime".)
- **No OS keychain or at-rest encryption.** Secrets are protected by file permissions
  (`0600`) — the explicit trade-off chosen during brainstorming.
- **No MCP-tool-driven (LLM-mediated) login.** The interactive flow is a CLI concern;
  the LLM never sees the authorization code or token.
- **No HTTP-transport callback route.** The loopback callback is a local one-shot
  server owned by the CLI, independent of the optional StreamableHTTP transport.
- **No headless-browser onboarding.** Interactive login assumes a local browser and a
  reachable `127.0.0.1` loopback. Headless/CI users continue to use env-var tokens
  (documented). The flow prints the authorize URL as a fallback but adds no
  out-of-band paste mode.
- **No new runtime dependency.** Implemented with `node:http`, `node:crypto`, `node:fs`,
  and `node:child_process` only, consistent with the lean prod-dependency set
  (`@logtape/logtape`, `@modelcontextprotocol/sdk`, `zod`).

## Architecture

New `src/auth/login/` directory, parallel to the SP1 `src/auth/adapters/`:

```text
src/auth/
  login/
    login-strategy.ts   // LoginStrategy interface + LoginResult/AuthorizeContext types
    mastodon-oauth.ts   // MastodonOAuthStrategy: app registration, authorize, token, revoke (PKCE)
    miauth.ts           // MisskeyMiAuthStrategy: session UUID, miauth consent, check
    resolve.ts          // resolveLoginStrategy(instance) via getInstanceSoftware()
    loopback-server.ts  // one-shot 127.0.0.1 HTTP callback (RFC 8252), ephemeral port
    browser.ts          // cross-platform browser opener (argv-array spawn); prints URL fallback
    scopes.ts           // the per-platform scope/permission constants (single source of truth)
  credential-store.ts   // node:fs JSON store, XDG config dir, 0700 dir / 0600 file; CRUD
  account-manager.ts    // (modify) async loadPersisted() merges store with env-var accounts
src/cli/
  index.ts              // subcommand dispatch (login / logout / accounts)
  login.ts              // `login <instance>` orchestration + LoginResult→StoredAccount mapping
  logout.ts             // `logout <id>`
  accounts.ts           // `accounts` (merged list, no secrets)
src/utils/fetch-helpers.ts // (modify) export guardedFetch() — guarded UNauthenticated fetch
src/discovery/nodeinfo.ts  // (modify) refactor private fetchJson to call guardedFetch
src/mcp-main.ts            // (modify) subcommand dispatch before validateConfiguration()/server
src/mcp-server.ts          // (modify) await accountManager.loadPersisted() at top of start()
src/mcp/tools-write.ts     // (modify) "no account" hint + 401 re-auth hint wiring
src/utils/errors.ts        // (modify) add TokenRejectedError
src/config.ts              // (modify) register ACTIVITYPUB_CONFIG_DIR
.env.example, .env.production.example, README.md // (modify) document login + storage
```

### `LoginStrategy` interface

```ts
export interface AuthorizeContext {
  instance: string;            // validated bare domain (DomainSchema), lowercased
  redirectUri: string;         // http://127.0.0.1:<ephemeral-port>/callback
  scopes: string[];            // platform-appropriate scope/permission list (from scopes.ts)
  // Injected by the CLI orchestrator (the shared mechanics):
  openBrowser: (url: string) => Promise<void>;
  waitForCallback: (expected: { state?: string; session?: string }) => Promise<URLSearchParams>;
}

export interface LoginResult {
  instance: string;            // lowercased
  username: string;            // bare local handle from the platform "whoami"
  accessToken: string;
  tokenType: string;           // "Bearer"
  scopes: string[];            // Mastodon: granted scope from /oauth/token; Misskey: requested perms
  clientId?: string;           // cached for revoke (Mastodon only)
  clientSecret?: string;       // cached for revoke (Mastodon only)
}

export interface LoginStrategy {
  readonly kind: "mastodon" | "misskey";
  authorize(ctx: AuthorizeContext): Promise<LoginResult>;
  /** Revoke the access token server-side. Unimplemented on Misskey (no MiAuth revoke). */
  revoke?(account: StoredAccount): Promise<void>;
}
```

`StoredAccount` (below) is the home type, declared in `credential-store.ts`;
`login-strategy.ts` imports it **type-only**. The CLI (`src/cli/login.ts`) maps
`LoginResult → StoredAccount` (assigning `id`, `createdAt`, `label`) and calls
`store.upsert()` — strategies never touch the store.

The CLI orchestrator owns the shared mechanics (ephemeral-port selection, loopback
server, browser open, timeout) and injects them via `AuthorizeContext`, so each strategy
contains only its platform's protocol steps and is unit-testable with mocked seams.

### Strategy selection (`login/resolve.ts`)

```text
resolveLoginStrategy(instance):
  info = await getInstanceSoftware(instance)        // cached + single-flight (SP1)
  name = info.software?.name?.toLowerCase()
  if name in { "misskey", "foundkey" }  -> misskeyMiAuthStrategy
  else                                  -> mastodonOAuthStrategy   // incl. unavailable/unknown
```

Identical routing rule and fail-safe default (Mastodon) as `adapters/resolve.ts`, which
is correct for Pleroma/Akkoma/GotoSocial (Mastodon-compatible OAuth2). **Caveats the
implementation must handle:**

- **Sharkey/Firefish** are Misskey-family forks but their NodeInfo software name is
  `sharkey`/`firefish`, so they route to the **Mastodon OAuth2** strategy. Recent
  builds expose the Mastodon `/api/v1/apps` + `/oauth/*` endpoints, so this works; if a
  given build only speaks MiAuth, the OAuth2 strategy fails with a clear error. (Not
  worth a capability probe in v1; documented limitation.)
- **GotoSocial** does not implement PKCE (it ignores the challenge params — harmless,
  see below) and only honors granular scopes since v0.19.0. The implementation must read
  the **granted** scope from the `/oauth/token` response rather than assuming the
  requested string was honored.
- **Foundkey** *inherited* MiAuth but is **deprecating/removing it** in favor of OAuth2.
  On a Foundkey build where `features.miauth` (from `GET /api/meta`) is false, the
  MiAuth `/check` endpoint may not exist and the strategy fails. v1 routes `foundkey →
  MiAuth` and surfaces a clear error on failure; a `features.miauth` probe is a possible
  future refinement. Documented limitation.

## Flows

Both flows use a **loopback redirect** (RFC 8252 §7.3 — OAuth for native apps): the CLI
binds a one-shot HTTP server to **`127.0.0.1:0` (an ephemeral, OS-assigned port)** and
uses the resulting `http://127.0.0.1:<port>/callback` as the callback. An ephemeral port
(not a fixed well-known one) is required so a co-resident local process cannot
pre-bind a predictable port and steal the callback (RFC 9700 §4.8) — this is the **sole**
channel protection on the Misskey path, which has no PKCE. `--port <N>` is an explicit
override for firewalled setups only. The instance is validated (`DomainSchema`) and
blocklist-checked **before** the browser is opened.

### Mastodon-family OAuth2

Because Mastodon/Doorkeeper matches `redirect_uri` by **exact string** (it does *not*
honor RFC 8252 §7.3 variable-loopback-port), and the port is ephemeral per login, a
**fresh client app is registered each login** — there is no cross-login client-app
cache. (App records are lightweight; this trades a little instance-side app sprawl for
the security of ephemeral ports.)

1. **Client app:** `POST https://<instance>/api/v1/apps` (form-encoded) with
   `client_name=activitypub-mcp`, `redirect_uris=<loopback>`, `scopes=read write follow`,
   `website=https://github.com/cameronrye/activitypub-mcp`. Response yields `client_id`
   + `client_secret`.
2. **PKCE:** generate `code_verifier` = base64url(`crypto.randomBytes(32)`) (43–128 chars,
   no padding) and `code_challenge` = base64url(sha256(`code_verifier`)). We **always**
   send `code_challenge`/`code_challenge_method=S256` at authorize and **always** send
   `code_verifier` at token. PKCE S256 is the **primary** code-interception defense for
   this native app (RFC 8252 §8.1); the Mastodon `client_secret` is a registration
   artifact, **not** a truly confidential credential (it is stored in `accounts.json`
   and re-issued to anyone who registers). PKCE landed in Mastodon **4.3.0** (S256 only;
   `plain` rejected); pre-4.3 instances ignore the unknown `code_challenge` param and
   the `client_secret` carries the exchange — so the flow completes either way because we
   unconditionally send both.
3. **Authorize:** open
   `https://<instance>/oauth/authorize?response_type=code&client_id=…&redirect_uri=…&scope=read%20write%20follow&state=<csprng>&code_challenge=…&code_challenge_method=S256`.
   `state` = base64url(`crypto.randomBytes(32)`) (≥128 bits).
4. **Callback:** the loopback server resolves **only** when `/callback` carries a `state`
   that matches the generated value (length-safe constant-time compare via
   `crypto.timingSafeEqual`); a missing/mismatched `state` → 404, no resolve. If the
   instance returns an `iss` param, verify it matches the expected instance origin
   (mix-up defense). On match, serve a **static** "you can close this window" page (no
   reflection of `code`/`state`) and shut the server down.
5. **Token:** `POST https://<instance>/oauth/token` (form-encoded) with
   `grant_type=authorization_code`, `code`, `client_id`, `client_secret`, `redirect_uri`,
   `code_verifier`, `scope`. The token endpoint origin is the **originally-resolved,
   guarded instance** — never anything derived from the callback. Parse `access_token`,
   `token_type`, and the authoritative **granted** `scope` (space-separated; may differ
   from requested — parse defensively).
6. **Whoami:** `GET https://<instance>/api/v1/accounts/verify_credentials` (this is the
   one call with a token, so it uses SP1 `authenticatedFetch`) → `username`.
7. Build `LoginResult` (carrying `clientId`/`clientSecret`) → CLI persists.

`revoke(account)`: `POST https://<instance>/oauth/revoke` (form-encoded) with `client_id`,
`client_secret`, `token`.

### Misskey / Foundkey MiAuth

1. **Session:** generate a v4 UUID with `crypto.randomUUID()` (CSPRNG, ~122 bits). Treat
   it as a **secret** — the bearer of the UUID can call the public `/check` and obtain
   the real token.
2. **Authorize:** open
   `https://<instance>/miauth/<uuid>?name=activitypub-mcp&callback=<url-encoded loopback>&permission=<comma-separated perms>`.
   No `icon` (CLI app), no app pre-registration, no client secret.
3. **Callback:** Misskey redirects to the callback with `?session=<uuid>` appended. The
   loopback resolves **only** when the returned `session` equals the generated UUID
   (constant-time compare); otherwise 404, no resolve.
4. **Check:** `POST https://<instance>/api/miauth/<uuid>/check` (empty JSON body `{}`),
   called **immediately and exactly once** → `{ ok: true, token, user }`. The `token` is
   the access token; `user.username` is the whoami (no separate verify call needed — the
   `user` object is returned inline).
5. Build `LoginResult` (no `clientId`/`clientSecret`; `scopes` = the requested permission
   set, since `/check` does not report the granted subset) → CLI persists.

`revoke` is **not implemented** on Misskey: there is no documented public MiAuth revoke
endpoint (server-side revocation is only via the instance's Settings → API UI). `logout`
drops the local record and prints a note pointing to the instance UI.

**Misskey permission set** (`login/scopes.ts`, trimmed to least-privilege for the SP1
write surface — all strings verified to exist in `misskey-js` `consts.ts`):
`read:account` (whoami + home timeline + relationship reads — Misskey has no separate
read-timeline scope), `read:following`, `write:notes` (post/reply/renote),
`write:reactions`, `write:following` (follow/unfollow), `write:blocks`, `write:mutes`,
`write:drive` (media upload), `read:notifications`. **Deliberately omitted:**
`write:votes` and `write:notifications` (SP1 makes poll-voting Mastodon-only and exposes
notifications read-only), and the unused `read:blocks`/`read:mutes`/`read:drive`.

### Shared mechanics

- **`loopback-server.ts`:** binds `node:http` to `127.0.0.1:0` (ephemeral; never
  `0.0.0.0`); reads the assigned port from `server.address()`. Responds **static 404** to
  any path other than `/callback` and to `/callback` requests lacking the expected
  `state`/`session`, **without** resolving (so a local prober cannot DoS the one-shot
  promise with junk). Resolves the promise only on a valid callback; caps request
  header/body size; rejects on a **300s** timeout. Always closes the socket in a
  `finally`. The success page is static HTML.
- **`browser.ts`:** spawns the platform opener with `child_process.spawn` using an
  **argv array (never a shell string)** — `open <url>` (darwin), `xdg-open <url>`
  (linux/other), and on win32 `cmd /c start "" <url>` with the URL as a discrete argument
  (no shell interpolation of `&`/`%`/`^`). On spawn failure it logs and the CLI prints
  the URL for manual opening (the loopback keeps listening).
- **Guarded unauthenticated fetch (`guardedFetch`):** the pre-token calls (Mastodon
  `/api/v1/apps`, `/oauth/token`, `/oauth/revoke`; Misskey `/check`) have **no token**, so
  they **cannot** use SP1 `authenticatedFetch` (which forces a `Bearer` header and JSON
  content-type). Instead, generalize `nodeinfo.ts`'s private `fetchJson` into an exported
  `guardedFetch(url, { method, headers, body })` in `utils/fetch-helpers.ts` that runs
  `validateExternalUrl(url)` + `instanceBlocklist.validateNotBlocked(host)` +
  `fetchWithRedirectGuard` (re-validating every hop) + `AbortController` timeout +
  `readJsonWithLimit(MAX_RESPONSE_SIZE)`, and lets the caller set method/headers/body.
  Mastodon `/api/v1/apps` and `/oauth/token`/`/oauth/revoke` send
  `Content-Type: application/x-www-form-urlencoded` (`URLSearchParams` body); the Misskey
  `/check` sends `application/json` `{}`. `nodeinfo.ts` is refactored to call the same
  helper (its current GET-only behavior is the default). Only the post-token Mastodon
  whoami uses `authenticatedFetch`.

## Credential store (`src/auth/credential-store.ts`)

- Plain `node:fs` JSON file (no `unstorage` — it is not a project dependency). Directory:
  `ACTIVITYPUB_CONFIG_DIR` if set, else `${XDG_CONFIG_HOME:-~/.config}/activitypub-mcp/`
  (tilde expanded to `os.homedir()`). File: `accounts.json`.
- Record shape:

  ```ts
  interface StoredAccount {
    id: string;            // default `${username}@${instance}` (both lowercased); or --id
    instance: string;      // lowercased
    username: string;      // bare local handle from whoami; '@'/whitespace rejected
    accessToken: string;
    tokenType: string;     // "Bearer"
    scopes: string[];
    clientId?: string;     // Mastodon only (for revoke)
    clientSecret?: string; // Mastodon only (for revoke)
    label?: string;
    createdAt: string;     // ISO 8601 (local record time; distinct from OAuth created_at)
  }
  ```

- **API:** `load(): Promise<StoredAccount[]>`, `upsert(account)`, `remove(id)`,
  `get(id)`. (No client-app cache — ephemeral ports make a fresh Mastodon app per login,
  so `clientId/clientSecret` live on the account record only, for revoke.)
- **Atomic, race-safe write:** create a temp file **in the same directory** with
  `fs.open(tmp, 'wx', 0o600)` (`O_EXCL` + randomized suffix → no symlink/TOCTOU), write,
  `fsync`, then `fs.rename` onto `accounts.json` (atomic, same filesystem). The directory
  is created `0700`.
- **Load-time hardening:** if `accounts.json` is a symlink, or the directory/file is
  group/other-writable, **refuse** to read and log an error. If the file mode is more
  permissive than `0600`, actively `chmod 0600` (not merely warn). Validate the resolved
  config dir is owned by the current user.
- **Malformed file:** a Zod schema validates on load. **Absent** file → empty store
  (normal). **Present but invalid** → preserve it as `accounts.json.corrupt-<ts>`, log
  loudly, and treat the store as empty (so the next `upsert` does not destroy a
  recoverable file).

**Security note (documented in README):** access tokens and Mastodon client secrets are
stored in plaintext, protected only by filesystem permissions. This matches the
ergonomics of `gh`/`npm` and is the chosen trade-off; users wanting stronger at-rest
protection should use the env-var path with an external secret manager.

## AccountManager integration & startup

`node:fs` reads are asynchronous, but the `accountManager` singleton is constructed
synchronously at import. Therefore:

- The synchronous `loadFromEnvironment()` stays in the constructor (back-compat:
  env-only deployments need no async step).
- Add `async loadPersisted(): Promise<void>` that reads the store and, **for each
  record, explicitly guards the collision rule** — `addAccount()` does an unconditional
  `set()` and will **not** enforce precedence on its own:

  ```text
  loadPersisted():
    for rec in store.load():
      if accountManager.getAccount(rec.id):    // env-var account already holds this id
        log.warn("persisted account shadowed by env account", { id }); continue   // env wins
      accountManager.addAccount(rec)            // createdAt is regenerated in-memory; the
                                                // on-disk record keeps its original createdAt
  ```

- `src/mcp-server.ts` awaits `accountManager.loadPersisted()` at the **very top of
  `start()`**, before the `if (mode === 'http')` branch, so it precedes `connect()` for
  **both** transports. A store failure is caught and logged (env accounts still load; the
  server still starts), matching the "malformed store → warn + treat as empty" row.
- **Collision rule:** env-var account wins on duplicate `id`. Default persisted `id` is
  `username@instance` (both lowercased), which won't collide with common env ids
  (`default`, or user-chosen `ACTIVITYPUB_ACCOUNTS` ids) in practice; the `--id` override
  can collide, in which case env still wins and the persisted record is skipped+warned.
- Persisted accounts then appear automatically in `list-accounts` / `switch-account` with
  no change to those tools.

## CLI surface (single bin)

`src/mcp-main.ts` currently only handles `-h`/`-v` and drops non-flag positionals with no
dispatch. The entry point gains **explicit subcommand dispatch at the top of `main()`** —
before `validateConfiguration()` and `new ActivityPubMCPServer()` — so the CLI paths
never construct a server/transport. If `argv[0]` is a known subcommand, route to
`src/cli/*` and return; otherwise the no-arg/flags-only path starts the server
**unchanged**.

| Command | Behavior |
|---------|----------|
| `activitypub-mcp login <instance> [--port N] [--id ID] [--label L]` | Run the resolved login flow; map `LoginResult → StoredAccount`; `store.upsert`; print `Authorized as @user@instance`. |
| `activitypub-mcp logout <id>` | If the stored account has `clientId/clientSecret` (Mastodon), call `revoke()`; then `store.remove(id)`. Misskey: remove locally + print the instance-UI note. Env-var accounts have no on-disk record and cannot be logged out this way (clear error). |
| `activitypub-mcp accounts` | Call `loadPersisted()` and print the **same merged view** as `list-accounts` (env + persisted, marking the source), **no secrets**, so the two surfaces agree. |
| *(no subcommand / only flags)* | Start the MCP server exactly as today. **Unchanged default.** |

Subcommand parsing is a small hand-rolled parser (no new dependency). Unknown subcommands
print usage and exit non-zero.

## Re-authentication guidance

No automatic refresh. The hint attaches at the seam that **actually observes** the
failure — not the pre-request account-presence guards:

- **Token rejected (revoked/expired):** the shared `guardedFetch` / `authenticatedFetch`
  throws a typed `TokenRejectedError` (new, in `utils/errors.ts`, carrying
  `instance` + `username`) on HTTP **401/403**. The write tools' existing error
  formatting (`formatErrorWithSuggestion(getErrorMessage(error))`, used by all ~28 catch
  blocks) renders its message: *"The token for @user@instance was rejected (revoked or
  expired). Run `activitypub-mcp login <instance>` to re-authorize."* The
  `verifyAccount() == null` branch (and the `verify-account` tool's "invalid or expired"
  message) carry the same hint as a second hook.
- **No account configured at all:** the existing `requireWriteEnabled` /
  `requireAuthEnabled` messages (which fire when `hasAccounts()` is false, before any
  HTTP) gain an **additive** clause pointing at `login`, alongside the current env-var
  guidance. These guards never see a 401, so they only own the "never logged in" case.

## Token lifetime

Mastodon OAuth access tokens do not expire by default and no refresh token is issued in
this flow (Doorkeeper `access_token_expires_in` is nil; `use_refresh_token` off); Misskey
MiAuth tokens have no expiry column. The design stores only the access token and treats
re-login as the renewal path. **Forward-looking note:** Mastodon plans conditional
expiry/refresh for public clients / `offline_access` (~5.0); we deliberately do **not**
request `offline_access`, and some Mastodon-compatible forks may already expire tokens —
the re-auth guidance above covers all of these without refresh machinery.

## Security model (RFC 8252 / 7636 / 9700)

- **Loopback:** `127.0.0.1`-only, **ephemeral** OS-assigned port (anti port-stealing),
  one-shot, 300s timeout, static 404 on unexpected paths/params, size caps.
- **PKCE** S256 is the primary native-app code-interception defense; verifier
  base64url(32 CSPRNG bytes); challenge base64url(sha256). The Mastodon `client_secret`
  is treated as a non-confidential registration artifact.
- **CSRF / replay:** `state` (Mastodon) and `session` (Misskey) are CSPRNG values,
  compared length-safe with `crypto.timingSafeEqual`; absent/mismatch aborts with nothing
  persisted.
- **Mix-up:** the token exchange targets only the originally-resolved, guarded instance
  origin (never an origin derived from the callback); verify `iss` when present. The
  browser leg is unguarded by design, so the loopback must not infer any endpoint from
  callback contents.
- **SSRF:** instance validated (`DomainSchema`) + blocklist before the browser opens and
  before every server→instance fetch; redirect guard re-validates each hop. The loopback
  (`127.0.0.1`) is intentionally exempt from those instance guards.
- **Secret hygiene:** `login/*`, `credential-store`, and the CLI **never** log
  `accessToken`, `clientSecret`, `code`, `code_verifier`, the MiAuth `session`/`token`, or
  raw platform error bodies that might echo them — only `instance` + `username` + `scopes`.
  Error bodies are scrubbed (strip query strings / known secret fields) before printing. A
  unit test asserts no secret substring appears in captured stdout/log output for a full
  login.
- **At rest:** `0600` file / `0700` dir, atomic `O_EXCL` write, symlink/permission
  refusal on load (see Credential store).

## Configuration

New env var, registered in `src/config.ts` (mirroring how v2.1 added
`MCP_INSTANCE_SOFTWARE_TTL_MS`) and documented in `.env.example` /
`.env.production.example`:

| Var | Default | Description |
|-----|---------|-------------|
| `ACTIVITYPUB_CONFIG_DIR` | `${XDG_CONFIG_HOME:-~/.config}/activitypub-mcp` | Directory for the persisted credential store (`accounts.json`). |

Scope constants live in `login/scopes.ts` (single source of truth, referenced by both app
registration and the authorize URL): Mastodon `MASTODON_SCOPES = "read write follow"`
(broad and maximally compatible; `follow` is deprecated since 3.5.0 and redundant with
`write`, but kept for compatibility and to match the existing `StoredAccount.scopes`
default — narrowing to granular `write:*` sub-scopes is a possible future refinement given
the plaintext-storage blast radius), and the trimmed Misskey permission list above.

## Build sequence (foundation-first, single plan)

Land the offline-testable core before the browser-dependent parts:

1. **`credential-store.ts`** + `TokenRejectedError` — fully unit-testable (temp dir,
   perms, atomic write, malformed-file tolerance).
2. **`AccountManager.loadPersisted()`** + the `start()` await + collision rule — unblocks
   list/switch integration; testable with a seeded store.
3. **`guardedFetch`** helper + `nodeinfo.ts` refactor — shared plumbing, regression-tested
   against existing nodeinfo tests.
4. **`loopback-server.ts`** + **`browser.ts`** shared mechanics (injected/mocked).
5. **`mastodon-oauth.ts`** + **`miauth.ts`** strategies + **`resolve.ts`** (MSW-mocked).
6. **`src/cli/*`** + `mcp-main.ts` dispatch.
7. **Re-auth hint** wiring in `tools-write.ts` / error formatting (last; additive text).

## Testing (TDD)

**Unit (Vitest + MSW), all offline:**

- `mastodon-oauth.test.ts` — MSW for `/api/v1/apps`, `/oauth/token`,
  `/api/v1/accounts/verify_credentials`, `/oauth/revoke`. Assert form-encoded bodies, PKCE
  params, exact `redirect_uri`, fresh app per login, `state` verification, granted-scope
  parsing, error extraction.
- `miauth.test.ts` — MSW for `/api/miauth/<uuid>/check`. Assert authorize URL composition
  (trimmed permissions, callback), session match, token/user mapping, error extraction.
- `login-resolve.test.ts` — routing matrix mirroring `adapters/resolve.test.ts`.
- `loopback-server.test.ts` — ephemeral bind, `/callback` resolves only on valid
  state/session, 404 + no-resolve on junk/other paths, timeout, `127.0.0.1`-only.
- `credential-store.test.ts` — temp `ACTIVITYPUB_CONFIG_DIR`: CRUD, `0600`/`0700`, atomic
  + `O_EXCL` write, symlink/permission refusal, malformed→`.corrupt-<ts>` preservation.
- `guarded-fetch.test.ts` — SSRF/blocklist rejection for each method; form vs JSON bodies.
- Secret-hygiene test — a full mocked login leaks no token/secret/verifier/session to
  captured stdout or logger output.
- `browser.ts` — opener injected/mocked; a URL containing `&`/`%`/`^` causes no command
  injection (argv-array).

**Regression:** existing `account-manager` env-var tests pass unchanged; `loadPersisted`
with an empty/absent store is a no-op; `nodeinfo` tests pass after the `guardedFetch`
refactor; write-tool tests still pass (re-auth hint is additive text).

**No live integration tests** (real OAuth needs a real account/instance).

## Dependency / cycle note

`login/*` imports `config`, `utils/fetch-helpers` (`guardedFetch`), `validation/url`,
`validation/schemas` (`DomainSchema`), `policy/instance-blocklist`, `discovery/nodeinfo`,
the SP1 `authenticatedFetch` (whoami only), and the **type-only**
`StoredAccount`/`AccountCredentials`. `credential-store` imports only `node:*` + `zod` +
`config`. `account-manager` imports the store at runtime; `login/*` is imported by
`src/cli/*` and never by `account-manager`, so there is no cycle.

## Out of scope (later sub-projects)

- Token refresh / short-lived-token rotation; `offline_access`.
- OS keychain / at-rest encryption; granular Mastodon `write:*` scope narrowing.
- MCP-tool-driven (in-conversation) login; HTTP-transport OAuth callback route.
- Out-of-band (paste-the-code) headless onboarding.
- A `features.miauth` capability probe for Foundkey / Sharkey-Firefish OAuth detection.
- New feature tools (SP3); per-instance circuit breaker / persistent cache (SP4).

## Open questions

None. All forks were resolved during brainstorming and the adversarial review:
CLI + **ephemeral-port** loopback; **`node:fs`** `0600` persistence (corrected from the
"unstorage" option label once confirmed it is not a project dependency); both platforms
via a strategy interface; env-wins-on-collision (explicitly guarded in `loadPersisted`);
single-bin argv dispatch; a new guarded **unauthenticated** fetch helper (not
`authenticatedFetch`) for pre-token calls; the re-auth hint at the 401-observing seam
(not the presence guards); and the full scope set (logout/revoke, list/switch
integration, re-auth prompt, `accounts` subcommand).
