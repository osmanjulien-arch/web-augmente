# Context memory MCP

This module adds explicit personal context notes to the existing OAuth-protected
`/mcp` endpoint. It does not import or automatically synchronize ChatGPT history.
There is no Drive integration or `memory_archive` tool in this MVP.

## Architecture and isolation

- `src/context-memory.js` owns validation, bounded retrieval, D1 SQL, and tools.
- `CONTEXT_DB` is a **new, dedicated D1 database**. `WA_MEMORY` and `OAUTH_KV`
  retain their original purpose, bindings, and contents. There is no fallback.
- Without the binding, memory tools return `{ "ok": false,
  "error": "not_configured", "binding": "CONTEXT_DB" }` as a tool error.
- Existing France Travail tools, page capture, and `/api/wa` continue through
  their existing code. Only verified OAuth scopes control memory write access.
- This remains a single-owner MCP (`wa-personal-user`), shared across that
  owner's authorized clients. It is not a multi-tenant memory service.

`context_revisions` is an immutable journal keyed by `(key, version)`.
Every revision includes project, tags, status, summary, full body, source,
source creation timestamp and server update timestamp. Source and body from the
first save remain available as version 1 even when later versions change them.
`context_heads` is a compact index maintained by an INSERT trigger in the same
SQLite transaction. History UPDATE/DELETE triggers reject accidental mutation.

`memory_save.expected_version` is required: 0 means create only, and a positive
number must match the current version. A parameterized `INSERT ... SELECT`
checks the index and appends the revision atomically. A losing concurrent save
returns `version_conflict`; callers must read the current note, resolve changes
and explicitly retry. Never retry a stale save blindly. No replace/upsert of
history occurs. The migration is additive and re-applicable (`IF NOT EXISTS`);
it never drops tables or rewrites existing data.

Deletion is not implemented. `archived` changes status while retaining readable
history; it is not deletion. A future explicit deletion flow should add a
reversible tombstone and deliberately define visibility of historical versions.

## Scopes and consent

`memory:read` remains required for `/mcp` and works with existing tokens.
It registers `memory_overview`, `memory_load`, and `memory_get` alongside the
existing tools. The `memory_save` descriptor is visible to read-only clients,
but an unprivileged call returns `insufficient_scope` and an MCP OAuth
re-authorization challenge. Without a verified `memory:write` grant, the
write callback never reaches D1. The installed SDK publishes per-tool OAuth
requirements through the documented compatibility `_meta.securitySchemes`
field (it does not yet forward top-level `securitySchemes`).

For writes the client must explicitly request **both** `memory:read memory:write`
and the owner must submit the consent form showing both permissions. Merely
advertising support for write does not grant it. Existing grants/tokens are not
upgraded: reconnect with the additional scope and approve the new consent.
Write alone and unknown requested scopes are rejected.

`mcpApiHandler` unwraps/verifies the bearer token through the existing provider,
requires an actual scope array containing read, and passes only those verified
scopes to tool registration. Neither token `props`, client input, nor request
context `props` supplies write authority. The write callback also checks its
captured scope set. OAuth clients, KV namespaces, token lifetime, PKCE and
personal-secret/CSRF checks retain their existing behavior.

## Tools and latency

| Tool | Behavior |
| --- | --- |
| `memory_overview` | README-style compact index; at most 40 current metadata entries |
| `memory_load` | One call; optional exact `project` and substring `topic` (key, summary, tags) |
| `memory_get` | Exact key; optional positive historical `version`; latest by default |
| `memory_save` | Explicit note with key, project, summary, body, source, source_created_at, expected_version; optional tags/status |

Load depths: `compact` returns at most 20 metadata entries; `recent` returns at
most 12 current notes with 1,500-character body excerpts (`body_excerpt: true`);
`deep` returns at most 8 current notes with their bodies and sources. All depths
order by most recent server update; deep does not fetch every revision.
The compact query never selects bodies/history. Body reads join only the exact
current `(key, version)`, or get one exact historical version. Indexes cover
project/update order and global update order. Topic search scans compact
metadata, not bodies. No embeddings, model calls, external HTTP or KV listing
are needed. Actual D1 latency has not been measured remotely.

