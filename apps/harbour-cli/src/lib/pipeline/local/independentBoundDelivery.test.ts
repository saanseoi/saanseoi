import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { captureIndependentBoundDelivery } from './independentBoundDelivery.ts'
import { readBoundDeliveryStatements } from './sqlDeliveryFiles.ts'
import { prepareNativeSqlDelivery, runNativeSqlDelivery } from './nativeSqlDelivery.ts'

test('native independent targets combine 260 collections into six batches and resume in target order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-bound-groups-'))
  const files = {
    DB_CURRENT: join(root, 'current.sqlite'),
    DB_HISTORY: join(root, 'history.sqlite'),
  }
  const clients = Object.values(files).map(path => new Database(path))
  const directory = join(root, 'delivery')
  try {
    for (const db of clients) db.exec('CREATE TABLE events(n INTEGER)')
    const input = {
      directory,
      ownershipDirectory: root,
      files,
      releaseId: 'grouped',
      phase: 'address3d-data',
      inputs: { independentBoundTargets: true },
    }
    const plan = await prepareNativeSqlDelivery({
      ...input,
      generate: async append => {
        for (let n = 0; n < 130; n++) {
          for (const name of Object.keys(files)) {
            await append(
              { bindingName: name, databaseId: name },
              Buffer.from(
                JSON.stringify([{ sql: 'INSERT INTO events VALUES (?)', params: [n] }]),
              ),
              'bound',
            )
          }
        }
        return { collections: 260 }
      },
    })
    expect(plan.batches).toHaveLength(6)
    expect(plan.outputs).toEqual({ collections: 260 })
    await expect(
      runNativeSqlDelivery(directory, {
        files,
        onProgress: () => {
          throw new Error('interrupted after commit')
        },
      }),
    ).rejects.toThrow('interrupted after commit')
    expect(
      (
        await prepareNativeSqlDelivery({
          ...input,
          generate: async () => {
            throw new Error('must not regenerate')
          },
        })
      ).id,
    ).toBe(plan.id)
    await runNativeSqlDelivery(directory, { files })
    for (const db of clients)
      expect(db.query('SELECT n FROM events ORDER BY rowid').all()).toEqual(
        Array.from({ length: 130 }, (_, n) => ({ n })),
      )
  } finally {
    for (const db of clients) db.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('ordinary SQL is a grouping barrier and oversized atomic collections are not split', async () => {
  const batches: Array<{ target: string; count: number; kind: string }> = []
  await captureIndependentBoundDelivery(
    async (target, bytes, kind) => {
      batches.push({
        target: target.databaseId,
        kind: kind ?? 'sql',
        count: kind === 'bound' ? readBoundDeliveryStatements(bytes).length : 1,
      })
    },
    async append => {
      const bound = (name: string, count: number) =>
        append(
          { bindingName: name, databaseId: name },
          Buffer.from(
            JSON.stringify(
              Array.from({ length: count }, () => ({ sql: 'SELECT ?', params: [1] })),
            ),
          ),
          'bound',
        )
      await bound('a', 1)
      await bound('b', 1)
      await append({ bindingName: 'a', databaseId: 'a' }, Buffer.from('SELECT 1;'))
      await bound('a', 65)
      await bound('a', 1)
    },
  )
  expect(batches).toEqual([
    { target: 'a', kind: 'bound', count: 1 },
    { target: 'b', kind: 'bound', count: 1 },
    { target: 'a', kind: 'sql', count: 1 },
    { target: 'a', kind: 'bound', count: 65 },
    { target: 'a', kind: 'bound', count: 1 },
  ])
})
