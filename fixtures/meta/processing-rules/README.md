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

Merge ruleset entries use `ruleFixture` with a basename or a list of basenames.
Resolution derives their descriptions and interfaces and includes exact definitions in
the resolved hash. Multiple references for one operation must have the same scope. Do
not copy mappings or parameter values into a parallel ruleset description.

When editing a rule, update its processor validation and behaviour tests as needed. The
fixture/executor parity test covers every JSON declaration in this directory. Keep
reviewed record decisions in their own input fixtures.
