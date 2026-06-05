import { describe, expect, test } from 'bun:test'

import type { ParquetInspection, UploadPlan } from '@repo/core'

import { validateOvertureSchema } from './overture.ts'

const BASE_DIVISION_FIELDS = [
  { name: 'id', type: 'utf8', nullable: true },
  { name: 'geometry', type: 'type', nullable: true },
  { name: 'bbox', type: 'struct', nullable: true },
  { name: 'country', type: 'utf8', nullable: true },
  { name: 'version', type: 'int_32', nullable: true },
  { name: 'sources', type: 'list', nullable: true },
  { name: 'cartography', type: 'struct', nullable: true },
  { name: 'subtype', type: 'utf8', nullable: true },
  { name: 'class', type: 'utf8', nullable: true },
  { name: 'names', type: 'struct', nullable: true },
  { name: 'wikidata', type: 'utf8', nullable: true },
  { name: 'region', type: 'utf8', nullable: true },
  { name: 'perspectives', type: 'struct', nullable: true },
  { name: 'local_type', type: 'map', nullable: true },
  { name: 'hierarchies', type: 'list', nullable: true },
  { name: 'parent_division_id', type: 'utf8', nullable: true },
  { name: 'norms', type: 'struct', nullable: true },
  { name: 'population', type: 'int_32', nullable: true },
  { name: 'capital_division_ids', type: 'list', nullable: true },
  { name: 'capital_of_divisions', type: 'list', nullable: true },
  { name: 'theme', type: 'utf8', nullable: true },
  { name: 'type', type: 'utf8', nullable: true },
] satisfies ParquetInspection['schema']

function makePlan(sourceVersion: string): UploadPlan {
  return {
    regionCode: 'hk',
    theme: 'divisions',
    type: 'division',
    source: 'overture',
    snapshotMonth: '2026-05',
    sourceVersion,
    datasetId: `overture-hk-${sourceVersion}-division`,
    filePath: '/tmp/division.parquet',
    fileName: 'division.parquet',
    originalFileName: 'division.parquet',
    rowCount: 1,
    schemaFingerprint: 'test-fingerprint',
    inferredFrom: {
      theme: 'path',
      type: 'path',
      regionCode: 'path',
      snapshotMonth: 'flag',
      sourceVersion: 'flag',
    },
    supersedesDatasetId: null,
  }
}

function makeInspection(schema: ParquetInspection['schema']): ParquetInspection {
  return {
    rowCount: 1,
    schema,
    distinctThemeValues: ['divisions'],
    distinctTypeValues: ['division'],
    distinctCountryValues: ['HK'],
    distinctRegionValues: [],
  }
}

describe('validateOvertureSchema', () => {
  test('accepts the pre-admin_level division schema before 2026-02-18.0', () => {
    const result = validateOvertureSchema(
      makePlan('2026-02-17.0'),
      makeInspection(BASE_DIVISION_FIELDS),
    )

    expect(result.schema.id).toBe('overture-division-v2025-09-24.0')
  })

  test('accepts admin_level for division uploads from 2026-02-18.0 onward', () => {
    const result = validateOvertureSchema(
      makePlan('2026-02-18.0'),
      makeInspection([
        ...BASE_DIVISION_FIELDS.slice(0, 20),
        { name: 'admin_level', type: 'int_32', nullable: true },
        ...BASE_DIVISION_FIELDS.slice(20),
      ]),
    )

    expect(result.schema.id).toBe('overture-division-v2026-02-18.0')
  })
})
