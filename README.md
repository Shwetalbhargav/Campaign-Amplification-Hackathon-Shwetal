# Campaign amplification data foundation

Prepared from https://campaign-one-pearl.vercel.app/ on 19 October 2026. This package contains data, SQL, import tooling and Expo data services. No mobile screens are implemented.

The site is a **demo**: six public campaigns use simulated balances, placeholder example.org citations, generated trust scores and dates relative to the browser clock. They are preserved in `demo/`, never mixed with real campaign records. `json/campaigns.json` is intentionally empty. The default importer includes 22 actual category definitions and 41 site media references, but no campaign fixtures. No users, contributions, notifications or performance figures were invented.

The expanded website Terms of Service, section 9, prohibit scraping. Collection has stopped and collection scripts are disabled unless explicit owner permission is confirmed. The captured records and 12 downloaded first-party files are retained locally for review. Importing the campaign fixtures requires owner permission; media uploads additionally require asset-specific redistribution permission recorded in the manifest. The existence of a public URL is not treated as a license. There is no automatic hotlink fallback.

See `reports/extraction-report.md`, `reports/data-quality-report.md`, `reports/provenance.json` and `reports/media-manifest.json` for evidence and limitations.

## Files

| Location | Contents |
| --- | --- |
| `json/` | Website metadata, categories, non-campaign media references; empty real campaign tables |
| `demo/` | Six website-provided campaign fixtures and related story/source/targeting/creative rows; empty users and transactions |
| `database/schema.sql` | Public relational tables, private receipts/payment events/reviewer membership, constraints and lifecycle guard |
| `database/policies.sql` | RLS, narrow column grants, submission/review/payment/receipt RPCs and private Storage read policy |
| `database/seed.sql` | Repeatable category-only SQL seed |
| `import/import-to-supabase.ts` | Validated administrative insert-only importer |
| `import/upload-media.ts` | Permission-gated Storage uploader |
| `src/constants/design-tokens.json` | Verified CSS colors, typography and component styles |
| `src/services/` | Typed Expo data functions; no administrative credentials |
| `reports/raw/` | Public HTML, CSS, JS and anonymous rendered page snapshots |

## Local verification

Requires Node.js 22+ and npm. Dependencies are locked. No credentials or network calls are required for these checks:

```powershell
Set-Location 'E:\Campaign Amplification Hackathon Shwetal'
npm ci
npm run typecheck
npm run validate
npm test
npm run import:data -- --dry-run
npm run import:data -- --dry-run --include-demo
npm run upload:media -- --dry-run
```

`npm test` runs a disposable local PostgreSQL engine (PGlite) with Supabase Auth and Storage schema stubs. It executes the SQL and exercises RLS and RPC behavior. This is not a hosted Supabase integration test. Reports are written locally. Import and upload dry runs do not connect to Supabase or modify source JSON.

## Create the database and import

Create an empty Supabase project, then copy `.env.example` to `.env` and fill the placeholders from your own project. Keep `SUPABASE_SERVICE_ROLE_KEY` only in local trusted tooling. Never use an `EXPO_PUBLIC_` prefix for that key. `SUPABASE_ANON_KEY` is documented for administration/configuration; Expo reads only the two `EXPO_PUBLIC_SUPABASE_*` values.

Install PostgreSQL `psql` locally or run the three SQL files in the Supabase SQL editor in this order. **Schema and policy installation is a one-time operation against a fresh database.** Do not reapply it over existing tables; use migrations for later changes. Seed and TypeScript imports are repeatable.

```powershell
Copy-Item .env.example .env
# Edit .env before running import commands. psql reads the connection string below,
# independently of .env; replace this placeholder with the Supabase SQL connection URI.
$env:DATABASE_URL = 'postgresql://USER:PASSWORD@HOST:5432/postgres'
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f database/schema.sql -f database/policies.sql -f database/seed.sql
npm run import:data
```

The default command imports categories and media metadata, with null Storage references. It does not publish campaign fixtures or upload media. After obtaining permission to reuse the website content, optionally import the captured campaign demo records:

```powershell
npm run import:data -- --include-demo --website-permission-confirmed
```

Every dataset is validated before writes. Dependencies load in order, with campaign covers linked after assets to resolve the circular relationship. Existing IDs are skipped, not overwritten. Conflicting campaign slugs, IDs or provenance stop the import. A failed REST batch may leave earlier batches committed; fix the issue and rerun. Summaries record inserted/skipped counts and failures. This is deliberately simple administrative tooling, not a migration or live synchronization system.

