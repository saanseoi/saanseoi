# Processing rules

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

Merge ruleset entries use `ruleFixture` with a basename or a list of basenames.
Resolution derives their descriptions and interfaces and includes exact definitions in
the resolved hash. Multiple references for one operation must have the same scope. Do
not copy mappings or parameter values into a parallel ruleset description.

When editing a rule, update its processor validation and behaviour tests as needed. The
fixture/executor parity test covers every JSON declaration in this directory. Keep
reviewed record decisions in their own input fixtures.
