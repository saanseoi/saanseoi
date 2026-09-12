# Ingestion verification: implementation hand-off

## Objective

Make ingestion tests part of the normal local and CI verification gate, and add small,
repeatable tests of the complete upload-to-publication lifecycle for every API resource
family: Addresses, Divisions (including area/boundary companions), Places, Statistics
and Streets. Basemap is a separate generated-archive workflow.

Work in `/home/io/code/saanseoi`. Read `AGENTS.md`, inspect the current branch and dirty
files, and preserve concurrent work. Implement and verify the changes; a proposal alone
does not complete this task.

## Ownership and scope

This task owns test execution, CI wiring, test isolation, acceptance fixtures and
verification documentation. Another implementation thread owns the deferred Statistics
inheritance fix, remote mirror preflight alignment and source-file transfer changes.
Inspect their latest code and coordinate through the user before editing overlapping
production files. Add regression coverage for those contracts without duplicating their
implementation. Do not fix an unrelated runtime defect by weakening its tests.

No live preview/production ingestion, resets, publication, provisioning or remote
cleanup is authorised by this hand-off. Tests must use disposable local databases and
bounded fixtures. Inspect local server/process ownership before starting a service.

## Verified starting points

- `apps/harbour-cli/package.json` has `check`, `lint` and `format`, but no `test`
  script. The CLI contained 264 `*.test.ts` files at the review baseline; recount them
  because work is concurrent.
- `.github/workflows/test.yml` tests the public apps, Harbour API, Harbour Workers and
  the Telegram bridge. It omits Harbour CLI, Harbour DataOps and a direct core-library
  test job. DataOps and `libs/core` already have package test scripts.
- Root `bun run test` invokes Turbo. A package with no test script is silently absent
  from that task graph. Inspect `turbo.json`, `bunfig.toml` and workflow callers as well
  as the reusable test workflow.
- Harbour API deliberately runs `control.test.ts` and
  `uploadSession.localProcessingOwnership.test.ts` separately from its other files via
  `test:ci`. Preserve this isolation unless evidence supports changing it.
- The preceding review ran 693 focused tests: 691 passed and two failed. Both failures
  were in `pipeline/statistics/materialiseStatisticSnapshot.test.ts`, where a correction
  expected to inherit a draft predecessor. The current parent selector requires a
  published predecessor. The separate Statistics fix must establish the intended
  completed-but-deferred predecessor contract; do not skip or delete these assertions.
- `docs/datasets/ingestion-performance-verification.md` retains small local/preview
  Division experiments, which omit parts of registration/source-object transfer. It
  explicitly leaves other families and complete interrupted workflows unverified.

These are starting observations, not assumptions that the current checkout is identical.

## Required work

1. Add Harbour CLI package test commands consistent with the repository. Ensure root
   Turbo test execution discovers the package and its full intended suite.
2. Add explicit CI test/type-check coverage for Harbour CLI, Harbour DataOps and
   `libs/core`, or an equivalent ingestion job that demonstrably executes all three.
   Preserve existing jobs, fail-fast behaviour and the API's isolated test command.
   Ensure the workflow is actually called for relevant changes. Do not use
   `continue-on-error`, blanket exclusions or a successful empty test selection.
3. Run the suites from a clean process and make them deterministic. Use temporary SQLite
   databases, real migrations, isolated filesystem paths and controlled external
   transports. Investigate mock leakage, fixed paths, environment-variable mutation and
   ordering dependence before serialising an entire suite. Isolate only the affected
   groups when necessary. Supply small redistributable source fixtures; do not rely on
   private downloads, existing `.local` state, credentials or network availability.
4. Add a bounded lifecycle acceptance harness that exercises the production
   registration, source retention, family processing, metadata, audit and publication
   paths. Cover all five families and the distinct Division geometry companion path. An
   adapter unit test with seeded completion/audit/publication rows is not evidence for
   the whole lifecycle. Use reviewed deterministic curation fixtures where needed;
   retain the production review gates. Large publisher archives are unnecessary.
5. For each family, cover an initial release, an unchanged retry/reissue, a changed
   release and its actual omission semantics. Interrupt after a committed data batch,
   resume the retained plan, and compare the resulting source/history/current rows,
   snapshot ancestry, dependency references, statistics and audit state with an
   uninterrupted run. Prove already acknowledged mutations are not repeated. Exercise
   stale ownership/changed-input rejection and failed preparation without target writes.
6. Verify the terminal lifecycle boundary: source publication, deferred API publication,
   completion of required composition members and representative public API reads.
   Verify incomplete delivery returns a readiness error rather than partial data.
   Include a complete empty projection where supported. A child exit code alone is
   insufficient evidence.
7. Capture useful CI artefacts on failure: the fixture/command identity, phase log,
   retained plan metadata and a bounded state/parity report. Exclude secrets and avoid
   uploading large databases or source archives by default. Update the ingestion
   verification documentation to distinguish component tests, local lifecycle tests and
   any still-unverified live/performance claims.

## Family-specific acceptance points

| Family                 | Required distinction                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Addresses              | Paired ALS 2D/3D identity, reviewed membership, owning shards and exact Division/Street dependencies.                      |
| Divisions and geometry | Canonical records/locales, exact and simplified geometry, provider/cohort boundaries and companion deferral.               |
| Places                 | Exact Address/Division revisions, supplementary-address provenance, cells/links and mandatory unresolved-curation stops.   |
| Statistics             | Exact reference periods, partial fields/geographies, completed deferred predecessors and bootstrap/publication selection.  |
| Streets                | Baseline replacement versus incremental notices, persistent identity, retained processing audit and publication readiness. |

The review found that the Street processor calls publication without the mandatory audit
delivery. A lifecycle test should expose that gap. Report a concrete blocker if it
remains unfixed; do not fabricate completed audit metadata to obtain a passing
acceptance test.

## Validation and completion

Use Bun 1.4.2. Run local scripts with fish and CI scripts with bash. Start with the
package suites and focused acceptance tests, then demonstrate root task discovery and
the relevant CI-equivalent commands. For example:

```fish
bun run --cwd apps/harbour-cli test
bun run --cwd apps/harbour-dataops test
bun run --cwd libs/core test
bun run --cwd apps/harbour-api test:ci
bunx turbo run test --filter=harbour-cli --filter=harbour-dataops --filter=@repo/core --force
bunx turbo run check --filter=harbour-cli --filter=harbour-dataops --filter=@repo/core
bun run format:markdown
git diff --check
```

Inspect the actual scripts before using these commands, and validate workflow syntax.
Finish with a self-contained report identifying the files changed, exact test commands
and counts, covered lifecycle scenarios, remaining gaps and whether a real CI run was
observed. Local execution of CI-equivalent commands is not an observed GitHub Actions
run. Do not claim live D1/R2 throughput or production readiness from local fixtures.
