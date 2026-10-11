import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { getSourceRecordSchema, listSourceRecords } from './sourceRecords'
import { listSourceChanges } from './sourceChanges'
import { SourceChangesQuerySchema } from '../schema/sourceChanges'

test('Protomaps schema, samples and changes use the retained source-only releases', async () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE protomapsIslandFeatures(sourceRecordId TEXT, versionHash TEXT,
    properties TEXT, sourceGeometry TEXT, validFromRelease TEXT, validToRelease TEXT)`)
  const geometry = { type: 'Point', coordinates: [114, 22] }
  const insert = db.query('INSERT INTO protomapsIslandFeatures VALUES (?,?,?,?,?,?)')
  insert.run(
    'island',
    'old',
    '{"kind":"osm-island","names":{"en":"Old"},"tags":{"name":"Island","place":"island"}}',
    JSON.stringify(geometry),
    '2026-09-01.3',
    '2026-10-01.1',
  )
  insert.run(
    'island',
    'new',
    '{"kind":"osm-island","names":{"en":"New"},"tags":{"name":"Island","place":"island"}}',
    JSON.stringify(geometry),
    '2026-10-01.1',
    null,
  )
  insert.run(
    'coastline',
    'same',
    '{"kind":"coastline-land","names":{},"tags":{}}',
    JSON.stringify(geometry),
    '2026-09-01.3',
    null,
  )
  const source = {
    prepare: (sql: string) => ({
      bind: (...values: string[]) => ({
        all: async () => ({ results: db.query(sql).all(...values) }),
      }),
    }),
  }
  const metaDb = {
    $client: {
      prepare: () => ({
        bind: (release: string) => ({
          all: async () => ({
            results: [
              {
                datasetId: 'dataset',
                datasetCode: 'ds-hk-protomaps-island',
                publisherCode: 'protomaps',
                sourceVariant: 'protomaps',
                resourceReleaseId: release,
                sourceReleaseCode: release,
                sourceVersion:
                  release === 'september' ? '2026-09-01.3' : '2026-10-01.1',
                resourceType: 'divisionArea',
                bindingName: 'DB_SOURCE_HK_2026',
              },
            ],
          }),
        }),
      }),
    },
  }
  const args = {
    env: { DB_SOURCE_HK_2026: source } as never,
    metaDb: metaDb as never,
    family: 'divisions' as const,
  }
  try {
    for (const sourceReleaseCode of ['september', 'october']) {
      const schema = await getSourceRecordSchema({ ...args, sourceReleaseCode })
      expect(schema?.properties).toHaveProperty('kind')
      expect(schema?.properties).toHaveProperty('names')
      expect(schema?.properties.kind).toMatchObject({
        description: expect.stringContaining('mainland'),
        enum: ['osm-island', 'coastline-land'],
        nullable: false,
      })
      const names = schema?.properties.names as {
        description: string
        properties: Record<string, { type: string; description: string }>
        additionalProperties: { type: string }
      }
      expect(names.description).toContain('empty object')
      for (const language of ['en', 'zh', 'zh-Hant', 'zh-Hans', 'yue']) {
        expect(names.properties[language]?.type).toBe('string')
        expect(names.properties[language]?.description).toBeTruthy()
      }
      expect(names.properties.zh?.description).toContain('does not specify')
      expect(names.additionalProperties.type).toBe('string')
      expect(schema?.properties.tags).toMatchObject({
        description: expect.stringContaining('Source attributes'),
        additionalProperties: { type: 'string' },
      })
      // Language keys are optional even though every record has a names object.
      expect(schema?.required).toContain('names')
      expect(schema?.properties.names).not.toHaveProperty('required')
      const page = await listSourceRecords({
        ...args,
        sourceReleaseCode,
        includeGeometry: true,
        limit: 10,
        sample: 'random',
      })
      expect(page?.records).toHaveLength(2)
      expect(page?.records.find(row => row.sourceRecordId === 'island')).toMatchObject({
        geometry,
        properties: {
          names: { en: sourceReleaseCode === 'september' ? 'Old' : 'New' },
        },
      })
    }
    const changes = await listSourceChanges({
      ...args,
      query: SourceChangesQuerySchema.parse({
        fromRelease: 'september',
        toRelease: 'october',
      }),
    })
    expect(changes.records).toHaveLength(1)
    expect(changes.records.find(row => row.sourceRecordId === 'island')?.type).toBe(
      'changed',
    )
    expect(changes.records.some(row => row.sourceRecordId === 'coastline')).toBe(false)
  } finally {
    db.close()
  }
})
