# vinext-starter

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Data Storage (Supabase)

All saved data lives in one Supabase Postgres project, reached only from server code through `db/supabase.ts`
(PostgREST with the secret key). Every table has RLS on with no policies and no `anon`/`authenticated` grants.

| Table | Written by | Holds |
| --- | --- | --- |
| `customer_site_edits` | `db/supabase-site-edits.ts` | Customer file sites added/edited in the app, merged over `app/data/customer-file.json` |
| `clickup_snapshots` | `db/clickup-snapshot.ts` | Latest ClickUp report per menu (1 = CX, 2 = Dev), gzip+base64 JSON |
| `clickup_sync_runs` | `db/clickup-snapshot.ts` | One row per ClickUp refresh: trigger, mode, task counts, size, or the error |
| `ai_summaries` | `db/ai-summaries.ts` | Groq summary text that passed verification, keyed by sha256(kind, models, prompt) |

ClickUp snapshots are shared by every Vercel region and survive deploys; each server instance keeps the decoded copy in
memory and only re-downloads it when `synced_at` changes. If Supabase is down, reads and saves fall back to the local D1
binding (dev) or the Vercel Runtime Cache. AI summaries reuse cached text for an unchanged report instead of calling the
model again; changing a prompt or model starts a new entry. Local fallback summaries are never cached.

Without Supabase settings, local `npm run dev` uses the Cloudflare D1 binding for snapshots and site edits.

## Customer File Data

The Customer file menu is built from the team's Google Sheet exports. Re-import a tab after downloading it as CSV:

| Sheet tab | Command | Output |
| --- | --- | --- |
| Site info | `node scripts/import-customer-file.mjs "<csv>"` | `app/data/customer-file.json` |
| Payment type | `node scripts/import-customer-payments.mjs "<csv>"` | `app/data/customer-payments.json` |
| Contacts info | `node scripts/import-customer-contacts.mjs "<csv>"` | `app/data/customer-contacts.json` |

Payments and contacts are linked to sites when the page loads (by domain, the `*.cody.mn` preview domain, and for
contacts a unique company name), so they follow later site edits. The contacts import splits cells holding several
emails or phone numbers and flags malformed ones; the **Холбоо барих** tab lists them under "Шалгах шаардлагатай".

## Customer File Edits

Sites added or edited under **Customer file** are saved to `customer_site_edits` (see above), so re-importing the CSV
never loses them.

1. Create the tables: run the files in `supabase/migrations/` in order in the Supabase SQL editor
   (or `supabase db push`).
2. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (see `.env.example`) in Vercel → Project → Settings → Environment
   Variables, and in your local env file. The Vercel ↔ Supabase integration's `NEXT_PUBLIC_SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` work too.
3. Set `CUSTOMER_FILE_EDIT_PASSCODE` to a team passcode. Viewing stays open; saving asks for the passcode once per
   browser (30 days). On Vercel, editing stays off until it is set. Changing it signs every browser out.
4. Redeploy. The "+ Шинэ сайт" button appears once the store is configured.

Without Supabase settings, local `npm run dev` falls back to the Cloudflare D1 binding; with neither, the section is read-only.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
