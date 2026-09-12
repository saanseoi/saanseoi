import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  writeAlsMembership,
  type AlsMembership,
} from '../../sources/hkgov/dpo/hkgovAlsMembership.ts'
import { fileSha256 } from './address3dImport.ts'
import {
  addressMembershipMirrorFile,
  prepareAddressMembershipBaseline,
} from './addressMembershipBaseline.ts'

test('only acknowledged predecessor membership can authorise a deletion comparison', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'address-baseline-test-'))
  const currentPath = join(directory, 'current.sqlite')
  const db = new Database(currentPath)
  try {
    const preparedFile = join(directory, 'prepared.parquet')
    await writeFile(preparedFile, 'prepared')
    await writeFile(`${preparedFile}.address3d.jsonl`, 'ledger')
    const previous: AlsMembership = {
      schemaVersion: 1,
      sourceVersion: '2025-01-01.0',
      addresses: [
        {
          id: 'a',
          level: 'building',
          parentId: null,
          en: 'Building',
          zhHant: null,
          coordinates: null,
          sourceIds: [],
          curations: [],
        },
      ],
      collections: [],
      sources: [],
      aliases: [],
    }
    const current = {
      ...previous,
      sourceVersion: '2026-01-01.0',
      preparedSha256: await fileSha256(preparedFile),
      address3dSha256: await fileSha256(`${preparedFile}.address3d.jsonl`),
    }
    await writeAlsMembership(`${preparedFile}.membership.json`, current)
    db.exec(`CREATE TABLE addressPublicationState(scopeId TEXT,snapshotId TEXT,preparedAt TEXT,publicationToken TEXT);
      CREATE TABLE address2d(snapshotId TEXT,id TEXT); CREATE TABLE address3d(snapshotId TEXT,id TEXT,address2dId TEXT,units TEXT);
      INSERT INTO addressPublicationState VALUES('scope','one','prepared','token');`)
    const input = {
      cacheDir: directory,
      currentPath,
      scopeId: 'scope',
      parentSnapshotId: 'one',
      preparedFile,
      sourceVersion: current.sourceVersion,
      reportFile: join(directory, 'report.json'),
    }
    await expect(prepareAddressMembershipBaseline(input)).rejects.toThrow(
      'acknowledged Address predecessor',
    )
    await writeAlsMembership(
      join(directory, addressMembershipMirrorFile('scope', 'one')),
      previous,
    )
    await expect(prepareAddressMembershipBaseline(input)).rejects.toThrow(
      'mirror membership is incomplete',
    )
    db.exec("INSERT INTO address2d VALUES('scope','a'),('other','unrelated')")
    expect((await prepareAddressMembershipBaseline(input)).retiredIds).toEqual([])
    db.exec("INSERT INTO address3d VALUES('scope','unexpected','a','[]')")
    await expect(prepareAddressMembershipBaseline(input)).rejects.toThrow(
      'Address3D mirror membership is incomplete',
    )
    db.exec('DELETE FROM address3d')
    await writeFile(preparedFile, 'changed after preparation')
    await expect(prepareAddressMembershipBaseline(input)).rejects.toThrow(
      'changed after membership preflight',
    )
  } finally {
    db.close()
    await rm(directory, { recursive: true, force: true })
  }
})
