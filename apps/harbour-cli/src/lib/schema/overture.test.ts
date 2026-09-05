import { describe, expect, test } from 'bun:test'

import { inspectParquetFile } from '@repo/core/parquetInspectorNode'
import type { UploadInspection, UploadPlan } from '@repo/core'
import { resolve } from 'node:path'

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
] satisfies UploadInspection['schema']

const BASE_DIVISION_AREA_FIELDS = [
  { name: 'id', type: 'utf8', nullable: true },
  { name: 'geometry', type: 'type', nullable: true },
  { name: 'country', type: 'utf8', nullable: true },
  { name: 'sources', type: 'list', nullable: true },
  { name: 'subtype', type: 'utf8', nullable: true },
  { name: 'class', type: 'utf8', nullable: true },
  { name: 'names', type: 'struct', nullable: true },
  { name: 'is_land', type: 'boolean', nullable: true },
  { name: 'is_territorial', type: 'boolean', nullable: true },
  { name: 'region', type: 'utf8', nullable: true },
  { name: 'division_id', type: 'utf8', nullable: true },
  { name: 'version', type: 'int_32', nullable: true },
  { name: 'bbox', type: 'struct', nullable: true },
  { name: 'theme', type: 'utf8', nullable: true },
  { name: 'type', type: 'utf8', nullable: true },
] satisfies UploadInspection['schema']

const BASE_DIVISION_BOUNDARY_FIELDS = [
  { name: 'id', type: 'utf8', nullable: true },
  { name: 'geometry', type: 'type', nullable: true },
  { name: 'division_ids', type: 'list', nullable: true },
  { name: 'subtype', type: 'utf8', nullable: true },
  { name: 'class', type: 'utf8', nullable: true },
  { name: 'sources', type: 'list', nullable: true },
  { name: 'perspectives', type: 'struct', nullable: true },
  { name: 'is_disputed', type: 'boolean', nullable: true },
  { name: 'is_land', type: 'boolean', nullable: true },
  { name: 'is_territorial', type: 'boolean', nullable: true },
  { name: 'country', type: 'utf8', nullable: true },
  { name: 'region', type: 'utf8', nullable: true },
  { name: 'version', type: 'int_32', nullable: true },
  { name: 'bbox', type: 'struct', nullable: true },
  { name: 'theme', type: 'utf8', nullable: true },
  { name: 'type', type: 'utf8', nullable: true },
] satisfies UploadInspection['schema']

function makePlan(sourceVersion: string): UploadPlan {
  return {
    datasetCode: 'ds-hk-overture-division',
    releaseCode: `overture-hk-${sourceVersion}-division`,
    regionCode: 'hk',
    theme: 'divisions',
    type: 'division',
    source: 'overture',
    cohortKey: '2026-05',
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
      cohortKey: 'flag',
      source: 'flag',
      sourceVersion: 'flag',
    },
    supersedesDatasetId: null,
  }
}

function makePlacePlan(sourceVersion: string): UploadPlan {
  return {
    ...makePlan(sourceVersion),
    cohortKey: sourceVersion.slice(0, 7),
    datasetCode: 'ds-hk-overture-place',
    releaseCode: `overture-hk-${sourceVersion}-place`,
    theme: 'places',
    type: 'place',
    datasetId: `overture-hk-${sourceVersion}-place`,
    filePath: '/tmp/place.parquet',
    fileName: 'place.parquet',
    originalFileName: 'place.parquet',
  }
}

function makeDivisionAreaPlan(sourceVersion: string): UploadPlan {
  return {
    ...makePlan(sourceVersion),
    datasetCode: 'ds-hk-overture-division-area',
    releaseCode: `overture-hk-${sourceVersion}-divisionArea`,
    type: 'divisionArea',
    datasetId: `overture-hk-${sourceVersion}-divisionArea`,
    filePath: '/tmp/division-area.parquet',
    fileName: 'division-area.parquet',
    originalFileName: 'division-area.parquet',
  }
}

function makeDivisionBoundaryPlan(sourceVersion: string): UploadPlan {
  return {
    ...makePlan(sourceVersion),
    datasetCode: 'ds-hk-overture-division-boundary',
    releaseCode: `overture-hk-${sourceVersion}-divisionBoundary`,
    type: 'divisionBoundary',
    datasetId: `overture-hk-${sourceVersion}-divisionBoundary`,
    filePath: '/tmp/division-boundary.parquet',
    fileName: 'division-boundary.parquet',
    originalFileName: 'division-boundary.parquet',
  }
}

function makeInspection(schema: UploadInspection['schema']): UploadInspection {
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
  test('accepts the initial checked-in Overture Places fixture', async () => {
    const fixturePath = resolve(
      import.meta.dir,
      '../../../../../data/overture/2025-09-24.0/divisions/China/Hong Kong/place.division.intersects.clipSmart.parquet',
    )
    const inspection = await inspectParquetFile(fixturePath)

    const result = validateOvertureSchema(makePlacePlan('2025-09-24.0'), inspection)

    expect(result.schema.id).toBe('overture-place-v2025-09-24.0')
  })

  test('accepts the intermediate checked-in Overture Places fixture', async () => {
    const fixturePath = resolve(
      import.meta.dir,
      '../../../../../data/overture/2025-10-22.0/divisions/China/Hong Kong/place.division.intersects.clipSmart.parquet',
    )
    const inspection = await inspectParquetFile(fixturePath)

    const result = validateOvertureSchema(makePlacePlan('2025-10-22.0'), inspection)

    expect(result.schema.id).toBe('overture-place-v2025-10-22.0')
  })

  test('accepts the taxonomy Overture Places reference fixture', async () => {
    const fixturePath = resolve(
      import.meta.dir,
      '../../../../../data/overture/2026-08-19.0/divisions/China/Hong Kong/place.division.intersects.clipSmart.parquet',
    )
    const inspection = await inspectParquetFile(fixturePath)

    const result = validateOvertureSchema(makePlacePlan('2026-08-19.0'), inspection)

    expect(result.schema.id).toBe('overture-place-v2025-12-17.0')
  })

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

  test('accepts admin_level for divisionArea uploads from 2026-02-18.0 onward', () => {
    const result = validateOvertureSchema(
      makeDivisionAreaPlan('2026-02-18.0'),
      makeInspection([
        ...BASE_DIVISION_AREA_FIELDS.slice(0, 13),
        { name: 'admin_level', type: 'int_32', nullable: true },
        ...BASE_DIVISION_AREA_FIELDS.slice(13),
      ]),
    )

    expect(result.schema.id).toBe('overture-division-area-v2026-02-18.0')
  })

  test('accepts the pre-admin_level divisionBoundary schema before 2026-02-18.0', () => {
    const result = validateOvertureSchema(
      makeDivisionBoundaryPlan('2026-02-17.0'),
      makeInspection(BASE_DIVISION_BOUNDARY_FIELDS),
    )

    expect(result.schema.id).toBe('overture-division-boundary-v2025-09-24.0')
  })

  test('accepts admin_level for divisionBoundary uploads from 2026-02-18.0 onward', () => {
    const result = validateOvertureSchema(
      makeDivisionBoundaryPlan('2026-02-18.0'),
      makeInspection([
        ...BASE_DIVISION_BOUNDARY_FIELDS.slice(0, 14),
        { name: 'admin_level', type: 'int_32', nullable: true },
        ...BASE_DIVISION_BOUNDARY_FIELDS.slice(14),
      ]),
    )

    expect(result.schema.id).toBe('overture-division-boundary-v2026-02-18.0')
  })
})
