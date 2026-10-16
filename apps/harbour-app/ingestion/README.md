# Local ingestion review

Run `bun run review:ingestion` from the repository root, then open
<http://localhost:5185/ingestion/>.

The tool reads the local Miniflare databases configured by
`apps/harbour-api/wrangler.jsonc` under `.local/d1/dev`. It opens SQLite databases in
read-only mode and binds the web server to loopback. Missing physical shards are
reported; no remote databases are queried.

Select META tables, SOURCE resource releases, or CURRENT/HISTORY snapshot lineages. Use
the dropdowns or previous/next buttons to move between groups and data/supporting
tables. CURRENT scopes include lineage, cohort and retained snapshot scopes. HISTORY
shows stored change rows belonging to the lineage's snapshots, including deletes; it
does not reconstruct a snapshot.

Samples use the same nested, grouped JSON viewer as the source sample page. Colours
identify individual samples; hover or select values to follow a record. The original
database columns appear under `record`. JSON objects and arrays are decoded for review,
malformed JSON remains visible, and blobs show their byte length and hex representation.
Samples rotate across available physical shards. Random rowid probes and a primary-key
fallback provide varied examples rather than a statistically uniform sample. Increase
the sample count to include more shards where records are available.

Group keys, declared foreign keys and known content-addressed definition references
scope supporting rows. Only groups with local rows and populated, related tables are
offered. The reference path appears above the viewer. Shared tables without a verifiable
group path appear once in the **Shared supporting and operational tables** group for
each shard type. Operational and staging tables remain available there. Statistics
supporting definitions are limited to the selected dataset, including all stored
definition versions. SOURCE selects assertion ownership by `resourceReleaseId`, rather
than replaying release validity periods.

The bottom summary counts SQL NULL values across every matching row, independently of
the sample limit. It includes all physical copies of rows across shards. JSON nulls,
missing JSON properties and empty strings do not count as SQL NULL. Sort by null count
or column name. Expand the stored schemas to inspect column types, nullability, defaults
and primary-key positions separately for each shard. When schemas differ, each column's
denominator covers the shards containing that column. Large queries run in separate
workers and have a two-minute timeout; changing selection cancels outstanding work.
Counts and samples use independent live reads, so active ingestion can change data
between requests.

Review subsets identify meaningful differences without creating combinations of every
filter: available locales, history operations and cohorts, CURRENT scopes, reference
periods, categories, granularities, source assertion state and transforms. A dimension
with a single value adds no subset. Dimensions with over 100 distinct values are omitted
to keep the choices manageable. Samples and null counts use the same selected subset.
Arrays show five items initially and reveal ten more per click. The review tool uses
dark mode.

The fixed bottom-right controls provide an approval stamp (**Sign off and next**), a
factory (**Production review and next**) and a skip icon (**Next unreviewed view**).
Hover for action names; each button also has an accessible label. Navigation skips
signed-off and production-review views across subsets, tables and groups within the
selected shard type. Dropdowns still allow returning to a signed-off view; **Undo
sign-off** reopens it. Progress is stored in this browser's local storage and
synchronised between tabs on the same origin. It is not a shared team approval ledger.
Each sign-off fingerprints the schema and every matching row across the selected view’s
physical shards, including duplicate rows. Changes to unrelated tables or rows outside
the selected group/subset do not invalidate it. A changed fingerprint displays
**Sign-off outdated**. Fingerprinting scans the complete view, independently of the
sample count, and navigation verifies saved fingerprints before skipping reviewed views.
Sign-off is unavailable when samples and counts came from different or changing
revisions. Sample count and random resampling do not create separate views.

Use **Production review and next** to defer an entire table within its selected
shard/group, including every subset. Local skip navigation passes over these tables. The
hidden **Production review queue** records the table, group and marking time, with a
link to reopen its local view. **Return to local review** removes the flag. These flags
are separate from local sign-offs, remain pending across local database revisions, and
still require verification against production data. Open the queue with the bottom-left
clipboard icon; close it with the icon, close button or Escape. The queue uses the same
browser-local persistence and tab synchronisation as sign-offs; it does not query or
modify production.

Run `bun run --cwd apps/harbour-app test` and `bun run --cwd apps/harbour-app check` for
focused verification.
