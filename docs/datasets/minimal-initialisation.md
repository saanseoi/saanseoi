# Minimal initialisation

Run `./bin/saanseoi init:minimal --target production` for a bounded production ingestion
test. Use `--continue` to resume interrupted uploads. An explicit target is required;
`local` and `preview` are also supported.

This command publishes real source releases, API release sets and documentation. It runs
the same Divisions, Statistics, Addresses and Places dependency sequence as `init`,
without resetting databases or clearing caches. Streets are excluded. Curation checks
remain enabled. Existing published releases are skipped.

The sample contains at most two distinct source versions per dataset, including all
companion resources belonging to those versions. Selection happens before completed
releases are skipped, so a retry does not advance to another pair.

| Source                                     | Sample                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| Overture Divisions and Places              | 2025-09-24.0 and 2025-10-22.0                                              |
| Planning units                             | 2001 and 2006                                                              |
| New towns                                  | 2006 and 2011                                                              |
| ALS addresses                              | Earliest two retained versions from the configured 2024 start              |
| C&SD Statistics                            | Earliest two configured versions per dataset; companion resources retained |
| HAD, LandsD and prerequisite C&SD geometry | Existing one- or two-version selections                                    |

Address and Places ownership manifests use `<target>.minimal.json`, separately from full
initialisation. Their clean-baseline and recovery checks still apply: existing family
data without a matching manifest is not adopted. Keep these manifests when resuming. A
minimal completion does not establish a full-history completion. Do not run full and
minimal initialisation concurrently.

The limit bounds versions, not record counts or upload size. Each selected release is
processed in full. Source bytes and configured release versions must be available, and
the target must already have its schema and credentials set up.
