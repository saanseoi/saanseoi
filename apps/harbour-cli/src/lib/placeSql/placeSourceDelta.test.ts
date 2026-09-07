import { Database } from 'bun:sqlite'
import { test, expect } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { normaliseOverturePlace } from '@repo/core/pipeline/services/place'
import {
  buildPlaceSql,
  buildPlaceSqlBatches,
  loadCurrentPlaceSources,
} from './processLocalPlaceSqlUploadRows.ts'
import type {
  BuildPlaceSqlInput,
  EnrichedPlace,
} from './processLocalPlaceSqlUploadTypes.ts'

function place(id: string, hash = 'same'): EnrichedPlace {
  const normalised = normaliseOverturePlace(
    {
      id,
      geometry: { type: 'Point', coordinates: [114.17, 22.32] },
      names: { en: id },
      description: 'publisher payload '.repeat(200),
    },
    '2026-09-01.0',
  )
  if (!normalised) throw new Error('Missing place')
  return {
    place: normalised,
    sourcePayloadHash: hash,
    versionHash: hash,
    address2dId: null,
    address3dId: null,
    divisionIds: [],
  }
}

function input(places: EnrichedPlace[]): BuildPlaceSqlInput {
  return {
    activeSourceBindingName: 'new',
    activeHistoryBindingName: 'history',
    sourceBindingNames: ['old', 'new'],
    datasetId: 'dataset',
    message: {
      sourceVersion: '2026-09-01.0',
      releaseId: 'release-new',
    } as BuildPlaceSqlInput['message'],
    snapshots: {
      snapshotId: 'snapshot',
      addressSnapshotId: 'address',
      divisionSnapshotId: 'division',
    },
    places,
    historyRows: [],
  }
}

