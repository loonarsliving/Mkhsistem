# Company File Manager

A WhatsApp-driven catalog of company files whose actual bytes live only on
the owner's **local Mac Mini at home** — never in Supabase, never on
Vercel. This document is the architecture reference; see the `Filemanager`
repo's own README for how to actually install and run the agent.

## Why this shape

- **Files never leave the Mac Mini.** MK Connect's database only ever holds
  metadata (category, filename, tags, description, size, checksum, and a
  path relative to the agent's storage root) — see migration
  `0245_company_file_manager.sql`'s header comment. This keeps company
  documents (contracts, legal, HR files — potentially sensitive) out of a
  Supabase project this repo's own docs already flag as shared/free-tier.
- **The Mac Mini has no public URL.** It sits behind a home router with no
  port forwarding, by design — nothing reaches in. Every connection in this
  integration is initiated BY the agent, never TO it: it pushes its catalog
  up, and it polls for work. MK Connect (Vercel) never calls the agent
  directly.
- **Only MK Connect holds WhatsApp credentials.** The agent never sees
  `WHACENTER_DEVICE_ID`/WhatsApp tokens — it fetches file bytes and hands
  them to MK Connect, which does the actual send. This keeps the Mac Mini's
  blast radius small: if it's compromised, an attacker can read files under
  its configured storage root and call one authenticated endpoint — not
  send arbitrary WhatsApp messages from the company number.

## Flow

```
Employee (WhatsApp)                 MK Connect (Vercel)                Mac Mini agent (Filemanager repo)
        │                                    │                                    │
        │  "kirim saya file kontrak ABC"     │                                    │
        ├───────────────────────────────────>│                                    │
        │                                    │ lib/ai/domains/file-request.ts:    │
        │                                    │  Gemini classifies intent,         │
        │                                    │  searches mkc_files by keyword     │
        │                                    │                                    │
        │  "Ketemu: kontrak-abc.pdf,         │                                    │
        │   sedang disiapkan..."             │                                    │
        │<───────────────────────────────────┤                                    │
        │                                    │  mkc_file_requests row             │
        │                                    │  status='matched'                  │
        │                                    │                                    │
        │                                    │<───────── GET /api/files/agent/    │
        │                                    │            requests/pending        │
        │                                    │            (polled every N sec)    │
        │                                    │                                    │
        │                                    │            reads file bytes off    │
        │                                    │            local disk              │
        │                                    │                                    │
        │                                    │<───────── POST /api/files/agent/   │
        │                                    │            requests/:id/deliver    │
        │                                    │            (multipart file upload) │
        │                                    │                                    │
        │                                    │  stages bytes in a private,        │
        │                                    │  10-minute-signed-URL Storage      │
        │                                    │  bucket (mkc-file-delivery-temp),  │
        │                                    │  sends via WhatsApp connector,     │
        │                                    │  then deletes the staged object    │
        │                                    │                                    │
        │  📄 kontrak-abc.pdf                │                                    │
        │<───────────────────────────────────┤                                    │
```

Ambiguous matches (multiple candidate files) or no matches are resolved
entirely on the WhatsApp side by `file-request.ts` — the agent is never
involved unless there's exactly one confident match.

## Data model (migration `0245_company_file_manager.sql`)

- `mkc_file_categories` — mirrors the Mac Mini's folder tree. `parent_id`
  self-reference, unique `(parent_id, slug)`.
- `mkc_files` — one row per indexed file. `agent_relative_path` (unique) is
  the file's path relative to the agent's `STORAGE_ROOT`, e.g.
  `Legal/Kontrak/kontrak-abc-2026.pdf` — **never an absolute OS path**
  (would leak the Mac Mini's local username/directory layout).
- `mkc_file_requests` — one row per WhatsApp "kirim saya file X" request.
  `status`: `pending_match` → `matched` | `ambiguous` | `no_match` →
  (matched only) `delivering` → `sent` | `failed`.
- Permissions: `files.view` (Super Admin, Direktur Operasional, HR),
  `files.manage` (Super Admin) — for a future in-app catalog browser/editor.
  Nothing in this initial scaffold builds that UI yet; RLS is wired so it
  can be added without a further migration.
- Storage bucket `mkc-file-delivery-temp` — private, 100 MB object limit,
  used only as the delivery relay hop described above.

## API surface (agent-facing, `app/api/files/agent/*`)

All three routes are guarded by `requireFileAgentAuth`
(`lib/security/file-agent-auth.ts`) — an `x-file-agent-secret` header
checked against `FILE_AGENT_SHARED_SECRET`. **Fails closed** on an unset
secret (deliberately unlike `lib/security/cron-auth.ts`'s fail-open — see
that file's own comment for why cron's rollout needed fail-open and this
doesn't). They're also listed in `lib/supabase/middleware.ts`'s
`PUBLIC_PATHS` so the cookie-session redirect never intercepts them (the
agent has no browser session).

- `POST /api/files/agent/sync` — the agent pushes its category tree +
  file list. Upserts by `agent_relative_path`. Pass `fullSync: true` for a
  periodic full resync that also marks any file absent from the payload as
  `is_deleted`.
- `GET /api/files/agent/requests/pending` — returns every
  `mkc_file_requests` row with `status='matched'`, with enough info
  (`agentRelativePath`, `originalFilename`) for the agent to find the file
  locally.
- `POST /api/files/agent/requests/:id/deliver` — multipart upload of the
  file's bytes. Stages them in `mkc-file-delivery-temp`, sends via
  `sendWhatsAppDocument` (`lib/ai/notifications/engine.ts`), updates the
  request's status, and always cleans up the staged object.

## What's NOT built yet

This migration/API/AI-domain layer is the scaffold the owner asked for —
plug in `FILE_AGENT_SHARED_SECRET` (both sides) and stand up the
`Filemanager` agent on the Mac Mini, and the WhatsApp flow works
end-to-end. Deliberately left out of this first pass, to build only once a
real need shows up:

- An in-app UI for browsing/editing the catalog (permissions already exist:
  `files.view` / `files.manage`).
- Re-attempt/retry logic for a `failed` delivery (today it just sits;
  someone has to notice and re-ask over WhatsApp).
- Any admin visibility into `mkc_file_requests` history beyond direct SQL —
  e.g. a "recent file requests" panel.
