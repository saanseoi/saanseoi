import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { missingDivisionAreaResolver } from './division-point-area-evidence'

test('missing points use only pinned current area companions and reject conflicting releases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'point-evidence-'))
  const metaPath = join(dir, 'meta.sqlite')
  const currentPath = join(dir, 'current.sqlite')
  const meta = new Database(metaPath)
  const current = new Database(currentPath)
  let resolver: ReturnType<typeof missingDivisionAreaResolver> | undefined
  try {
    meta.exec(`CREATE TABLE apiReleaseSetSnapshots(apiReleaseSetId TEXT,snapshotId TEXT,variant TEXT,role TEXT);
      CREATE TABLE snapshots(id TEXT,snapshotLineageId TEXT NOT NULL);
      CREATE TABLE snapshotLineages(id TEXT PRIMARY KEY,resourceType TEXT);
      INSERT INTO snapshotLineages VALUES ('areas','divisionArea');
      INSERT INTO apiReleaseSetSnapshots VALUES ('release','identity','native','primary'),
        ('release','selected','native','geometry'),('release','other','unrelated','geometry');
      INSERT INTO snapshots VALUES ('selected','areas'),('other','areas');`)
    current.exec(`CREATE TABLE divisionAreas(snapshotId TEXT,divisionId TEXT,geometry TEXT);
      CREATE TABLE divisionAreaPublicationState(scopeId TEXT,snapshotId TEXT,status TEXT);
      INSERT INTO divisionAreaPublicationState VALUES ('selected-scope','selected','current'),
        ('other-scope','other','current');`)
    const polygon = (x: number) => ({
      type: 'Polygon',
      coordinates: [
        [
          [x, 0],
          [x + 2, 0],
          [x + 2, 2],
          [x, 2],
          [x, 0],
        ],
      ],
    })
    for (const [scope, x] of [
      ['selected-scope', 0],
      ['other-scope', 10],
    ] as const)
      current
        .query('INSERT INTO divisionAreas VALUES (?,?,?)')
        .run(scope, 'division', JSON.stringify(polygon(x)))
    resolver = missingDivisionAreaResolver(metaPath, currentPath)
    expect(resolver.resolve('division', ['identity'])).toEqual(polygon(0))
    expect(resolver.resolve('unknown', ['identity'])).toBeNull()
    expect(resolver.resolve('division', ['unpinned'])).toBeNull()
    meta.exec(
      "UPDATE apiReleaseSetSnapshots SET variant='native' WHERE snapshotId='other'",
    )
    expect(() => resolver!.resolve('division', ['identity'])).toThrow(
      'conflicting pinned area candidates',
    )
  } finally {
    resolver?.close()
    meta.close()
    current.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
