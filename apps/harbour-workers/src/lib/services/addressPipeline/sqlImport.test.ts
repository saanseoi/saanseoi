import { describe, expect, test } from 'bun:test'

import {
  buildAddressResolvedSqlImportFiles,
  buildAddressSourceSqlImportFiles,
  buildAddressSqlImportRunId,
} from './sqlImport'
import { splitSqlStatements } from './sqlImportStages'
import type {
  NormalizedAddressChunkArtifact,
  ResolvedAddressChunkArtifact,
} from './types'
import type { DatasetProcessingMessage } from '@repo/core'

const message = {
  cohortKey: '2026-01-01.0',
  datasetId: 'dataset-address-1',
  rawObjectKey: 'raw/address.parquet',
  regionCode: 'hk',
  releaseId: 'release-address-1',
  source: 'hkgov-als',
  sourceVersion: '2026-01-01.0',
  theme: 'addresses',
  type: 'address',
} satisfies DatasetProcessingMessage

const normalizedArtifact = {
  kind: 'address.normalized.v1',
  processingRunStartedAt: '2026-01-02T00:00:00.000Z',
  releaseId: 'release-address-1',
  rowStart: 0,
  rowEnd: 2,
  totalRows: 2,
  rows: [
    {
      sourceId: 'addr-1',
      sourcePayloadHash: 'hash-1',
      matchKey: 'district::STREET::1',
      raw: {
        geoAddress: "O'Brien House",
        hkgovCsuId: 'csu-1',
        easting: 1,
        northing: 2,
        enDistrict: 'Central',
        enStreetName: "Queen's Road",
        enStreetNumberFrom: '1',
      },
      base: {
        divisionSnapshotId: 'division-snapshot-1',
        streetSnapshotId: null,
        streetId: null,
        hamletId: null,
        microhoodId: null,
        villageId: null,
        neighbourhoodId: null,
        macrohoodId: null,
        townId: null,
        districtId: 'district-1',
        areaId: 'area-1',
        countryId: 'country-1',
        geometry: { type: 'Point', coordinates: [114, 22] },
        bbox: null,
        identifiers: null,
        sources: { hkgov: 'addr-1' },
      },
      i18n: [
        {
          addressId: 'addr-1',
          locale: 'en',
          formattedAddress: "1 Queen's Road",
          buildingName: "O'Brien House",
          buildingNumberFrom: null,
          buildingNumberTo: null,
          blockType: null,
          blockNumber: null,
          blockTypeBeforeNumber: null,
          phaseName: null,
          phaseNumber: null,
          estateName: null,
          streetNumber: '1',
          streetName: "Queen's Road",
        },
      ],
    },
    {
      sourceId: 'addr-2',
      sourcePayloadHash: 'hash-2',
      matchKey: null,
      raw: {
        geoAddress: 'Second Address',
      },
      base: {
        divisionSnapshotId: 'division-snapshot-1',
        streetSnapshotId: null,
        streetId: null,
        hamletId: null,
        microhoodId: null,
        villageId: null,
        neighbourhoodId: null,
        macrohoodId: null,
        townId: null,
        districtId: null,
        areaId: null,
        countryId: 'country-1',
        geometry: null,
        bbox: null,
        identifiers: null,
        sources: null,
      },
      i18n: [],
    },
  ],
} satisfies NormalizedAddressChunkArtifact

const resolvedArtifact = {
  kind: 'address.resolved.v1',
  insertedVersions: 1,
  localizedRows: 1,
  processingRunStartedAt: '2026-01-02T00:00:00.000Z',
  releaseId: 'release-address-1',
  rowStart: 0,
  rowEnd: 1,
  totalRows: 1,
  unchangedRows: 0,
  rows: [
    {
      addressId: 'addr-1',
      changed: true,
      changedExistingId: null,
      sourceId: 'addr-1',
      versionHash: 'version-hash-1',
      base: {
        snapshotId: 'snapshot-address-1',
        id: 'addr-1',
        divisionSnapshotId: 'division-snapshot-1',
        streetSnapshotId: null,
        streetId: null,
        hamletId: null,
        microhoodId: null,
        villageId: null,
        neighbourhoodId: null,
        macrohoodId: null,
        townId: null,
        districtId: 'district-1',
        areaId: 'area-1',
        countryId: 'country-1',
        geometry: { type: 'Point', coordinates: [114, 22] },
        bbox: null,
        identifiers: null,
        sources: { hkgov: 'addr-1' },
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
      i18n: [
        {
          snapshotId: 'snapshot-address-1',
          addressId: 'addr-1',
          locale: 'en',
          formattedAddress: "1 Queen's Road",
          buildingName: "O'Brien House",
          buildingNumberFrom: null,
          buildingNumberTo: null,
          blockType: null,
          blockNumber: null,
          blockTypeBeforeNumber: null,
          phaseName: null,
          phaseNumber: null,
          estateName: null,
          streetNumber: '1',
          streetName: "Queen's Road",
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    },
  ],
} satisfies ResolvedAddressChunkArtifact

describe('address SQL import builders', () => {
  test('builds stable run IDs', () => {
    expect(buildAddressSqlImportRunId(message)).toBe(
      'address-hkgov-als-hk-2026-release-address-1-2026-01-01.0',
    )
  })

  test('builds source staging and apply SQL with escaped values', () => {
    const [file] = buildAddressSourceSqlImportFiles(message, normalizedArtifact, {
      runId: 'run-1',
      maxStatementBytes: 700,
    })

    expect(file?.target).toBe('source')
    expect(file?.sql).toContain('CREATE TABLE IF NOT EXISTS ssAddressImportRows')
    expect(file?.sql).toContain('ssAddressImportSourceChanged')
    expect(file?.sql).toContain("O''Brien House")
    expect(file?.sql).toContain("Queen''s Road")
    expect(file?.sql.match(/INSERT OR REPLACE INTO ssAddressImportRows/g)?.length).toBe(
      2,
    )
  })

  test('builds separate history and current SQL files from resolved artifacts', () => {
    const files = buildAddressResolvedSqlImportFiles(message, resolvedArtifact, {
      runId: 'run-1',
    })

    expect(files.map(file => file.target)).toEqual(['history', 'current'])
    expect(files[0]?.sql).toContain('INSERT INTO address2dVersions')
    expect(files[1]?.sql).toContain('INSERT INTO address2d')
    expect(files[1]?.sql).toContain('UPDATE address2d')
  })

  test('splits multiline SQL scripts without splitting quoted semicolons', () => {
    const statements = splitSqlStatements(`
CREATE TABLE IF NOT EXISTS ssAddressImportRows (
  runId TEXT NOT NULL,
  rawPayload TEXT,
  PRIMARY KEY (runId)
);
INSERT INTO ssAddressImportRows (runId, rawPayload)
VALUES ('run-1', '{"name":"O''Brien; House"}');
DELETE FROM ssAddressImportRows WHERE runId = 'run-1'
`)

    expect(statements).toEqual([
      `CREATE TABLE IF NOT EXISTS ssAddressImportRows (
  runId TEXT NOT NULL,
  rawPayload TEXT,
  PRIMARY KEY (runId)
);`,
      `INSERT INTO ssAddressImportRows (runId, rawPayload)
VALUES ('run-1', '{"name":"O''Brien; House"}');`,
      "DELETE FROM ssAddressImportRows WHERE runId = 'run-1'",
    ])
  })
})
