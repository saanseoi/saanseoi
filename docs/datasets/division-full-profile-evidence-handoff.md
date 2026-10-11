# Planning Division full-profile source evidence

## Objective

Make native Planning Division `profile=full` responses resolve their selected source
evidence successfully, including when areas are requested. Correct the producer and
repair local retained data if necessary. Preserve the Point-only Division contract and
separate polygonal DivisionAreas.

## Reproduction and known evidence

On the local API, request:

```text
http://localhost:8787/divisions/v0.2?domain=hkgov-pland-pu&profile=full&page%5Blimit%5D=1
```

The response was HTTP 500 with `internal_error`. The captured underlying error was:

```text
Missing selected division evidence for 20ee6a58-2502-523e-8845-d1b0c7c05068 in f7c46f11-4077-5ab8-a9cd-6881c2ca65c7.
```

The same request with `profile=map&include=areas` returned a Point identity and a
Polygon DivisionArea. Direct current-database retrieval and full-profile resource
presentation also succeeded. Failure occurs during source-evidence expansion:

1. `apps/atlas-api/src/services/canonicalSourceDocument.ts`
2. `apps/atlas-api/src/services/canonicalSourceReferences.ts`
3. `libs/core/src/pipeline/db/sourceResolutionReplay.ts`

`hydrateCanonicalSourceReferences` groups reference-bearing resources by snapshot,
resolves the snapshot replay plan, finds source-resolution candidates whose
`resolutions.entities.division` contains the canonical ID, and replays those candidates.
It throws when the selected evidence is empty. This does not yet establish whether the
producer, retained resolution data, snapshot selection or replay is at fault.

The point repair changed canonical geometries, bounding boxes, history hashes and
Division replay references. It did not change source-resolution tables. The failing
record's stored source references and snapshot were compared with the pre-repair backup
and were unchanged. Do not bypass evidence validation or return invented references.

## Investigation and repair

1. Reproduce against the current checkout and local database; other work may have
   changed since this capture. Trace the selected API release set, primary snapshot,
   replay ancestors and history-shard bindings. Distinguish the failing effective
   snapshot above from the stored current scope `f1bda283-20a8-597d-af1f-a3f6eec9d5b3`.
2. Inspect the selected snapshot's resource-release pins, source assertions and
   `sourceResolutions` rows for the failing ID. Follow `scopeId`, source record ID,
   source version hash, source release ID and `resolutions.entities`. Check the entity
   key, UUID prefixes, ancestor scopes, exclusions and replay order. Verify whether
   candidate discovery finds rows and whether replay subsequently removes them.
3. Trace Planning production through
   `apps/harbour-cli/src/lib/pipeline/divisions/processLocalHkgovPlandDivisionSqlUpload.ts`
   and its delivery/persistence helpers. Find the writer responsible for retaining
   canonical-to-source resolutions. Compare Planning with a working native inventory;
   inspect DivisionAreas as well as Divisions.
4. Add a regression that reproduces the actual missing or mismatched resolution. Fix the
   responsible producer or replay selection. Keep intentional omissions effective; do
   not resurrect old assertions merely because they once referenced the identity.
5. If retained data is incomplete, prepare a dry-run repair from pinned, retained source
   evidence. Report affected snapshots and records. Check for active ingestion writers,
   back up affected rows and replay references, apply transactionally, retain rollback
   SQL and rerun to prove idempotence. Do not mutate publisher payloads or rewrite
   unrelated inventories.
6. Verify list and detail requests with `profile=full`, both with and without
   `include=areas`, for Planning units and new towns. Cover current and historical
   releases, explicit locales and another working inventory. Assert that source
   specifications resolve and that Points and polygonal areas remain separate.

Run relevant source-reference/document, replay and producer tests, then the API type
check and scoped diff checks. Update the Planning source documentation for any
processing change. Report broad pre-existing failures separately.

## Local repair artefacts

The completed Point backfill receipts and rollback files are retained under:

- `.local/repairs/division-points-apply/`
- `.local/repairs/division-missing-points-apply/`
- `.local/repairs/division-points-final-verify/`

These local database artefacts are not committed. No Point rollback is required for this
investigation. If rollback is needed for a separate reason, restore the missing-point
stage before the polygon-conversion stage. The final dry run found zero further repairs:
45,477 Point rows and five null rows for one country identity without area evidence.
