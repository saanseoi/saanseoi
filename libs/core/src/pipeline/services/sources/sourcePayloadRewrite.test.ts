import { expect, test } from 'bun:test'
import { rewriteOvertureSourcePayload } from './sourcePayloadRewrite'
import { Database } from 'bun:sqlite'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('retained Overture payloads can be relocated without losing upstream values', () => {
  expect(() =>
    rewriteOvertureSourcePayload({
      sourceRecordId: 'fixture',
      rawProperties: { fixture: { code: 'overture-hk-prc-country-anchor' } },
      sources: null,
      sourceGeometry: null,
    }),
  ).toThrow('requires upstream replay')
  const input = {
    id: 'publisher',
    geometry: { type: 'Point', coordinates: [114, 22] },
    sources: [{ dataset: 'publisher' }],
    names: { primary: 'Verbatim' },
    version: 3,
  }
  const result = rewriteOvertureSourcePayload({
    sourceRecordId: input.id,
    rawProperties: input,
    sourceGeometry: null,
    sources: input.sources,
  })!
  expect({
    id: input.id,
    ...result.rawProperties,
    geometry: result.sourceGeometry,
  }).toEqual(input)
  expect(
    rewriteOvertureSourcePayload({
      sourceRecordId: input.id,
      sources: null,
      ...result,
    }),
  ).toBeNull()
  expect(
    rewriteOvertureSourcePayload({
      sourceRecordId: input.id,
      rawProperties: input,
      sourceGeometry: null,
      sources: { overture: input.sources },
    }),
  ).toEqual(result)
  expect(() =>
    rewriteOvertureSourcePayload({
      sourceRecordId: 'different',
      rawProperties: input,
      sourceGeometry: null,
      sources: input.sources,
    }),
  ).toThrow('identity mismatch')
  expect(() =>
    rewriteOvertureSourcePayload({
      sourceRecordId: input.id,
      rawProperties: input,
      sourceGeometry: null,
      sources: [{ dataset: 'different' }],
    }),
  ).toThrow('Conflicting retained sources')
})

test('rewrite command is read-only and its SQL preserves identity, history and Streets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'source-payload-rewrite-'))
  const databasePath = join(directory, 'source.sqlite')
  const output = join(directory, 'review.sql')
  const db = new Database(databasePath)
  try {
    db.exec(`CREATE TABLE overturePlaces (sourceRecordId TEXT, versionHash TEXT, rawProperties TEXT, sources TEXT, sourceGeometry TEXT, validFromRelease TEXT, validToRelease TEXT, isCurrent INTEGER);
      CREATE TABLE streetEvidence (rawProperties TEXT);
      INSERT INTO streetEvidence VALUES ('{"id":"keep","geometry":"keep"}');`)
    const publisher = {
      id: "publisher's-id",
      geometry: { type: 'Point', coordinates: [114, 22] },
      sources: [{ dataset: 'native' }],
      names: { primary: ' 原始 ' },
      version: 2,
    }
    db.query('INSERT INTO overturePlaces VALUES (?, ?, ?, ?, NULL, ?, ?, ?)').run(
      publisher.id,
      'original-hash',
      JSON.stringify(publisher),
      JSON.stringify(publisher.sources),
      'release-a',
      'release-b',
      0,
    )
    const before = db.query('SELECT * FROM overturePlaces').get() as Record<
      string,
      unknown
    >
    const child = Bun.spawn(
      [
        process.execPath,
        resolve(
          import.meta.dir,
          '../../../../../../scripts/prepare-source-payload-rewrite.ts',
        ),
        '--database',
        databasePath,
        '--output',
        output,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const stderr = await new Response(child.stderr).text()
    expect(await child.exited, stderr).toBe(0)
    expect(db.query('SELECT * FROM overturePlaces').get()).toEqual(before)
    const sql = await readFile(output, 'utf8')
    db.exec(
      `UPDATE overturePlaces SET sources = '[{"dataset":"changed-after-preparation"}]'`,
    )
    db.exec(sql)
    expect(
      (
        db.query('SELECT rawProperties FROM overturePlaces').get() as {
          rawProperties: string
        }
      ).rawProperties,
    ).toBe(before.rawProperties as string)
    db.query('UPDATE overturePlaces SET sources = ?').run(before.sources as string)
    db.exec(sql)
    db.exec(sql)
    const after = db.query('SELECT * FROM overturePlaces').get() as typeof before
    expect(after).toEqual({
      ...before,
      rawProperties: JSON.stringify({
        sources: publisher.sources,
        names: publisher.names,
        version: 2,
      }),
      sources: null,
      sourceGeometry: JSON.stringify(publisher.geometry),
    })
    expect(db.query('SELECT * FROM streetEvidence').get()).toEqual({
      rawProperties: '{"id":"keep","geometry":"keep"}',
    })
    const report = JSON.parse(await readFile(`${output}.json`, 'utf8'))
    expect(report.rewrittenRows).toBe(1)
    expect(report.rawBytesAfter).toBeLessThan(report.rawBytesBefore)
  } finally {
    db.close()
    await rm(directory, { recursive: true, force: true })
  }
})