function database() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE overturePlaces (
    sourceRecordId TEXT, versionHash TEXT, releaseId TEXT, validFromRelease TEXT,
    validToRelease TEXT, isCurrent INTEGER, createdAt TEXT, updatedAt TEXT,
    sources TEXT, rawProperties TEXT, version INTEGER,
    PRIMARY KEY (sourceRecordId, versionHash));`)
  return db
}

function seed(db: Database, id: string, hash = 'same', current = 1) {
  db.query('INSERT INTO overturePlaces VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    id,
    hash,
    'release-old',
    '2025-01-01.0',
    current ? null : '2025-02-01.0',
    current,
    'original',
    'original',
    '[]',
    '{"retained":true}',
    1,
  )
}

test('source mirror lookup reads current publisher hashes and rejects ambiguous current assertions', async () => {
  const db = database()
  try {
    seed(db, 'current', 'publisher-hash')
    seed(db, 'historic', 'old-hash', 0)
    const targets = [
      { bindingName: 'source', db: drizzle({ client: db }) },
    ] as unknown as Parameters<typeof loadCurrentPlaceSources>[0]
    expect(await loadCurrentPlaceSources(targets)).toEqual(
      new Map([['current', { bindingName: 'source', versionHash: 'publisher-hash' }]]),
    )
    seed(db, 'current', 'duplicate-hash')
    await expect(loadCurrentPlaceSources(targets)).rejects.toThrow(
      'Multiple current Places source assertions',
    )
  } finally {
    db.close()
  }
})

test('source deltas preserve unchanged assertions across shards, close changes and removals, and replay', async () => {
  const old = database(),
    active = database()
  try {
    seed(active, "unchanged'quoted")
    seed(old, 'rollover')
    seed(old, 'changed', 'before')
    seed(old, 'removed')
    old
      .query('UPDATE overturePlaces SET releaseId = ? WHERE sourceRecordId = ?')
      .run('release-new', 'removed')
    seed(active, 'returning', 'same', 0)
    const data = input([
      place("unchanged'quoted"),
      place('changed', 'after'),
      place('new'),
      place('returning'),
      place('rollover'),
    ])
    data.sourceRows = new Map([
      ["unchanged'quoted", { bindingName: 'new', versionHash: 'same' }],
      ['rollover', { bindingName: 'old', versionHash: 'same' }],
      ['changed', { bindingName: 'old', versionHash: 'before' }],
      ['removed', { bindingName: 'old', versionHash: 'same' }],
    ])
    const sql = await buildPlaceSql(data, { timestamp: 'now' })
    expect(sql.sourceSqlByBinding.get('old')?.join('')).not.toContain('rawProperties')
    for (let replay = 0; replay < 2; replay++) {
      for (const [binding, statements] of sql.sourceSqlByBinding) {
        ;(binding === 'old' ? old : active).exec(statements.join(''))
      }
      expect(
        active
          .query(
            'SELECT releaseId, validFromRelease, createdAt, rawProperties, isCurrent FROM overturePlaces WHERE sourceRecordId = ?',
          )
          .get("unchanged'quoted"),
      ).toEqual({
        releaseId: 'release-new',
        validFromRelease: '2025-01-01.0',
        createdAt: 'original',
        rawProperties: '{"retained":true}',
        isCurrent: 1,
      })
      expect(
        old
          .query(
            'SELECT COUNT(*) AS count FROM overturePlaces WHERE isCurrent = 0 AND validToRelease = ?',
          )
          .get('2026-09-01.0'),
      ).toEqual({ count: 3 })
      expect(
        active
          .query(
            'SELECT COUNT(*) AS count FROM overturePlaces WHERE isCurrent = 1 AND validToRelease IS NULL',
          )
          .get(),
      ).toEqual({ count: 5 })
    }
  } finally {
    old.close()
    active.close()
  }
})

test('unchanged source SQL is compact and bounded', async () => {
  const data = input(Array.from({ length: 250 }, (_, i) => place(`place-${i}`)))
  const full = await buildPlaceSql(data, { timestamp: 'now' })
  data.sourceRows = new Map(
    data.places.map(row => [row.place.id, { bindingName: 'new', versionHash: 'same' }]),
  )
  const delta = await buildPlaceSql(data, { timestamp: 'now' })
  const statements = delta.sourceSqlByBinding.get('new') ?? []
  expect(statements.filter(sql => sql.includes(' IN ('))).toHaveLength(3)
  const bytes = (groups: Map<string, string[]>) =>
    Buffer.byteLength([...groups.values()].flat().join(''))
  expect(bytes(delta.sourceSqlByBinding)).toBeLessThan(
    bytes(full.sourceSqlByBinding) / 10,
  )
  expect(delta.currentSql).toEqual(full.currentSql)
})

test('streamed source finalisation runs after all chunks even without removed history and for empty releases', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'place-source-delta-'))
  const db = database()
  try {
    const data = input(Array.from({ length: 513 }, (_, i) => place(`place-${i}`)))
    data.sourceBindingNames = ['new']
    data.sourceRows = new Map(
      data.places.map(row => [
        row.place.id,
        { bindingName: 'new', versionHash: 'same' },
      ]),
    )
    for (const row of data.places) seed(db, row.place.id)
    seed(db, 'source-only-removal')
    const path = join(directory, 'places.jsonl')
    await Bun.write(path, data.places.map(row => JSON.stringify(row)).join('\n'))
    let batches = 0
    for await (const sql of buildPlaceSqlBatches(data, path, 'now')) {
      db.exec((sql.sourceSqlByBinding.get('new') ?? []).join(''))
      batches++
      if (batches === 1)
        expect(
          db
            .query('SELECT isCurrent FROM overturePlaces WHERE sourceRecordId = ?')
            .get('place-512'),
        ).toEqual({ isCurrent: 1 })
    }
    expect(batches).toBe(3)
    expect(
      db
        .query('SELECT COUNT(*) AS count FROM overturePlaces WHERE isCurrent = 1')
        .get(),
    ).toEqual({ count: 513 })
    await Bun.write(path, '')
    data.message = { ...data.message, releaseId: 'empty-release' }
    for await (const sql of buildPlaceSqlBatches(data, path, 'later'))
      db.exec((sql.sourceSqlByBinding.get('new') ?? []).join(''))
    expect(
      db
        .query('SELECT COUNT(*) AS count FROM overturePlaces WHERE isCurrent = 1')
        .get(),
    ).toEqual({ count: 0 })
  } finally {
    db.close()
    await rm(directory, { recursive: true, force: true })
  }
})
