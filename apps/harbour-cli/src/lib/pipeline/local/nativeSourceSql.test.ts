import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  buildNativeSourceSql,
  versionNativeSourceRows,
  type NativeSourceRow,
} from './nativeSourceSql.ts'
import { readHkgovHydStreetArchive } from '../../sources/hkgov/hyd/hkgovHyd.ts'
import { sourceSchema } from '@repo/db'
import { getTableConfig } from 'drizzle-orm/sqlite-core'

test('native source fingerprints remain stable when properties are renamed', async () => {
  const row: NativeSourceRow = {
    sourceRecordId: 'road',
    properties: { STREET_CODE: 7, name: 'Road' },
    sourceGeometry: {
      type: 'LineString',
      coordinates: [
        [1, 2],
        [3, 4],
      ],
    },
    sources: [{ dataset: 'landsd', sourceArchiveSha256: 'archive-1' }],
  }
  const [withProvenance] = await versionNativeSourceRows(
    [row],
    'release-id',
    '2026-07-22.0',
  )
  const [publisherOnly] = await versionNativeSourceRows(
    [row],
    'release-id',
    '2026-07-22.0',
    true,
  )
  expect(withProvenance?.versionHash).toBe(
    '9f2720bb25de2eb71dd2124206614f92a81ed83f78b3ee41dad27c719d9d0dcb',
  )
  expect(publisherOnly?.versionHash).toBe(
    '8cf1286f8e3ffe81064622da57a9b3d0b14b02bb3db2330efa6fa52a31273c98',
  )
  expect(withProvenance?.validFromRelease).toBe('2026-07-22.0')
  expect(withProvenance?.releaseId).toBe('release-id')
  expect(withProvenance?.properties).toEqual({ streetCode: 7, name: 'Road' })
  expect(
    Object.keys(withProvenance ?? {}).filter(key => /properties$/i.test(key)),
  ).toEqual(['properties'])
})

test('road centreline schema reuses unchanged features across different archives', async () => {
  const db = new Database(':memory:')
  const config = getTableConfig(sourceSchema.sourceHkgovLandsdRoadCentrelines)
  db.exec(
    `CREATE TABLE "${config.name}" (${config.columns.map(column => `"${column.name}" ${column.getSQLType()}${column.notNull ? ' NOT NULL' : ''}`).join(',')}, PRIMARY KEY(sourceRecordId,versionHash))`,
  )
  const original = {
    sourceRecordId: 'road',
    properties: { name: 'Road' },
    sourceGeometry: {
      type: 'LineString',
      coordinates: [
        [1, 2],
        [3, 4],
      ],
    },
  }
  const run = async (release: string, rows: NativeSourceRow[]) => {
    for (const sql of await buildNativeSourceSql(
      [{ name: config.name, provenance: 'required', replaceCurrentRows: true, rows }],
      `release-id-${release}`,
      release,
    ))
      db.exec(sql)
  }
  try {
    await run('2025-09-24.0', [
      {
        ...original,
        sources: [{ dataset: 'landsd', sourceArchiveSha256: 'archive-1' }],
      },
    ])
    const firstAssertion = db.query(`SELECT * FROM "${config.name}"`).get()
    const beforeUnchanged = db.query('SELECT total_changes() AS n').get()
    await run('2025-10-22.0', [
      {
        ...original,
        sources: [{ dataset: 'landsd', sourceArchiveSha256: 'archive-2' }],
      },
    ])
    expect(db.query('SELECT total_changes() AS n').get()).toEqual(beforeUnchanged)
    expect(db.query(`SELECT * FROM "${config.name}"`).get()).toEqual(firstAssertion)
    expect(
      db
        .query(
          `SELECT count(*) AS n, min(validFromRelease) AS first FROM "${config.name}"`,
        )
        .get(),
    ).toEqual({ n: 1, first: '2025-09-24.0' })
    await run('2025-11-19.0', [
      { ...original, properties: { name: 'Changed' }, sources: null },
    ])
    expect(db.query(`SELECT count(*) AS n FROM "${config.name}"`).get()).toEqual({
      n: 2,
    })
    expect(
      db.query(`SELECT validToRelease FROM "${config.name}" WHERE isCurrent=0`).get(),
    ).toEqual({ validToRelease: '2025-11-19.0' })
    await run('2025-12-17.0', [])
    expect(
      db.query(`SELECT count(*) AS n FROM "${config.name}" WHERE isCurrent=1`).get(),
    ).toEqual({ n: 0 })
  } finally {
    db.close()
  }
})

