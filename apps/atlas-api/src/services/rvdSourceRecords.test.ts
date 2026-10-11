import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import {
  getSourceRecordSchema,
  listSourceRecords,
  streamSourceRecordsNdjson,
} from './sourceRecords'

test('RVD schema, random samples and exports read historical assertions without geometry', async () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE hkgovRvdAreas(sourceRecordId TEXT, versionHash TEXT,
    properties TEXT, validFromRelease TEXT, validToRelease TEXT);
    INSERT INTO hkgovRvdAreas VALUES
      ('district', 'v1', '{"kind":"district","page":1,"names":{"en":"Central and Western"},"tertiaryPlanningUnits":["111"]}', '2015-04-30.0', NULL),
      ('expired', 'v0', '{"expired":true}', '2014-01-01.0', '2015-04-30.0'),
      ('future', 'v2', '{"future":true}', '2016-01-01.0', NULL);`)
  const binding = {
    prepare: (sql: string) => ({
      bind: (...params: string[]) => ({
        all: async () => ({ results: db.query(sql).all(...params) }),
      }),
    }),
  }
  const code = 'dr-hk-hkgov-rvd-division-2015-04-30.0'
  const args = {
    env: { DB_SOURCE_HK_BEFORE: binding } as never,
    metaDb: {
      $client: {
        prepare: () => ({
          bind: () => ({
            all: async () => ({
              results: [
                {
                  datasetCode: 'ds-hk-hkgov-rvd-division',
                  resourceReleaseId: 'rvd',
                  sourceReleaseCode: code,
                  sourceVersion: '2015-04-30.0',
                  resourceType: 'division',
                  sourceVariant: 'hkgov-rvd',
                  bindingName: 'DB_SOURCE_HK_BEFORE',
                },
              ],
            }),
          }),
        }),
      },
    } as never,
    family: 'divisions' as const,
    sourceReleaseCode: code,
    includeGeometry: true,
  }
  try {
    const schema = await getSourceRecordSchema(args)
    expect(schema?.required).toEqual(['kind', 'names', 'page', 'tertiaryPlanningUnits'])
    expect(schema?.properties.page).toMatchObject({
      type: 'integer',
      nullable: false,
      description: expect.stringContaining('four-page appendix'),
    })
    expect(schema?.properties.names).toHaveProperty('properties.en.description')
    expect(schema?.properties.tertiaryPlanningUnits).toHaveProperty(
      'items.type',
      'string',
    )
    expect(schema?.properties).not.toHaveProperty('future')
    for (const sample of [undefined, 'random'] as const) {
      const page = await listSourceRecords({ ...args, sample, limit: 10 })
      expect(page?.records).toEqual([
        {
          sourceRecordId: 'district',
          properties: {
            kind: 'district',
            page: 1,
            names: { en: 'Central and Western' },
            tertiaryPlanningUnits: ['111'],
          },
        },
      ])
    }
    const stream = await streamSourceRecordsNdjson(args)
    expect(stream).not.toBeNull()
    const rows = (await new Response(stream).text())
      .trim()
      .split('\n')
      .map(row => JSON.parse(row))
    expect(rows).toHaveLength(1)
    expect(rows[0].sourceRecordId).toBe('district')
    expect(rows[0]).not.toHaveProperty('geometry')
  } finally {
    db.close()
  }
})
