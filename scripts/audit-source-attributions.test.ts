import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brotliCompressSync } from 'node:zlib'
import { auditSourceAttributions, sourceShape } from './audit-source-attributions'

test('census separates shared-table snapshots and retains empty columns and nested native attribution', () => {
  const directory = mkdtempSync(join(tmpdir(), 'source-census-'))
  try {
    const db = new Database(join(directory, 'current.sqlite'))
    db.exec(
      'CREATE TABLE places(snapshotId TEXT, sources TEXT); CREATE TABLE empty(sources TEXT); CREATE TABLE native(sourceReleaseId TEXT, properties BLOB)',
    )
    db.query('INSERT INTO places VALUES (?, ?)').run(
      'first',
      JSON.stringify([{ recordId: 'x' }, { dataset: 'different' }]),
    )
    db.query('INSERT INTO places VALUES (?, ?)').run('second', null)
    db.query('INSERT INTO native VALUES (?, ?)').run(
      'release',
      brotliCompressSync(JSON.stringify({ sources: [{ dataset: 'Microsoft' }] })),
    )
    db.close()
    const report = auditSourceAttributions(directory)
    const scans = report.databases[0]!.scans as Array<{
      table: string
      field: string
      groups: Array<{ scope: string; rows: number; shapes: Record<string, unknown> }>
      scanned: number
    }>
    expect(
      scans.find(scan => scan.table === 'places')?.groups.map(group => group.scope),
    ).toEqual(['first', 'second'])
    expect(
      Object.keys(scans.find(scan => scan.table === 'places')!.groups[0]!.shapes),
    ).toEqual(['[{dataset:string}|{recordId:string}]'])
    expect(scans.find(scan => scan.table === 'empty')?.scanned).toBe(0)
    expect(scans.find(scan => scan.table === 'native')?.field).toBe(
      'properties.sources',
    )
    expect(scans.find(scan => scan.table === 'native')?.groups[0]?.scope).toBe(
      'release',
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('structural signatures distinguish nullable fields and heterogeneous arrays', () => {
  expect(sourceShape([{ property: null }, { property: '/name' }])).toBe(
    '[{property:null}|{property:string}]',
  )
})

test('logical snapshot coverage includes unmaterialised snapshots and resolves physical publication scopes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'source-coverage-'))
  try {
    const db = new Database(join(directory, 'fixture.sqlite'))
    db.exec(`CREATE TABLE snapshots(id TEXT,code TEXT,status TEXT,resourceType TEXT,cohortKey TEXT,snapshotLineageId TEXT,parentSnapshotId TEXT);
      CREATE TABLE snapshotLineages(id TEXT,primaryDatasetId TEXT);
      INSERT INTO snapshotLineages VALUES('scope','dataset');
      INSERT INTO snapshots VALUES('published','release','published','place','2026','scope',NULL),('empty','future','draft','place','2027','scope','published');
      CREATE TABLE placePublicationState(scopeId TEXT,snapshotId TEXT,status TEXT);
      INSERT INTO placePublicationState VALUES('scope','published','current');
      CREATE TABLE places(snapshotId TEXT,sources TEXT);
      INSERT INTO places VALUES('scope','[]');`)
    db.close()
    const report = auditSourceAttributions(directory)
    expect(report.snapshotCoverage).toHaveLength(2)
    expect(
      report.snapshotCoverage.find(row => row.id === 'published')?.current,
    ).toHaveLength(1)
    expect(report.snapshotCoverage.find(row => row.id === 'empty')?.current).toEqual([])
    expect(report.snapshotCoverage.every(row => row.replayVerified === false)).toBe(
      true,
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