Profiles require real pre-existing `auth.users` IDs. There are no extracted authenticated identities; website creator names stay on campaign records with `creator_id: null`. No Auth accounts are fabricated. Optional demo users must be explicitly provisioned in Auth before adding corresponding profile rows.

## Media uploads

All 47 manifest assets have `rights_status: "unverified"` and `upload_permitted: false`. Thirty-five third-party assets were not downloaded. For each file you have permission to redistribute, record the permission/license evidence in `rights_note`, set `rights_status` to `permission_granted` or `licensed`, and set `upload_permitted` to `true`. Do not enable assets for which permission is absent. Import matching asset metadata before uploading; campaign media requires the optional campaign import.

```powershell
npm run validate
npm run upload:media -- --dry-run
npm run upload:media -- --website-permission-confirmed
```

The script creates a **private** `campaign-media` bucket if needed. Paths are deterministic. Existing files are not overwritten: a hash match is treated as already present; a mismatch fails. Successful uploads update the database's `storage_bucket` and `storage_path`, leaving source JSON unchanged. Per-asset failures do not stop independent uploads, but produce a nonzero exit code. The mobile media service returns a short-lived signed URL only for stored media; missing/unlicensed media returns null.

## Expo integration and future modules

Copy `src/` into the future Expo TypeScript app and install `@supabase/supabase-js`. Supply an Expo-compatible persistent storage adapter, such as AsyncStorage, through `configureSupabase(storage)` at startup. Without an adapter the client intentionally keeps sessions in memory. Configure the mobile app's foreground/background auth refresh behavior in its application lifecycle. No React Native dependency is required to typecheck this foundation.

`campaigns.ts` provides public/featured/category/search queries, details, stories, sources, images, creator queries, draft creation/saving/content editing/submission and funding status. Public lists exclude demo origins by default; pass `includeDemo: true` explicitly in a hackathon build. Detail and funding responses retain `data_origin`, which must be visibly labeled if demo content is shown. Funding is for advertising and amplification. HTML story sections are preserved as source HTML; sanitize any HTML before rendering it and do not execute source scripts.

Draft state supports `story` and `sources`; submission atomically materializes them into relational tables. Save campaign goal/currency/category/title with `updateCampaignDraftFields` before submitting. Other wizard state can remain in JSONB until its module is implemented. Upload/creative editing and targeting promotion should go through future trusted backend endpoints, rather than broadening campaign write grants.

SQL review access is provisioned by an administrator in `private.reviewer_memberships` using a real Auth/profile ID. There is no client path to make oneself a reviewer. `review_campaign` records the decision and publishes only after approval. Creators cannot update status, totals, provenance, ownership or featured flags. Schema lifecycle transitions control later activation/completion/cancellation; trusted administration handles these later stages.

`contributions.ts` defines a future trusted checkout/guest receipt gateway. It intentionally does not pretend a payment integration exists. Create pending contribution rows in a trusted backend after validating currency, campaign status and server-calculated fees. For demo campaigns only, call the service-role-only `complete_simulated_payment(contribution_id,event_id)` RPC after a successful simulated payment; unique events and row locks prevent double counting. Real checkout, refunds, payment-provider verification and reconciliation are future work. Website demo funding is a snapshot, not the sum of an invented backer ledger.

For guest receipts, generate at least 32 cryptographically random bytes server-side, store only the SHA-256 hash in `private.guest_receipts`, and deliver the original token privately. A rate-limited trusted endpoint hashes the supplied token and calls `get_guest_receipt`; the response omits provider references and email. Never log tokens, expose the service role to the client, or grant public access to the receipts/payment-events tables.

After installing SQL on Supabase, generate project-specific database types and review them before replacing the bootstrap types:

```powershell
npx supabase gen types typescript --project-id YOUR_PROJECT_ID | Out-File -Encoding utf8 src/types/database.ts
```

The schema/RLS approach follows the [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security); administrative insert-only reruns use the [Supabase upsert API](https://supabase.com/docs/reference/javascript/upsert). Run the security checks against an isolated Supabase project before a public launch, since local schema stubs do not exercise PostgREST, Storage HTTP access or JWT verification.
