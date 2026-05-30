# OAuth / MiAuth Onboarding Flow — Design

**Date:** 2026-05-29
**Status:** Approved (design)
**Sub-project:** 2 of 4 (stacked on SP1 — platform-aware write layer)

## Problem

Today the only way to authenticate is to manually create an app in the
instance's settings, copy an access token, and set it in an env var
(`ACTIVITYPUB_DEFAULT_TOKEN` / `ACTIVITYPUB_ACCOUNTS`). For an LLM-first tool
whose headline use case is "ask Claude to post for me," that manual setup is the
single biggest adoption blocker. There is also **no `add-account` tool and no
persistence** — accounts live only in an in-memory `Map` loaded from env at
startup (`src/auth/account-manager.ts`).

## Goal

Let an LLM walk a user through connecting a fediverse account end-to-end, and
persist the acquired credentials so they survive restarts. Cover Mastodon
(OAuth) and Misskey/Foundkey (MiAuth), auto-selected via SP1's
`resolveSoftwareKind`.

Non-goals: token refresh/rotation (Mastodon tokens don't expire by default);
revoking tokens server-side; loopback-redirect capture (out-of-band paste only);
a UI.

## Decisions (from brainstorming)

1. **Callback mechanism: out-of-band (OOB) paste.** `redirect_uri =
   urn:ietf:wg:oauth:2.0:oob`. Portable; no port binding; works identically in
   stdio and HTTP transport modes.
2. **Persistence: 0600 file.** Acquired accounts saved to a JSON file loaded at
   startup alongside env accounts, so re-auth survives restarts.
3. **Platforms: Mastodon OAuth + Misskey MiAuth**, auto-selected by detected
   software.

## Architecture

Mirrors SP1's per-platform adapter pattern.

```
src/auth/
  token-store.ts            // persist/load acquired accounts to a 0600 JSON file
  login/
    login-provider.ts       // LoginProvider interface + PendingLogin union + shared helpers
    mastodon-oauth.ts       // MastodonOAuthProvider
    misskey-miauth.ts       // MisskeyMiAuthProvider
    login-manager.ts        // beginLogin / completeLogin; holds ephemeral pending state
src/mcp/
  tools-auth.ts             // start-login + complete-login MCP tools
```

### `LoginProvider` interface (`login-provider.ts`)

```ts
interface LoginResult { accessToken: string; tokenType: string; }
interface LoginProvider {
  // Register/initiate and return the URL the user must open plus provider state.
  begin(instance: string): Promise<{ authorizeUrl: string; pending: PendingLoginData }>;
  // Finish: Mastodon needs the pasted code; Misskey ignores it (uses pending.uuid).
  complete(pending: PendingLoginData, code?: string): Promise<LoginResult>;
}
```

`PendingLogin` is a discriminated union persisted only in memory:

```ts
type PendingLogin =
  | { kind: "mastodon"; instance: string; clientId: string; clientSecret: string; createdAt: number }
  | { kind: "misskey";  instance: string; uuid: string; createdAt: number };
```

### `login-manager.ts`

- `beginLogin(instance)`: `resolveSoftwareKind` (SP1) → pick provider →
  `provider.begin(instance)` → generate a `loginId` (`crypto.randomUUID`) →
  store `PendingLogin` in `Map<loginId, PendingLogin>` → return
  `{ loginId, authorizeUrl, instructions }`.
- `completeLogin(loginId, code?)`: look up pending (reject if missing or older
  than 10 min; prune expired on access) → `provider.complete(pending, code)` →
  build `AccountCredentials` (verify via SP1 `resolveWriteAdapter(account)
  .verifyCredentials` to fetch the real username/id) → `accountManager
  .addAccount(creds)` → `tokenStore.save(account)` → delete pending → return
  `{ accountId, username, instance }`. **Never returns the token.**
- Account id for acquired accounts: `${kind}:${instance}:${username}` (stable,
  avoids colliding with the env "default" id; re-auth of the same account
  overwrites in place).

### `token-store.ts`

- Path: `MCP_TOKEN_STORE` env, default `~/.config/activitypub-mcp/accounts.json`.
- `loadAll(): AccountCredentials[]` — read + `JSON.parse` + Zod-validate each
  entry against the account schema; on missing/corrupt file or invalid entry,
  log a warning and return what's valid (never throw at startup).
- `save(account)` — upsert by id; write file with `mode 0600`; ensure parent dir
  exists with `mode 0700`.
- `remove(id)` — drop by id and rewrite.
- Writes are full-file rewrites (small N); no concurrent-writer handling needed
  (single process).

### `account-manager.ts` integration

- Constructor: after `loadFromEnvironment()`, call `loadFromTokenStore()` which
  `tokenStore.loadAll()` then `addAccount()`s each — **skipping ids that already
  exist** (env accounts win) with a debug log.
- New method `addAndPersistAccount(creds)`: `addAccount(creds)` then
  `tokenStore.save(account)`. Used by `completeLogin`. (Env/store-loaded accounts
  use plain `addAccount` and are not re-persisted.)

### MCP tools (`tools-auth.ts`)

- **`start-login`** `{ instance: string }` → `login-manager.beginLogin` → returns
  prose: the authorize URL + step-by-step instructions (Mastodon: "open this,
  approve, copy the code, then call `complete-login` with it"; Misskey: "open
  this, approve, then call `complete-login` — no code needed") + the `loginId`.
- **`complete-login`** `{ loginId: string; code?: string }` →
  `login-manager.completeLogin` → returns success prose (account id, username,
  instance; "now the active account" if first). Errors (unknown/expired loginId,
  missing code for Mastodon, exchange/check failure) return a clear message.
- Both registered alongside existing tools so the dynamic `server-info`
  capability registry lists them automatically. Audit-logged via the existing
  `auditLogger.logToolInvocation` pattern (token redacted — only instance/loginId
  logged).

## Provider details

### Mastodon OAuth (`mastodon-oauth.ts`)
- `begin`: `POST /api/v1/apps` `{ client_name, redirect_uris:
  "urn:ietf:wg:oauth:2.0:oob", scopes: "read write follow", website }` →
  `{ client_id, client_secret }`. Build
  `https://<instance>/oauth/authorize?response_type=code&client_id=…
  &redirect_uri=urn:ietf:wg:oauth:2.0:oob&scope=read+write+follow`.
- `complete`: require `code`; `POST /oauth/token` `{ grant_type:
  "authorization_code", client_id, client_secret, redirect_uri:
  "urn:ietf:wg:oauth:2.0:oob", code, scope }` → `{ access_token, token_type }`.
- PKCE skipped — confidential client (we hold `client_secret`); broadly
  compatible across Mastodon versions.

### Misskey MiAuth (`misskey-miauth.ts`)
- `begin`: `uuid = crypto.randomUUID()`. Build
  `https://<instance>/miauth/<uuid>?name=<app>&permission=read:account,write:notes,
  write:following,write:reactions,write:blocks,write:mutes,write:drive`. No app
  registration needed.
- `complete`: ignore `code`; `POST /api/miauth/<uuid>/check` → `{ ok, token,
  user }`. Throw if `ok` is false.

## Security
- All OAuth/MiAuth HTTP uses the same guards as SP1: `validateExternalUrl`
  (https-only, SSRF allow-list), `instanceBlocklist.validateNotBlocked`,
  redirect re-validation, response-size cap. App-register/token/check requests
  reuse the guarded fetch helper (a no-auth variant — no Authorization header
  until the token exists).
- `client_secret` lives only in the in-memory pending map; only the final access
  token is persisted.
- Tokens never logged and never returned in tool output.
- Token-store file `0600`, dir `0700`; `.gitignore` guidance noted in README.
- Pending logins expire after 10 minutes.

## Configuration
- `MCP_TOKEN_STORE` — token-store file path (default
  `~/.config/activitypub-mcp/accounts.json`).
- `MCP_OAUTH_APP_NAME` — client_name / MiAuth app name (default
  `activitypub-mcp`).
- `MCP_OAUTH_APP_WEBSITE` — optional website for app registration.

## Testing (TDD)
- `token-store.test.ts`: save/load round-trip in a temp dir; file mode `0600`;
  corrupt/missing file tolerated; upsert-by-id; env-wins dedupe on load.
- `mastodon-oauth.test.ts`: `begin` posts to `/api/v1/apps` and builds the
  correct authorize URL; `complete` posts to `/oauth/token` and returns the
  token; missing-code error. (msw-mocked.)
- `misskey-miauth.test.ts`: `begin` builds the `/miauth/<uuid>` URL with
  permissions; `complete` posts to `/api/miauth/<uuid>/check`; `ok:false` error.
- `login-manager.test.ts`: provider selection by software (mock
  `getInstanceSoftware`); unknown/expired `loginId`; happy path calls
  `addAndPersistAccount`.
- `tools-auth.test.ts`: `start-login`/`complete-login` for both platforms;
  token never appears in output; error messages for bad inputs.
- No real network; no real filesystem outside an OS temp dir.

## Out of scope (later sub-projects)
- Edit/pin/lists/filters/profile/follow-requests tools (SP3)
- Circuit breaker, persistent response cache (SP4)
