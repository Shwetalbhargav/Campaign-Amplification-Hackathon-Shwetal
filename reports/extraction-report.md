# Website extraction report — 19 October 2026

The reference website was actually retrieved. The web reader failed for both `/` and `/robots.txt`; direct HTTP returned the public HTML/CSS/JavaScript, and Playwright successfully rendered the React application. `robots.txt` returned the application HTML, not crawler directives. No authentication, admin routes, authenticated profile/receipt endpoints or access controls were bypassed.

The site uses an in-browser demo backend. Its anonymous `/campaigns/approved` fetch returns six campaign fixtures, also displayed by the public explore/detail pages. This is not a live server campaign database. Its bundled initialization identifies demo state, generated review scores, simulated balances and dates relative to the current browser time. These values must not be presented as real verified campaigns or measured performance.

Captured content includes the homepage, explore page, all six public campaign details, all six audience pages, all six review-report pages, all six impact pages, FAQ, policies, review explainer, funding explainer and impact explainer. Thirty-four snapshots are retained, including an expanded policies snapshot. Creation redirected to sign-in and the protected wizard was not inspected. Campaign categories are filters on explore; no separate category route was verified. No separate About route was verified; public informational pages provide the available context. The impact explainer returned a short page and is retained without inferring missing content.

The expanded Terms of Service section 9 prohibits scraping. Further automated requests stopped once that restriction was recognized. Both inspection scripts and the downloader now fail closed without explicit owner-permission confirmation. Captured files are retained for local review; do not redistribute website content without permission. This restriction is separate from the lack of per-image redistribution licenses.

| Dataset | Count |
| --- | ---: |
| Public campaign fixtures captured | 6 |
| Independently verified real campaigns | 0 |
| Public category filters | 22 |
| Story sections | 12 |
| Supporting source URL associations | 8 |
| Targeting rows | 6 |
| Public ad creative text records | 6 |
| Unique media references | 47 |
| Downloaded images, including favicon SVG | 11 |
| Downloaded videos | 1 |
| Third-party assets skipped, rights unverified | 35 |
| Extracted measured distribution reports | 0 |

The six fixtures are: Clean drinking water in every public school; Redraw the bus network around where people actually work; Let farmers repair the equipment they own; Keep the winter shelter open past 7am; Write ballot measures at a tenth-grade reading level; Plant the shade where the heat actually is. Exact original titles, stories, amounts, creator display names, source URLs and identifiers are preserved in captured evidence and normalized optional demo datasets. They were not authored for this package.

IDs use UUIDv5 under a namespace derived from the website URL. Campaigns use website IDs, categories use website category keys, and media use absolute original URLs. Currency is normalized from `usd` to `USD`; money is converted exactly to integer cents. Category slugs preserve actual keys, including camelCase. Order follows the visible alphabetically sorted filter list. Unverified scalar fields are null and unavailable collections are empty.

Creator display names do not establish authenticated users. `profiles.json` and `demo-users.json` are empty; fixture `creator_id` values are null. Runtime-generated dates, synthetic trust scores and simulated public impact metrics are not converted into factual dates or moderation/performance records. Funding percentages and narrative statistics remain in provenance alongside their limitations.

Public ad images reuse the covers, so each file is stored once and referenced by the creative. The one downloaded video is the site's 20-second introduction, not a campaign-specific performance asset. No campaign-specific video was verified. Logo branding is text; a favicon exists, but a separate logo image was not verified. Thirty-five third-party illustrations retain original URLs and skipped-download status; they have not been substituted with stock images or enabled for hotlinking.

Missing/inaccessible information: protected creation steps/drafts, authenticated creator identities and bios, genuine published/deadline dates, source titles and trustworthy supporting source documents, explicit targeting locations/interests, a verified reach range, campaign-specific videos, campaign updates, actual spend/impressions/clicks/reach, report periods, public asset credits/licenses and separate image-logo files.

No Supabase credentials were supplied, no project was connected, no live records were inserted and no Storage uploads occurred. All import/upload runs used dry-run mode. The schema includes future user workflows without fabricating website data for them.
