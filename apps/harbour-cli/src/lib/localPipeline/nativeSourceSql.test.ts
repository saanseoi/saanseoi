import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  buildNativeSourceSql,
  versionNativeSourceRows,
  type NativeSourceRow,
} from './nativeSourceSql.ts'
import { readHkgovHydStreetArchive } from '../sources/hkgov/hkgovHyd.ts'
import { sourceSchema } from '@repo/db'
import { getTableConfig } from 'drizzle-orm/sqlite-core'

test('road centreline schema reuses unchanged features across different archives', async () => {
  const db = new Database(':memory:')
  const config = getTableConfig(sourceSchema.sourceHkgovLandsdRoadCentrelines)
  db.exec(
    `CREATE TABLE "${config.name}" (${config.columns.map(column => `"${column.name}" ${column.getSQLType()}${column.notNull ? ' NOT NULL' : ''}`).join(',')}, PRIMARY KEY(sourceRecordId,versionHash))`,
  )
  const original = {
    sourceRecordId: 'road',
    rawProperties: { name: 'Road' },
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
      release,
      release,
    ))
      db.exec(sql)
  }
  try {
    await run('first', [
      {
        ...original,
        sources: [{ dataset: 'landsd', sourceArchiveSha256: 'archive-1' }],
      },
    ])
    await run('second', [
      {
        ...original,
        sources: [{ dataset: 'landsd', sourceArchiveSha256: 'archive-2' }],
      },
    ])
    expect(
      db
        .query(
          `SELECT count(*) AS n, min(validFromRelease) AS first FROM "${config.name}"`,
        )
        .get(),
    ).toEqual({ n: 1, first: 'first' })
    await run('third', [
      { ...original, rawProperties: { name: 'Changed' }, sources: null },
    ])
    expect(db.query(`SELECT count(*) AS n FROM "${config.name}"`).get()).toEqual({
      n: 2,
    })
    expect(
      db.query(`SELECT validToRelease FROM "${config.name}" WHERE isCurrent=0`).get(),
    ).toEqual({ validToRelease: 'third' })
    await run('fourth', [])
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
    sourceGeometry TEXT NOT NULL, rawProperties TEXT NOT NULL,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, isCurrent INTEGER NOT NULL,
    releaseId TEXT NOT NULL, validFromRelease TEXT NOT NULL, validToRelease TEXT,
    PRIMARY KEY(sourceRecordId, versionHash)
  )`)
  const original = {
    sourceRecordId: 'one',
    sourceGeometry: { text: "香港'😀".repeat(30000) },
    rawProperties: { text: '街道'.repeat(30000) },
  }
  const run = async (rows: NativeSourceRow[], release: string) => {
    const chunks = await buildNativeSourceSql(
      [{ name: 'evidence', provenance: 'inherited', replaceCurrentRows: true, rows }],
      release,
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
    expect(JSON.parse(first.rawProperties as string)).toEqual(original.rawProperties)
    expect(first.isCurrent).toBe(1)
    await run([original], 'first')
    expect(db.query('SELECT count(*) AS n FROM evidence').get()).toEqual({ n: 1 })
    expect(db.query('SELECT createdAt FROM evidence').get()).toEqual({
      createdAt: first.createdAt,
    })
    await run([{ ...original, rawProperties: { text: 'different' } }], 'second')
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
  const root = resolve(import.meta.dir, '../../../../..')
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
        kind === 'streetNamePlate' ? String(feature.properties.SNP_ID) : String(i),
      sourceGeometry: feature.geometry,
      rawProperties: feature.properties,
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
            'SELECT sourceGeometry, rawProperties FROM evidence WHERE sourceRecordId = ? AND versionHash = ?',
          )
          .get(row.sourceRecordId, row.versionHash) as {
          sourceGeometry: string
          rawProperties: string
        }
        expect(JSON.parse(retained.sourceGeometry)).toEqual(row.sourceGeometry)
        expect(JSON.parse(retained.rawProperties)).toEqual(
          JSON.parse(JSON.stringify(row.rawProperties)),
        )
      }
    } finally {
      db.close()
    }
  }
}, 30000)
