# Local artefact retention

Inspect local retention candidates with `bun run local:retention`. Apply the policy with
`bun run local:retention:apply` while ingestion and maintenance are stopped. Use
`--scope migrations` or `--scope cache` to restrict either command. The policy is
defined in `scripts/local-artefact-retention-policy.json`.

| Material                                                                                                  | Retention                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local migration backups                                                                                   | Newest two per database; older backups have a seven-day grace period. Verify both retained backups with SQLite `quick_check` and SHA-256 before removing predecessors.                                                                            |
| Normalised-data cache                                                                                     | Thirty days and 10 GiB, oldest first, with a one-day grace period for newly written files. Pruning runs after cache writes and through the maintenance command.                                                                                   |
| Rehearsal recovery                                                                                        | One verified complete baseline and one final partial-run state while review is unresolved. Keep source code, typed row audits, input manifests and verification receipts. Retire superseded failed environments only after recovery verification. |
| Restored rehearsal copies                                                                                 | Remove only checksum-identical files backed by the retained baseline; keep differing files in full and retain the reconstruction manifest.                                                                                                        |
| SQL delivery plans, release artefacts, source archives, production bootstrap bundles and database mirrors | Protected. Local completion flags alone do not prove durable remote retention or that a delivery is no longer needed. These require a separate verified retirement decision.                                                                      |

Place a sibling `<filename>.keep` file beside a migration backup or cache entry to pin
it. Pinned files and grace-period files can exceed the count or size targets; they
remain visible in the dry-run. Unknown filenames are protected. The command does not
recursively prune arbitrary `.local` directories.

Successful local migration runs invoke migration-backup retention after releasing the
migration lock. A retention failure is reported separately and does not turn a committed
migration into a reported failure. Failed migrations do not prune backups.

The maintenance command takes the migration and retention locks, refuses symlinked paths
and non-empty backup WALs, checks host process references, and rechecks the plan before
removal. Apply must run outside a restricted PID namespace. If a same-user process is
inaccessible, `--privileged-process-check` uses non-interactive `sudo` only for the
read-only process scan; file removal still runs as the caller. The command does not stop
running applications. Keep other writers stopped for the entire operation; process
inspection is not a lock against a newly started writer.

Each applied plan leaves a JSON receipt in `.local/artefact-retention/`, including
retained backup checksums and removed paths. The normalised cache contains immutable,
regenerable files; cache misses rebuild them from their source inputs. Temporary files
are excluded from cache pruning. Automatic writes and pruning share a SQLite lock with
the maintenance command, so a concurrent replacement cannot be removed as an old entry.

## October Overture recovery material

The recovery catalogue is `.local/overture-release-2026-10-21/recovery-index.json`. It
identifies the complete baseline, the final partial run, retained changed files and the
manifest mapping checksum-identical restored files to their baseline copies. Source
code, regional inputs, row audits and verification evidence remain available under the
task root. Use a new disposable destination for reconstruction; never restore over
active data.

Directory sizes on Btrfs can include shared extents and do not account for compression
in the same way as filesystem free space. Report retired directory/file totals
separately from changes in filesystem free space, especially during concurrent work.

Run the focused checks with:

```sh
python3 -m unittest discover -s scripts -p test_local_artefact_retention.py
bun test ./apps/harbour-cli/src/lib/pipeline/local/normalisedArtefactCacheRetention.test.ts
```