Read tools accept `char_budget`: default 8,000, range 512–48,000. This bounds the
entire serialized JSON text payload, including warning/metadata (MCP protocol
envelope excluded). Bodies/sources/summaries are shortened and final entries
omitted when necessary; `truncated: true` signals this. `more_available: true`
signals the SQL result limit. Use project/topic or exact get to narrow results;
there is no pagination cursor in this MVP. Empty successful reads return
`items: []`. Error responses use fixed codes and never echo rejected input or
SQL exceptions. Storage failures return `storage_unavailable`.

Body limit: 16,000 characters; source: 4,000; summary: 500; key/project: 120;
tags: at most 12 of 40 characters. Save replaces the full current note by adding
a complete revision; it is not a partial-field patch.

All archived fields, including summaries and sources, are labeled **untrusted
data** in retrieval output/tool descriptions. Instructions inside them are not
tool instructions and must not be executed. Nothing evaluates archived text.
Credential checks reject obvious private keys, credential assignments, bearer
tokens, common token formats, URL credentials, and configured personal/France
Travail secrets before persistence. This is a heuristic, not comprehensive DLP:
do not submit secrets or import unreviewed histories. No memory content or SQL
errors are logged by this module. Source text/URLs are stored as data and never
fetched automatically. No third-party code was copied from Memory-MCP; this
implementation was written for this Worker's OAuth architecture.

## Local validation (no remote resources required)

From `worker/`:

```powershell
npm test
npm test -- --configLoader native # Alternative for Windows Vite config-loader EPERM
npm run check
node scripts/check-context-memory-local.mjs
```

Vitest config supplies an ephemeral Miniflare D1 binding and injects the real
migration text; production Wrangler config needs no fake database ID. Tests
cover SQL history/concurrent versions, empty/filter/depth/budget retrieval,
injection labeling, credentials, missing binding, MCP read/write registration,
forged props, consent, and actual OAuth PKCE flow for read and write. The
supplemental Node >=22 SQLite script runs without child processes or network;
it tests real SQLite statements but does not validate workerd or OAuth.

## Provisioning after review — instructions only

No resources have been provisioned and `wrangler.jsonc` is intentionally
unchanged. Do not deploy until local validation and review succeed.

After owner approval, create a dedicated database (this command modifies the
Cloudflare account):

```powershell
npx wrangler d1 create web-augmente-context
```

Merge the generated binding into `wrangler.jsonc`, keeping all existing KV and
other configuration. Use the actual returned ID, never the placeholder below:

```jsonc
// Example fragment ONLY — not a deployable config.
"d1_databases": [{
  "binding": "CONTEXT_DB",
  "database_name": "web-augmente-context",
  "database_id": "<actual-generated-database-id>",
  "migrations_dir": "migrations"
}]
```

First apply/test locally:

```powershell
npx wrangler d1 migrations apply CONTEXT_DB --local
npm test
npm run check
```

Only after a separate production review, apply the additive migration remotely
(`npx wrangler d1 migrations apply CONTEXT_DB --remote`) and deploy with the
usual approved process. Then verify existing read tokens, new explicit write
consent, save/get/stale conflict, `/api/wa`, and France Travail in production.
Local tests do not prove real account binding IDs, migration installation,
ChatGPT scope requests, OAuth reconnection, or remote D1 performance.

## Validation in this implementation session

- `npm test`: **53 passed**, two test files, real workerd/Miniflare D1 and the official OAuth provider. The suite also passed with the optional native config loader. No external resources or real secrets were required.
- `node scripts/check-context-memory-local.mjs`: **6 passed**, supplemental
  in-memory SQLite checks. Node prints its experimental SQLite warning.
- Syntax checks for both changed source modules and both test files passed;
  `git diff --check` passed (Git also reports LF/CRLF normalization notices).
- `npm run check`: **passed**, Wrangler dry-run built a 1,253 KiB Worker bundle (227 KiB gzip) without deployment. Production configuration still has only the two existing KV bindings; `CONTEXT_DB` is not provisioned or bound.
- Root repository `npm run check` and `npm test` are not green: **44/46 tests passed**. The two failures concern a previously stale generated userscript bundle and a missing root `linkedom` installation, neither of which was modified for context memory. They remain separate from the passing Worker suite.

The Cloudflare test runner warns that `WA_API_TOKEN` is absent from local
environment configuration; the OAuth tests supply their own test-only secrets.
No real secrets are needed for these tests. No remote provisioning, migration,
deployment, commit, or push was performed. Production `wrangler.jsonc` and the
pre-existing untracked scripts/error log were left untouched.
