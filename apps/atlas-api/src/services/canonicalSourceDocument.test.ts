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
    CREATE TABLE sourceReleases(id TEXT,code TEXT);
    CREATE TABLE releases(id TEXT,code TEXT,datasetId TEXT,sourceReleaseId TEXT,sourceVersion TEXT,cohortKey TEXT,sourceSchemaVersion TEXT,originalFileName TEXT);
    INSERT INTO datasets VALUES('dataset','ds-statistic');
    INSERT INTO sourceReleases VALUES('source-old','old-source'),('source-new','new-source');
    INSERT INTO releases VALUES('old','old-resource','dataset','source-old','2024','2024','v1','old.zip'),('new','new-resource','dataset','source-new','2026','2026','v2','new.zip');`)
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
        originalFileName: 'old.zip',
        sourceReleaseCode: 'old-source',
      },
      new: { sourceVersion: '2026', originalFileName: 'new.zip' },
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
    CREATE TABLE sourceReleases(id TEXT,code TEXT);
    CREATE TABLE releases(id TEXT,code TEXT,datasetId TEXT,sourceReleaseId TEXT,sourceVersion TEXT,cohortKey TEXT,sourceSchemaVersion TEXT,originalFileName TEXT);
    CREATE TABLE snapshotSourceReleases(snapshotId TEXT,datasetId TEXT,resourceReleaseId TEXT,role TEXT);
    INSERT INTO datasets VALUES('dataset','ds-hk-hkgov-pland-division-area-pu');
    INSERT INTO sourceReleases VALUES('source','planning-source');
    INSERT INTO releases VALUES('release','planning-resource','dataset','source','2024','2024','v1','planning.zip');
    INSERT INTO snapshotSourceReleases VALUES('selected','dataset','release','primary');`)
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
      release: { sourceVersion: '2024', originalFileName: 'planning.zip' },
    })
  } finally {
    sqlite.close()
  }
})
