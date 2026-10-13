import { releaseFixtureSchemaSql } from '../../../../libs/core/src/testing/releaseFixtures'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { expect, test } from 'bun:test'
import {
  hydrateCanonicalSourceDocument,
  requiresCanonicalSourceExpansion,
} from './canonicalSourceDocument'

test('full Statistics specifications preserve each field release rather than substituting the latest release', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`CREATE TABLE datasets(id TEXT,code TEXT);
    ;
    ${releaseFixtureSchemaSql()};
    INSERT INTO datasets VALUES('dataset','ds-statistic');
    INSERT INTO sourceReleases (id, code) VALUES('source-old','old-source'),('source-new','new-source');
    INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, cohortKey, sourceSchemaVersion) VALUES ('source-old', 'dataset', 'source-' || 'old-resource', '2024', 'current', '2024', 'v1');
UPDATE sourceReleases SET datasetId = 'dataset', sourceVersion = '2024', cohortKey = '2024', sourceSchemaVersion = 'v1' WHERE id = 'source-old';
INSERT INTO resourceReleases (id, code, sourceReleaseId, resourceType, status) VALUES ('old', 'old-resource', 'source-old', 'division', 'current');
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, cohortKey, sourceSchemaVersion) VALUES ('source-new', 'dataset', 'source-' || 'new-resource', '2026', 'current', '2026', 'v2');
UPDATE sourceReleases SET datasetId = 'dataset', sourceVersion = '2026', cohortKey = '2026', sourceSchemaVersion = 'v2' WHERE id = 'source-new';
INSERT INTO resourceReleases (id, code, sourceReleaseId, resourceType, status) VALUES ('new', 'new-resource', 'source-new', 'division', 'current');`)
  const document = {
    data: [
      {
        type: 'statistics',
        id: 'record',
        attributes: {
          fieldSources: {
            population: { sourceReleaseId: 'old' },
            area: { sourceReleaseId: 'new' },
          },
        },
      },
    ],
    meta: {} as Record<string, unknown>,
  }
  try {
    await hydrateCanonicalSourceDocument(document, {
      metaDb: drizzle({ client: sqlite }) as never,
      historyDbsByBinding: {} as never,
    })
    expect(document.meta.sourceSpecifications).toMatchObject({
      old: {
        sourceVersion: '2024',
        originalFileName: null,
        sourceReleaseCode: 'old-source',
      },
      new: { sourceVersion: '2026', originalFileName: null },
    })
    expect(document.data[0]!.attributes.fieldSources.population.sourceReleaseId).toBe(
      'old',
    )
    await hydrateCanonicalSourceDocument(
      { data: [{ type: 'statistics', attributes: { values: { population: 1 } } }] },
      { metaDb: {} as never, historyDbsByBinding: {} as never },
    )
  } finally {
    sqlite.close()
  }
})

test('units responses expand implicit full provenance for both address API versions', () => {
  expect(requiresCanonicalSourceExpansion('/addresses/v0/id/units')).toBe(true)
  expect(requiresCanonicalSourceExpansion('/addresses/v0.1/id/units', 'compact')).toBe(
    true,
  )
  expect(requiresCanonicalSourceExpansion('/addresses/v0.1/id')).toBe(false)
  expect(requiresCanonicalSourceExpansion('/divisions/v0/id', 'full')).toBe(true)
})

test('Planning geometry references use the selected snapshot release specification', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`CREATE TABLE datasets(id TEXT,code TEXT);
    ;
    ${releaseFixtureSchemaSql()};
    CREATE TABLE snapshotResourceReleases(snapshotId TEXT,resourceReleaseId TEXT,role TEXT);
    INSERT INTO datasets VALUES('dataset','ds-hk-hkgov-pland-division-area-pu');
    INSERT INTO sourceReleases (id, code) VALUES('source','planning-source');
    INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, cohortKey, sourceSchemaVersion) VALUES ('source', 'dataset', 'source-' || 'planning-resource', '2024', 'current', '2024', 'v1');
UPDATE sourceReleases SET datasetId = 'dataset', sourceVersion = '2024', cohortKey = '2024', sourceSchemaVersion = 'v1' WHERE id = 'source';
INSERT INTO resourceReleases (id, code, sourceReleaseId, resourceType, status) VALUES ('release', 'planning-resource', 'source', 'division', 'current');
    INSERT INTO snapshotResourceReleases VALUES('selected','release','primary');`)
  const document = {
    data: {
      type: 'division-areas',
      id: 'area',
      attributes: {
        snapshotId: 'selected',
        sources: {
          hkgovPland: [{ cell_id: 'PLAND:111:1' }] as Array<Record<string, unknown>>,
        },
      },
    },
    meta: {} as Record<string, unknown>,
  }
  try {
    await hydrateCanonicalSourceDocument(document, {
      metaDb: drizzle({ client: sqlite }) as never,
      historyDbsByBinding: {} as never,
    })
    expect(document.data.attributes.sources.hkgovPland).toEqual([
      {
        cell_id: 'PLAND:111:1',
        resourceReleaseId: 'release',
        dataset: 'ds-hk-hkgov-pland-division-area-pu',
      },
    ])
    expect(document.meta.sourceSpecifications).toMatchObject({
      release: { sourceVersion: '2024', originalFileName: null },
    })
  } finally {
    sqlite.close()
  }
})
