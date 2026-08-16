import { brotliCompressSync, brotliDecompressSync } from 'node:zlib'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'

import {
  assertBinaryGeometryRow,
  geometrySha256,
  reassembleHexChunks,
  rejectReplacementCharacter,
  type BinaryGeometryRow,
} from './binaryGeometryMirror.ts'

function compressedCsndFixture() {
  // This fixture is deliberately non-UTF-8 after Brotli compression. Its SQL
  // export failure mode is U+FFFD replacement, not an invalid JSON source.
  const value = Buffer.from(
    brotliCompressSync(
      JSON.stringify({
        coordinates: [
          [114.173, 22.281],
          [114.174, 22.282],
        ],
        district: '中西區',
        source: 'C&SD 2016',
        type: 'LineString',
      }),
    ),
  )
  expect([...value].some(byte => byte > 0x7f)).toBe(true)
  expect(value.toString('utf8')).toContain('\uFFFD')
  return value
}

describe('binary geometry cache mirror', () => {
  test('reassembles arbitrary ASCII hex chunks byte-exactly', () => {
    const source = Buffer.from([0, 0x7f, 0x80, 0xff, 1, 2, 3])
    expect(reassembleHexChunks(['007f80', 'ff010203'])).toEqual(source)
  })

  test('rejects the SQL-export UTF-8 replacement corruption signature', () => {
    expect(() =>
      rejectReplacementCharacter(compressedCsndFixture().toString('utf8')),
    ).toThrow('U+FFFD')
  })

  test('mirrors the C&SD Brotli fixture as a BLOB with its exact digest', () => {
    const source = compressedCsndFixture()
    const reconstructed = reassembleHexChunks(
      source.toString('hex').match(/.{1,20}/g) ?? [],
    )
    const db = new Database(':memory:')
    try {
      db.exec('CREATE TABLE divisionAreas (id TEXT PRIMARY KEY, geometry TEXT);')
      db.query('INSERT INTO divisionAreas (id, geometry) VALUES (?, ?)').run(
        'csnd-2016-central-western',
        reconstructed,
      )
      const mirrored = db
        .query(
          'SELECT typeof(geometry) AS type, length(geometry) AS length, hex(geometry) AS hex FROM divisionAreas WHERE id = ?',
        )
        .get('csnd-2016-central-western') as {
        hex: string
        length: number
        type: string
      }

      expect(mirrored.type).toBe('blob')
      expect(mirrored.length).toBe(source.byteLength)
      expect(geometrySha256(Buffer.from(mirrored.hex, 'hex'))).toBe(
        geometrySha256(source),
      )
      expect(
        JSON.parse(brotliDecompressSync(reconstructed).toString('utf8')),
      ).toMatchObject({
        district: '中西區',
        source: 'C&SD 2016',
      })
    } finally {
      db.close()
    }
  })

  test('the cache-worker binary mirror adapter retains a BLOB through its file payload', async () => {
    const source = compressedCsndFixture()
    const root = await mkdtemp(join(tmpdir(), 'saanseoi-binary-mirror-'))
    const rowsPath = join(root, 'rows.json')
    const dumpPath = join(root, 'schema.sql')
    const destinationPath = join(root, 'cache.sqlite')
    const payloadPath = join(root, 'payload.json')
    try {
      await writeFile(
        rowsPath,
        JSON.stringify([
          {
            binaryColumn: 'geometry',
            geometry: source.toString('hex'),
            geometryDigest: geometrySha256(source),
            geometryLength: source.byteLength,
            geometryType: 'blob',
            recordId: 'csnd-2016-central-western',
            snapshotId: 'snapshot-csnd-2016',
            values: { geometry: null, id: 'csnd-2016-central-western' },
          },
        ]),
      )
      await writeFile(
        dumpPath,
        'CREATE TABLE divisionAreas (id TEXT PRIMARY KEY, geometry TEXT);',
      )
      await writeFile(
        payloadPath,
        JSON.stringify({
          binaryTableImports: [
            { binaryRowsPath: rowsPath, tableName: 'divisionAreas' },
          ],
          destinationPath,
          dumpPaths: [dumpPath],
          type: 'import-dumps',
        }),
      )
      const workerPath = join(import.meta.dir, 'sqliteCacheWorker.ts')
      const workerProcess = Bun.spawn([process.execPath, workerPath, payloadPath], {
        stderr: 'pipe',
        stdout: 'pipe',
      })
      const [stderr, exitCode] = await Promise.all([
        new Response(workerProcess.stderr).text(),
        workerProcess.exited,
      ])
      expect(exitCode).toBe(0)
      expect(stderr).toBe('')

      const db = new Database(destinationPath, { readonly: true })
      try {
        const mirrored = db
          .query(
            'SELECT typeof(geometry) AS type, length(geometry) AS length, hex(geometry) AS hex FROM divisionAreas',
          )
          .get() as { hex: string; length: number; type: string }
        expect(mirrored.type).toBe('blob')
        expect(mirrored.length).toBe(source.byteLength)
        expect(geometrySha256(Buffer.from(mirrored.hex, 'hex'))).toBe(
          geometrySha256(source),
        )
      } finally {
        db.close()
      }
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  test('cache validation blocks a deliberately modified byte', () => {
    const source = compressedCsndFixture()
    const modified = Buffer.from(source)
    modified[0] = (modified[0] ?? 0) ^ 1
    const row: BinaryGeometryRow = {
      binaryColumn: 'geometry',
      geometry: modified,
      geometryDigest: geometrySha256(source),
      geometryLength: source.byteLength,
      geometryType: 'blob',
      recordId: 'csnd-2016-central-western',
      snapshotId: 'snapshot-csnd-2016',
      values: { geometry: null, id: 'csnd-2016-central-western' },
    }
    expect(() => assertBinaryGeometryRow(row)).toThrow('digest mismatch')
  })

  test('retains ordinary text JSON geometry normally', () => {
    const geometry = JSON.stringify({ coordinates: [114.17, 22.28], type: 'Point' })
    const db = new Database(':memory:')
    try {
      db.exec('CREATE TABLE divisionAreas (geometry TEXT);')
      db.query('INSERT INTO divisionAreas (geometry) VALUES (?)').run(geometry)
      expect(
        db.query('SELECT typeof(geometry) AS type, geometry FROM divisionAreas').get(),
      ).toEqual({ geometry, type: 'text' })
    } finally {
      db.close()
    }
  })
})
