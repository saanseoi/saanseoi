# Release statistics

The metadata database's `stats` table stores numeric facts about a source release or API
release set. Each row has exactly one owner: `resourceReleaseId` or `apiReleaseSetId`.

| Column           | Meaning                                 | Examples                         |
| ---------------- | --------------------------------------- | -------------------------------- |
| `category`       | Subject or statistical category         | `records`, `geometry`, `changes` |
| `measure`        | Measurement within that category        | `count`, `area`, `changed_count` |
| `unit`           | Unit of the numeric value               | `count`, `square_kilometres`     |
| `value`          | Numeric result                          | `12`, `902.89`                   |
| `dimension`      | Attribute used to group the measurement | `district`, `locale`, `level`    |
| `dimensionValue` | Value of that attribute                 | district ID, `en`, `5`           |

Ungrouped facts have null `dimension` and `dimensionValue`. A grouped record count uses
`category = records`, `measure = count` and the relevant dimension. A distribution is
the collection of those grouped counts.

`changes` contains `count`, `added_count`, `changed_count`, `removed_count` and
`unchanged_count`. `completeness` contains measurements such as `locale_count`,
`locale_coverage` and `component_coverage`. `quality` contains individual checks such as
`name_regression_count`. Processing facts use `category = processing` and retain the
stage's measurement name. The `percentage` unit uses a 0–100 scale.

The measure/dimension distinction matches the government statistics model. Government
statistics use dataset-scoped `measureCode` definitions, dimension-qualified fields,
`unitCode` and retained definition versions. Release statistics use numeric rows with
one optional grouping pair; they do not require that full observation model.

## Database preparation

Generate schema migrations with `bun run db:migration:generate:meta` from `libs/db`.
Apply the generated metadata migrations before starting applications that read these
columns. Then normalise the retained measurement classifications:

```sh
bun run --cwd libs/db db:stats:normalise /absolute/path/to/meta.sqlite
bun run --cwd libs/db db:stats:normalise /absolute/path/to/meta.sqlite --apply
```

The first command reports affected rows. The second applies an idempotent backfill
without changing IDs, owners, numeric values, units, dimensions or timestamps. For D1
SQL replay, `bun run --cwd libs/db db:stats:normalise --sql` emits the same
classification statements; execute them after the generated metadata migrations.
