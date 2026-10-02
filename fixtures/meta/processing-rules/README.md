# Processing rules

Rules are grouped by processing stage:

- `ingestion/`: publisher extraction, validation and SOURCE retention (8 rules).
- `assembly/`: canonical reconstruction, matching, curation, translation and geometry
  selection, including their shared dependencies (26 rules).

Each JSON file declares a registered processing rule. Its implementation exports the
executor named by `implementation.symbol`; the executor validates and freezes the
declaration and consumes its parameters. Audit retains that exact definition.

- `id` identifies the rule; `schemaVersion` describes the declaration format.
- `scope` distinguishes bulk transformations from individual reviewed decisions.
- `basis` distinguishes code transformations from selections of reviewed fixture values.
  A JSON declaration does not by itself make a code transformation fixture-based.
- `inputs` and `outputs` name the processing interfaces, not copied records.
- `parameters` contain static policy consumed by the implementation. Empty parameters do
  not mean the rule has no inputs or no algorithm.
- `implementation` points to repository source, not an embedded executable copy.
- `review.kind` distinguishes guard-related curations from independently identified QA
  patches. A curation declares its related guard's ID, summary and consequence. A patch
  has no triggering guard; its fixture still supplies expected-source application
  preconditions. Patch instructions live in `fixtures/meta/patches/`.
- `dependencyIds` names shared executable policies. Registration and catalogue
  resolution retain their complete definitions in `dependencies`; unresolved, duplicate
  or cyclic references fail. Resolved hashes cover the dependency content.

Area and boundary rules both depend on `exclude-division-geometry`. Edit its fixture to
change shared regional exclusions; area-only referent exclusions are parameters of that
same policy. WKB decoding, C&SD source assertions and district identity bridging also
have registered definitions referenced by the merge rulesets.

Merge ruleset entries use `ruleFixture` with a basename or a list of basenames,
independent of the stage directory. Basenames and rule IDs must be unique across stages.
Resolution derives their descriptions and interfaces and includes exact definitions in
the resolved hash. Multiple references for one operation must have the same scope. Do
not copy mappings or parameter values into a parallel ruleset description.

When editing a rule, update its processor validation and behaviour tests as needed. The
fixture/executor parity test covers every JSON declaration in both stage directories.
Keep reviewed record decisions in their own input fixtures.

## Policy ownership and field references

Dataset fixtures select ingestion rules through `processingRules`. SOURCE retention and
publisher extraction are ingestion; canonical reconstruction, identity matching,
curation, translation and geometry selection are assembly. Resource-specific assembly
selections live in `fixtures/meta/snapshotProcessingRules.json` and are retained on
`snapshotRecipes.processingRules`. Both stages capture exact content-addressed
`processingRuleDefinitions`; synchronisation does not rewrite captured definitions.

Resolved rules use `kind: bulk | record` because both groups share the declaration
schema. `type` identifies a different schema. `inputs` and `outputs` are interface
identifiers, never substitutes for field paths. Optional `sourceFields` and
`targetFields` use `{ origin, collection, path }`, for example
`{ "origin": "source", "collection": "protomapsIslandFeatures", "path": "sourceGeometry" }`.
Paths reject prose and comma lists; SOURCE/canonical table and root-column names are
validated against Drizzle. Descriptions remain in locale-keyed `i18n` objects.

The declarations describe the registered code, rather than replacing it with a rule
interpreter. A prepared-record input states the ingestion boundary explicitly; archive
readers and retained raw-object manifests supply acquisition and preparation evidence.
Diana Pang's street dataset has no implemented importer, so its policy is null.