test('replays native polygon values and duplicate assertions without losing history', async () => {
  const db = new Database(':memory:')
  db.run(`CREATE TABLE evidence (
    sourceRecordId TEXT NOT NULL, versionHash TEXT NOT NULL,
    sourceGeometry TEXT NOT NULL, properties TEXT NOT NULL,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, isCurrent INTEGER NOT NULL,
    releaseId TEXT NOT NULL, validFromRelease TEXT NOT NULL, validToRelease TEXT,
    PRIMARY KEY(sourceRecordId, versionHash)
  )`)
  const original = {
    sourceRecordId: 'one',
    sourceGeometry: { text: "香港'😀".repeat(30000) },
    properties: { text: '街道'.repeat(30000) },
  }
  const run = async (rows: NativeSourceRow[], release: string) => {
    const chunks = await buildNativeSourceSql(
      [{ name: 'evidence', provenance: 'inherited', replaceCurrentRows: true, rows }],
      `release-id-${release}`,
      release,
    )
    for (const sql of chunks) {
      expect(Buffer.byteLength(sql)).toBeLessThanOrEqual(1_000_000)
      db.exec(sql)
    }
  }
  try {
    await run([original, original], 'first')
    const first = db.query('SELECT * FROM evidence').get() as Record<string, unknown>
    expect(JSON.parse(first.sourceGeometry as string)).toEqual(original.sourceGeometry)
    expect(JSON.parse(first.properties as string)).toEqual(original.properties)
    expect(first.isCurrent).toBe(1)
    const beforeReplay = db.query('SELECT total_changes() AS n').get()
    await run([original], 'first')
    expect(db.query('SELECT total_changes() AS n').get()).toEqual(beforeReplay)
    expect(db.query('SELECT count(*) AS n FROM evidence').get()).toEqual({ n: 1 })
    expect(db.query('SELECT createdAt FROM evidence').get()).toEqual({
      createdAt: first.createdAt,
    })
    await run([{ ...original, properties: { text: 'different' } }], 'second')
    expect(
      db
        .query('SELECT isCurrent, validToRelease FROM evidence WHERE versionHash = ?')
        .get(first.versionHash as string),
    ).toEqual({ isCurrent: 0, validToRelease: 'second' })
    expect(
      db.query('SELECT count(*) AS n FROM evidence WHERE isCurrent = 1').get(),
    ).toEqual({ n: 1 })
  } finally {
    db.close()
  }
})

test('imports all three cached HyD archives with lossless geometry and repeatable SQL', async () => {
  const root = resolve(import.meta.dir, '../../../../../..')
  for (const [kind, slot, id] of [
    ['sensitiveStreet', '2025-Q1', 'hyd_rcd_1632361314743_27775'],
    ['strategicStreet', '2025-Q1', 'hyd_rcd_1632361405484_23178'],
    ['streetNamePlate', '2026-Q2', 'hyd_rcd_1632211119955_31211'],
  ] as const) {
    const archive = await readHkgovHydStreetArchive(
      kind,
      await readFile(resolve(root, 'data/hkgov/csdi/archive', id, slot, 'source.zip')),
    )
    const rows = archive.features.map((feature, i) => ({
      sourceRecordId:
        kind === 'streetNamePlate' ? String(feature.properties.snpId) : String(i),
      sourceGeometry: feature.geometry,
      properties: feature.properties,
    }))
    const versioned = await versionNativeSourceRows(rows, 'test', 'test')
    const firstRow = versioned[0]
    if (!firstRow) throw new Error(`Expected native source rows for ${kind}`)
    const db = new Database(':memory:')
    const columns = Object.keys(firstRow)
    db.exec(
      `CREATE TABLE evidence (${columns.map(column => `"${column}" ${column === 'isCurrent' ? 'INTEGER' : 'TEXT'}`).join(', ')}, PRIMARY KEY(sourceRecordId, versionHash))`,
    )
    try {
      const sql = await buildNativeSourceSql(
        [{ name: 'evidence', provenance: 'inherited', replaceCurrentRows: true, rows }],
        'test',
        'test',
      )
      for (let replay = 0; replay < 2; replay++) {
        for (const part of sql) db.exec(part)
      }
      const expectedCount = new Set(
        versioned.map(row => `${row.sourceRecordId}:${row.versionHash}`),
      ).size
      expect(
        db.query('SELECT count(*) AS n FROM evidence WHERE isCurrent = 1').get(),
      ).toEqual({ n: expectedCount })
      for (const row of versioned) {
        const retained = db
          .query(
            'SELECT sourceGeometry, properties FROM evidence WHERE sourceRecordId = ? AND versionHash = ?',
          )
          .get(row.sourceRecordId, row.versionHash) as {
          sourceGeometry: string
          properties: string
        }
        expect(JSON.parse(retained.sourceGeometry)).toEqual(row.sourceGeometry)
        expect(JSON.parse(retained.properties)).toEqual(
          JSON.parse(JSON.stringify(row.properties)),
        )
      }
    } finally {
      db.close()
    }
  }
}, 30000)
