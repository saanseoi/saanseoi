# Place identity evidence storage

Git stores the matching policy, implementation, human-authored curation and compact
archive references. Generated per-observation identity decisions belong in R2.

Preparation writes content-addressed JSONL ledgers beneath the ignored release staging
directory. The header records the scope, observed release, exact predecessor snapshot,
record count and policy/implementation hashes. Rows retain the canonical and publisher
IDs, before/after evidence, candidates, scores, conflicts and ambiguity margins.

Before audit retention, the producer verifies the staged ledger hash and exact decision
contents. Source Audit stores the complete evidence in immutable, content-addressed R2
partitions, with hashes and release references. It displays the same before/after
comparisons without depending on a Git JSONL file. Scores are policy weights, not
calibrated probabilities; automatic decisions are not human approvals.

Unchanged observations preserve their original assignment evidence. Retries reuse
identical staging files; changed evidence creates another content hash. Local staging
and caches are disposable after successful R2 retention. Failed preparation must retain
its staging evidence until it is archived or the investigation is resolved.

The compact `archives/*.json` references identify archived initial ledgers in the local
R2 target. They record the source ledger hash and partition references, not the full
decisions. Production retention uses the selected target's normal Source Audit delivery.
