import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { SnapshotReplayStep } from '../../lib/db/metaRegistry'
import type { SourceResolutions } from '@repo/db/historySchema'
import { resolveSnapshotSourceResolutions } from './sourceResolutionReplay'
import type { ReplayShard } from './snapshotReplay'

function fixture() {
  const databases: Database[] = []
  const parameters: number[] = []
  const shards = new Map<string, ReplayShard>()
  for (const bindingName of ['old', 'new']) {
    const sqlite = new Database(':memory:')
    sqlite.exec(`CREATE TABLE sourceResolutions(
      scopeId TEXT NOT NULL, snapshotId TEXT, sourceReleaseId TEXT NOT NULL,
      sourceRecordId TEXT NOT NULL, sourceVersionHash TEXT NOT NULL, resolutions TEXT NOT NULL,
      PRIMARY KEY(scopeId,sourceReleaseId,sourceRecordId,sourceVersionHash))`)
    databases.push(sqlite)
    const db = drizzle({
      client: sqlite,
      logger: {
        logQuery(_sql, params) {
          parameters.push(params.length)
        },
      },
    })
    shards.set(bindingName, { bindingName, db: db as never })
  }
  const write = (
    binding: number,
    snapshotId: string | null,
    id: string,
    hash: string,
    resolutions: SourceResolutions,
    release = `release-${snapshotId}`,
  ) => {
    databases[binding]
      ?.query('INSERT INTO sourceResolutions VALUES(?,?,?,?,?,?)')
      .run(
        snapshotId ? `snapshot:${snapshotId}` : `release:${release}`,
        snapshotId,
        release,
        id,
        hash,
        JSON.stringify(resolutions),
      )
  }
  return {
    databases,
    parameters,
    shards,
    write,
    close: () => {
      for (const database of databases) database.close()
    },
  }
}

const step = (
  snapshotId: string,
  parentSnapshotId: string | null,
  bindingName: string,
): SnapshotReplayStep => ({
  snapshotId,
  parentSnapshotId,
  shards: [{ dataShardId: bindingName, bindingName }],
})
const entities = (id: string): SourceResolutions => ({ entities: { address2d: [id] } })

test('sparse interpretations inherit, replace and retain omission evidence across shards and branches', async () => {
  const data = fixture()
  try {
    data.write(0, 'root', 'retained', 'same-hash', entities('retained-address'))
    data.write(0, 'root', 'changed', 'same-hash', entities('old-match'))
    data.write(0, 'root', 'omitted', 'old-hash', entities('retired-address'))
    data.write(1, 'next', 'changed', 'same-hash', entities('curated-match'))
    data.write(1, 'next', 'omitted', 'old-hash', {
      entities: {},
      decisions: [{ type: 'source_omission' }],
    })
    data.write(1, 'other-branch', 'retained', 'other-hash', entities('wrong-branch'))
    data.write(
      1,
      null,
      'retained',
      'statistic-hash',
      { entities: { statistic: ['observation'] } },
      'statistics',
    )
    const plan = [step('root', null, 'old'), step('next', 'root', 'new')]
    const state = await resolveSnapshotSourceResolutions(plan, data.shards)
    expect(state.size).toBe(3)
    expect(state.get('retained')?.snapshotId).toBe('root')
    expect(state.get('retained')?.shard.bindingName).toBe('old')
    expect(state.get('retained')?.resolutions).toEqual(entities('retained-address'))
    expect(state.get('changed')?.resolutions).toEqual(entities('curated-match'))
    expect(state.get('omitted')?.resolutions).toEqual({
      entities: {},
      decisions: [{ type: 'source_omission' }],
    })
    expect(Math.max(...data.parameters)).toBeLessThanOrEqual(6)
    data.write(1, 'restored', 'omitted', 'new-hash', entities('restored-address'))
    const restored = await resolveSnapshotSourceResolutions(
      [...plan, step('restored', 'next', 'new')],
      data.shards,
    )
    expect(restored.get('omitted')?.sourceVersionHash).toBe('new-hash')
    expect(restored.get('omitted')?.resolutions).toEqual(entities('restored-address'))
    const parent = await resolveSnapshotSourceResolutions(
      [step('root', null, 'old')],
      data.shards,
    )
    expect(parent.get('changed')?.resolutions).toEqual(entities('old-match'))
  } finally {
    data.close()
  }
})

test('large snapshot interpretations page with bounded scalar query parameters', async () => {
  const data = fixture()
  try {
    data.databases[0]?.transaction(() => {
      for (let index = 0; index < 1200; index++)
        data.write(0, 'root', `source-${index}`, 'hash', entities(`address-${index}`))
    })()
    const result = await resolveSnapshotSourceResolutions(
      [step('root', null, 'old')],
      data.shards,
    )
    expect(result.size).toBe(1200)
    expect(result.get('source-1199')?.resolutions).toEqual(entities('address-1199'))
    expect(data.parameters).toHaveLength(3)
    expect(Math.max(...data.parameters)).toBeLessThanOrEqual(6)
  } finally {
    data.close()
  }
})

test('replay rejects incomplete ancestry, missing shards and competing interpretations within a snapshot', async () => {
  const data = fixture()
  try {
    await expect(
      resolveSnapshotSourceResolutions([step('child', 'missing', 'old')], data.shards),
    ).rejects.toThrow('ancestry')
    await expect(
      resolveSnapshotSourceResolutions([step('root', null, 'absent')], data.shards),
    ).rejects.toThrow('unavailable')
    data.write(0, 'root', 'source', 'first-hash', entities('first'))
    data.write(1, 'root', 'source', 'second-hash', entities('second'))
    const root = step('root', null, 'old')
    root.shards.push({ dataShardId: 'new', bindingName: 'new' })
    await expect(resolveSnapshotSourceResolutions([root], data.shards)).rejects.toThrow(
      'Ambiguous',
    )
    data.databases[1]?.exec('DELETE FROM sourceResolutions')
    data.write(1, 'next', 'source', 'first-hash', {
      entities: { address2d: ['contradiction'] },
      decisions: [{ type: 'source_omission' }],
    })
    await expect(
      resolveSnapshotSourceResolutions(
        [step('root', null, 'old'), step('next', 'root', 'new')],
        data.shards,
      ),
    ).rejects.toThrow('empty entities')
  } finally {
    data.close()
  }
})
