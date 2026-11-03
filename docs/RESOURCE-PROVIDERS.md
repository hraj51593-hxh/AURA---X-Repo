# AURA-X resource-provider survey

Research date: 2026-11-01. This is an implementation guide, not a claim that every provider is enabled. Preserve provider provenance, verify destination/type/access metadata, honor rate limits and terms, keep credentials server-side, and filter against each user's goal/task context before saving. Provider rank, popularity or metadata completeness is not proof of educational quality.

## Current AURA-X providers

- **YouTube Search and playlist candidates (Manus API Hub)** — lessons, lectures, demonstrations and possible learning sequences across topics. This is a broad user-uploaded catalog, not an educational-quality check; a playlist is only a course candidate, not a verified curriculum. Preserve canonical HTTPS links; do not download or rehost videos. Provider credentials/quota belong to the managed connector contract.
- **Open Library** — book-catalog metadata and work/edition links; catalog records do not prove full-text access, free borrowing, an open license, or textbook quality. `https://openlibrary.org/developers/api`
- **Crossref** — DOI and scholarly-bibliography discovery; a DOI/abstract is not proof of open full text, peer review status, or pedagogical suitability. `https://www.crossref.org/documentation/retrieve-metadata/rest-api/`
- **Wikipedia** — general introductory articles, clearly labeled and not treated as a substitute for authoritative or course material. `https://www.mediawiki.org/wiki/API:Search`
- **Brave Search (optional)** — broad web discovery for official documentation, course pages and providers without a public catalog API. Existing code uses `BRAVE_SEARCH_API_KEY`; that key is not configured in this environment. Brave is a paid subscription service; verify current plan, rate and result-retention terms before enabling. `https://api.search.brave.com/app/documentation/web-search/get-started` and `https://brave.com/search/api/`

## Additions selected for this release

1. **Internet Archive Advanced Search / metadata** (`https://archive.org/advancedsearch.php`, `https://archive.org/developers/metadata.html`) — public keyless discovery for books and media. Require `mediatype:movies` plus an actual playable video file for video results. Display item-level access/rights when supplied; a public item or metadata result is not blanket permission to download, redistribute or reuse.
2. **Library of Congress JSON API** (`https://www.loc.gov/apis/json-and-yaml/`, `https://www.loc.gov/apis/json-and-yaml/requests/endpoints/`) — keyless `/books/` search for digitized books and primary sources; it is not the entire general LOC library catalog. Throttle requests and label digitized material accurately; check item-level rights.
3. **OpenAlex Works API** (`https://help.openalex.org/api/`, `https://help.openalex.org/api/searching/`) — keyless multidisciplinary paper discovery. Use concise queries, small field sets/pages, and show DOI, year, work type and open-access status/locations separately. Metadata is aggregated and may be incomplete; search/rerank settings, credits and limits can change.
4. **GitHub REST repository search** (`https://docs.github.com/en/rest/search/search`, `https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api`) — keyless discovery of technical documentation, tutorials and project repositories; initially use repository search, not code search. Treat stars as popularity only. Show last update, source, license when present, and distinguish repositories from hosted sandboxes. Public unauthenticated search limits apply.
5. **Europe PMC REST** (`https://europepmc.org/RestfulWebService`) — keyless, conditional biomedical/life-sciences paper discovery. Limit use to relevant goals, deduplicate by DOI/PMID/PMCID, and distinguish OA/full-text links from bibliographic metadata.
6. **arXiv API** (`https://info.arxiv.org/help/api/user-manual.html`, `https://info.arxiv.org/help/api/tou.html`) — keyless, conditional STEM/CS preprint discovery. Label preprints as not necessarily peer-reviewed; serialize requests at the documented one-request-per-three-seconds limit and link to arXiv rather than rehosting papers.
7. **Stack Exchange API** (`https://api.stackexchange.com/docs/advanced-search`, `https://api.stackexchange.com/docs/throttle`) — optional, clearly labeled community Q&A/worked examples, never represented as official documentation or a curated exercise bank. Link to the original and attribute any displayed post content; honor backoff, request pacing and applicable CC BY-SA terms.
8. **Hugging Face Hub** (`https://huggingface.co/docs/huggingface_hub/guides/search`, `https://huggingface.co/docs/hub/api`, `https://huggingface.co/docs/hub/rate-limits`) — optional for AI/data goals: datasets and Spaces. Validate dataset cards, provenance, licenses, Space status/runtime and safety. A Space is not guaranteed free, runnable, or a general-purpose user-code sandbox.

## Optional providers pending credentials or approval

- **Google Books** (`https://developers.google.com/books/docs/v1/using`) — broad volumes/preview metadata; reliable backend access should use a project API key and confirmed quota. Preview/free-book filters do not establish open licenses or redistribution rights.
- **OER Commons** (`https://docs.oercommons.org/api/`) — structured courses and learning materials; requires an access token obtained from the provider. Confirm operating terms and limits before enabling.
- **Europeana** (`https://pro.europeana.eu/page/search`) — useful selectively for cultural-heritage/humanities goals; requires a free account/API key and project-key review may apply.
- **MERLOT** (`https://info.merlot.org/merlothelp/MERLOT_Technologies.htm`) and **Boclips** (`https://docs.boclips.com/`) — require provider approval/partner access; fees, rights, entitlements and API contract must be confirmed first.
- **Kaggle** (`https://www.kaggle.com/docs/api`) — dataset/competition discovery for data-science goals; requires a server-side account token/OAuth and item-level rule/license checks.
- **Direct Google YouTube Data API v3** (`https://developers.google.com/youtube/v3/docs/search/list`) — do not duplicate the existing YouTube connector unless needed. Direct search quota/policy differs from the Manus API Hub connector and must be checked in the operator's Google project.
- **Coursera** organization/API and **Udemy** affiliate paths are not treated as public general course-catalog search; verify current provider access rather than scraping or inventing endpoints.

## Ranking, display and reliability requirements

- Match the requested goal and optional exact topic/task first; exclude candidates with no meaningful topical overlap. Rank eligible candidates by topic/skill fit, requested format/level/language, authoritative source and freshness. Keep format, access/license, recency, popularity and source quality as separate signals.
- The application supplies the full selected goal/task context plus an optional user-entered topic to providers; results must match the goal and, when meaningful, the user-entered topic before being saved. Saved records remain goal-scoped and can be separately bookmarked and marked reviewed.
- Use provider/category-specific eligibility: actual playable media for video, actual catalog record for books, scholarly record and publication/preprint status for papers, syllabus/course structure for courses, repository/project evidence for projects, and clear source type for community Q&A.
- Normalize provider and canonical URL; deduplicate by DOI, ISBN, provider ID and canonical URL. Show the source, access limitations and unverified status; do not fabricate links, metadata, quality, availability, free access or rights.
- Apply per-provider timeouts, bounded retries, rate limits/backoff and caching only where permitted. Treat credentials as server secrets. Keep providers independently disableable so one outage yields an honest partial result rather than fake completeness.

## Release smoke note

On 2026-11-02, a single read-only search for “Learn Python for data analysis” returned topic-matched records from OpenAlex, Crossref and Stack Exchange, with a partial-provider warning for Library of Congress. Provider availability and results vary; this observation is not a service-level guarantee.
