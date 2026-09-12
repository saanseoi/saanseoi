import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import {
  deliverSqlPhase,
  sqlDeliveryPhaseDirectory,
} from '../local/sqlDeliveryPhase.ts'
import { executeSqlText } from '../local/sqlImport.ts'
import { readDivisionDeliveryOutputs } from './divisionDeliveryOutputs.ts'

const counts = {
  sqlArtefactCount: 2,
  deletedRows: 1,
  insertedVersions: 3,
  processedRows: 5,
  unchangedRows: 2,
  localisedRows: 4,
}

test('Division completion counts reject missing, negative and non-integral outputs', () => {
  expect(readDivisionDeliveryOutputs(counts)).toEqual(counts)
  expect(() => readDivisionDeliveryOutputs(undefined)).toThrow('missing or invalid')
  for (const key of Object.keys(counts)) {
    for (const value of [undefined, -1, 0.5, NaN, Infinity, '2']) {
      expect(() => readDivisionDeliveryOutputs({ ...counts, [key]: value })).toThrow(
        key,
      )
    }
  }
})

test('Division retry retains original counts after one target commits and another fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'division-continuation-'))
  const sourcePath = join(root, 'source.sqlite')
  const currentPath = join(root, 'current.sqlite')
  const source = new Database(sourcePath)
  const current = new Database(currentPath)
  const sourceBinding = createLocalExecBinding(source, 'DB_SOURCE')
  const currentBinding = createLocalExecBinding(current, 'DB_CURRENT')
  const phase = {
    context: {
      state: {
        target: 'local',
        dbCacheDir: root,
        files: { DB_SOURCE: sourcePath, DB_CURRENT: currentPath },
      },
    } as unknown as LocalAddressDbContext,
    releaseId: `division-continuation-${crypto.randomUUID()}`,
    phase: 'division-data',
    nativeLocal: true,
    inputs: { preparedSha256: 'fixed', snapshotId: 'fixed' },
    captureOutputs: () => ({ ...counts }),
  }
  try {
    source.exec('CREATE TABLE counter(n); INSERT INTO counter VALUES(0)')
    current.exec(
      "CREATE TABLE counter(n); INSERT INTO counter VALUES(0); CREATE TRIGGER fail BEFORE UPDATE ON counter BEGIN SELECT RAISE(ABORT, 'interrupted'); END;",
    )
    let preparations = 0
    const generate = async () => {
      preparations++
      for (const binding of [sourceBinding, currentBinding]) {
        await executeSqlText(
          {
            binding,
            databaseId: null,
            name: binding === sourceBinding ? 'source' : 'current',
          },
          'UPDATE counter SET n=n+1;',
          { isLocal: true },
        )
      }
    }
    await expect(deliverSqlPhase(phase, generate)).rejects.toThrow('interrupted')
    expect(source.query('SELECT n FROM counter').get()).toEqual({ n: 1 })
    expect(current.query('SELECT n FROM counter').get()).toEqual({ n: 0 })
    current.exec('DROP TRIGGER fail')
    const result = await deliverSqlPhase(phase, async () => {
      throw new Error('Retry must not reread the partially updated baseline')
    })
    expect(readDivisionDeliveryOutputs(result)).toEqual(counts)
    expect(preparations).toBe(1)
    expect(source.query('SELECT n FROM counter').get()).toEqual({ n: 1 })
    expect(current.query('SELECT n FROM counter').get()).toEqual({ n: 1 })
  } finally {
    source.close()
    current.close()
    await rm(root, { recursive: true, force: true })
    await rm(dirname(sqlDeliveryPhaseDirectory(phase)), {
      recursive: true,
      force: true,
    })
  }
})
