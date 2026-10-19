# Data quality and validation

The package is structurally prepared for Supabase. Its campaign content is **website demo content**, not verified real-world campaign data. It is excluded from default imports and default mobile campaign lists. Importing it requires owner permission. Do not display simulated balances, creator names or narrative claims as independently verified facts.

Known issues and handling:

- The site's Terms section 9 prohibits scraping. Automated collection is disabled pending owner permission. All asset redistribution rights remain unverified and uploads are disabled in the manifest.
- All eight cited URLs are example.org placeholders. They are preserved under the correct campaigns with null source titles. They are not used as factual corroboration, and no fabricated documents replace them.
- Dates are seeded relative to `Date.now()` and shift across reloads. Database publication, deadline, creation and update timestamps for fixtures remain null. Observed date values and their omission reason are in provenance.
- The public impact UI contains `NaN` clicks and undefined survey percentages. Its demo contribution sum can disagree with campaign headline funding. No measured distribution reports or contribution ledger were manufactured to reconcile this.
- Public review scores are generated demo values; detailed review layers are unscored. No reviewer identities or verification claims are imported.
- Source text includes encoding/replacement characters. Captured text is retained; editorial corrections were not silently applied.
- Creator names are display-only. Auth users/profiles cannot be inferred from these names and are not seeded.
- Website displayed percentages are rounded (for example 66% versus 65.5% for the first fixture). Integer funding amounts are preserved and exact derived percentages are recorded separately in provenance.
- Each campaign detail displays a single estimated audience count at full funding. It is preserved as `estimated_reach_point` and in provenance as a website demo estimate. No range is given, so minimum/maximum remain null. These figures are not measured distribution statistics.
- Campaign claims/statistics are embedded in original HTML stories; they are not independently verified. Stories and the additional rationale section are separate ordered rows. Provenance retains the original narrative claims.
- Six cover assets are also ad images and sometimes homepage imagery. Files are not duplicated; advertising creative and manifest role associations preserve reuse.
- Image dimensions, hashes and file lengths are verified locally. The downloaded video is 20 seconds with dimensions/duration probed from its actual local file. Thirty-five third-party references have no downloaded file, dimensions or hash; nulls are intentional.
- No campaign updates, generated demo users, contributions, notifications or actual distribution reports are present. Empty files are intentional and are not evidence of failed import.
- Bootstrap database types are maintained locally. Generate types from the configured Supabase project after applying the schema. Live JWT, PostgREST and Storage integration still require a configured test project.

Validation is automated by `scripts/validate.ts` and `scripts/test-database.ts`. Checks cover every JSON file, strict table row schemas, safe integer amounts, UUIDs, campaign/category/asset/backer references, unique IDs/slugs, story order, source association against captured evidence, lifecycle values, manifest-to-row mapping, local file size and SHA-256, and read-only source datasets during dry-run tooling.

The SQL is executed in a local PostgreSQL-compatible PGlite instance with Auth/Storage schema stubs. Tests exercise public/private reads, own-draft edits, reviewer-only approval, locked submissions, forbidden funding/ownership/status changes, private payment columns, idempotent simulated payment completion, guest receipt access, user-scoped follows/saves/notifications, Storage visibility and rejected invalid financial values. See `validation-results.json` for the current check list and pass count.

The schema uses UUID relationships, constrained lifecycle/financial values, search/foreign-key indexes, JSONB wizard state, flexible budget allocation and SQL arrays for flat targeting values. Payment events, reviewer membership and guest receipt hashes/emails are in the non-exposed `private` schema. No secrets or passwords belong in datasets. Guest token creation/delivery, rate limiting, checkout, real payment processing and refunds are interfaces/future backend work, not claimed implementations.

Reruns intentionally do not synchronize existing rows or overwrite funding totals. REST imports may partially commit on failure and report a nonzero status; rerunning inserts missing IDs and links missing covers. SQL schema installation itself is one-time; category seeds and data/media tools are repeatable. Permissioned media uploads update database references without rewriting source JSON. Dry runs require neither credentials nor a network connection.
