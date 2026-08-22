import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('source migration recovers exact periods from populated publisher rows', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE hkgovCenstatdDistrictLandAreaPopulationDensities (
      referenceYear TEXT NOT NULL
    );
    CREATE TABLE hkgovCenstatdStatistics (
      referenceYear TEXT NOT NULL,
      rawProperties TEXT
    );
    INSERT INTO hkgovCenstatdDistrictLandAreaPopulationDensities
      (referenceYear) VALUES ('2024/25');
    INSERT INTO hkgovCenstatdStatistics (referenceYear, rawProperties) VALUES
      ('2023-H2', '{"PERIOD":"2023"}'),
      ('2023-H2', '{"YEAR":"2023","QUARTER":3}'),
      ('2026', '{"year":"2016"}');
  `)
  const migration = readFileSync(
    resolve(
      import.meta.dir,
      '../migrations/source/20260820064217_large_bill_hollister/migration.sql',
    ),
    'utf8',
  ).replaceAll('--> statement-breakpoint', '')

  sqlite.exec(migration)

  expect(
    sqlite
      .query(
        `SELECT referencePeriodCode, referencePeriodStart, referencePeriodEnd,
                referencePeriodGranularity, referencePeriodEndYear
         FROM hkgovCenstatdDistrictLandAreaPopulationDensities`,
      )
      .get(),
  ).toEqual({
    referencePeriodCode: '2024/25',
    referencePeriodEnd: null,
    referencePeriodEndYear: '2025',
    referencePeriodGranularity: 'multi-year',
    referencePeriodStart: null,
  })
  expect(
    sqlite
      .query(
        `SELECT referencePeriodCode, referencePeriodStart, referencePeriodEnd,
                referencePeriodGranularity, referencePeriodEndYear
         FROM hkgovCenstatdStatistics
         ORDER BY referencePeriodCode`,
      )
      .all(),
  ).toEqual([
    {
      referencePeriodCode: '2016',
      referencePeriodEnd: '2016-12-31',
      referencePeriodEndYear: '2016',
      referencePeriodGranularity: 'year',
      referencePeriodStart: '2016-01-01',
    },
    {
      referencePeriodCode: '2023',
      referencePeriodEnd: '2023-12-31',
      referencePeriodEndYear: '2023',
      referencePeriodGranularity: 'year',
      referencePeriodStart: '2023-01-01',
    },
    {
      referencePeriodCode: '2023-Q3',
      referencePeriodEnd: '2023-09-30',
      referencePeriodEndYear: '2023',
      referencePeriodGranularity: 'quarter',
      referencePeriodStart: '2023-07-01',
    },
  ])

  sqlite.close()
})
