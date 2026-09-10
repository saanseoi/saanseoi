import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import {
  captureNativePlanningCopy,
  inlineNativeParameters,
} from './nativePlanningCopy.ts'
import { prepareNativeSqlDelivery, runNativeSqlDelivery } from './nativeSqlDelivery.ts'
import { readDeliveryPlan } from './sqlDeliveryFiles.ts'

test('native parameter expansion preserves quoted question marks, blobs and embedded NULs', () => {
  const db = new Database(':memory:')
  try {
    const bytes = new Uint8Array([0, 255, 17])
    const query = inlineNativeParameters(
      `SELECT '?' AS literal, ? AS text, ? AS bytes, ? AS n /* ? */`,
      ["it's\0中?", bytes, 42],
    )
    expect(db.query(query).get()).toEqual({
      literal: '?',
      text: "it's\0中?",
      bytes,
      n: 42,
    })
    expect(() => inlineNativeParameters('SELECT ?1', [1])).toThrow('placeholder')
    expect(() => inlineNativeParameters('SELECT ?', [])).toThrow('placeholder')
    expect(() => inlineNativeParameters('SELECT 1', [1])).toThrow('count')
  } finally {
    db.close()
  }
})

test('WAL-safe planning copy retains read-after-write results without mutating the target and checksums outputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-planning-test-'))
  const path = join(root, 'data.sqlite')
  const db = new Database(path)
  const directory = join(root, 'plan')
  try {
    db.exec(
      'PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE counter(n); INSERT INTO counter VALUES(7)',
    )
    const plan = await prepareNativeSqlDelivery({
      directory,
      ownershipDirectory: root,
      releaseId: 'release',
      phase: 'data',
      inputs: {},
      files: { DB_CURRENT: path },
      generate: append =>
        captureNativePlanningCopy({
          targets: { DB_CURRENT: { path, schema: {} } },
          append,
          generate: async databases => {
            const copy = databases.DB_CURRENT
            if (!copy) throw new Error('Missing planning copy')
            expect(copy.get<{ n: number }>(sql`SELECT n FROM counter`)).toEqual({
              n: 7,
            })
            copy.run(sql`UPDATE counter SET n=n+${5}`)
            const result = copy.get(sql`SELECT n FROM counter`) as { n: number }
            expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 7 })
            return result
          },
        }),
    })
    expect(plan.outputs).toEqual({ n: 12 })
    expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 7 })
    await runNativeSqlDelivery(directory, { files: { DB_CURRENT: path } })
    await runNativeSqlDelivery(directory, { files: { DB_CURRENT: path } })
    expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 12 })
    const text = await readFile(join(directory, 'plan.json'), 'utf8')
    const tampered = JSON.parse(text)
    tampered.outputs.n = 999
    await writeFile(join(directory, 'plan.json'), JSON.stringify(tampered))
    await expect(readDeliveryPlan(directory)).rejects.toThrow('modified')
  } finally {
    db.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('failed planning discards captured writes and leaves the WAL target unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-planning-fail-'))
  const path = join(root, 'data.sqlite')
  const db = new Database(path)
  try {
    db.exec('CREATE TABLE counter(n); INSERT INTO counter VALUES(0)')
    let appended = false
    await expect(
      captureNativePlanningCopy({
        targets: { DB_CURRENT: { path, schema: {} } },
        append: async () => {
          appended = true
        },
        generate: async databases => {
          const copy = databases.DB_CURRENT
          if (!copy) throw new Error('Missing planning copy')
          copy.run(sql`UPDATE counter SET n=5`)
          throw new Error('planner failed')
        },
      }),
    ).rejects.toThrow('planner failed')
    expect(appended).toBe(false)
    expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 0 })
  } finally {
    db.close()
    await rm(root, { recursive: true, force: true })
  }
})
