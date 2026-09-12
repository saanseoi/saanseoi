import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { deliverSqlPhase, sqlDeliveryPhaseDirectory } from './sqlDeliveryPhase.ts'
import { executeSqlText } from './sqlImport.ts'
import { prepareReleaseSqlDelivery } from './releaseSqlDelivery.ts'
import { readPendingSqlDelivery } from './sqlDeliveryPending.ts'

test('native delivery phases retain workflow outputs without repeating artefact generation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'phase-outputs-'))
  const path = join(root, 'current.sqlite')
  const db = new Database(path)
  const releaseId = `phase-output-test-${crypto.randomUUID()}`
  const binding = createLocalExecBinding(db, 'DB_CURRENT')
  const context = {
    currentBinding: binding,
    state: { target: 'local', files: { DB_CURRENT: path }, dbCacheDir: root },
  } as unknown as LocalAddressDbContext
  let count = 0
  let outputsAccepted = false
  const phase = {
    context,
    releaseId,
    phase: 'division-data',
    nativeLocal: true,
    inputs: { source: 'fixed' },
    captureOutputs: () => ({ sqlArtefactCount: count }),
    validateOutputs: (outputs: Record<string, unknown> | undefined) => {
      expect(outputs).toEqual({ sqlArtefactCount: 5 })
      if (!outputsAccepted) throw new Error('Workflow outputs rejected')
    },
  }
  try {
    db.exec('CREATE TABLE counter(n); INSERT INTO counter VALUES(0)')
    const generate = async () => {
      count = 5
      await executeSqlText(
        { binding, databaseId: null, name: 'current' },
        'UPDATE counter SET n=n+1;',
        { isLocal: true },
      )
    }
    await expect(deliverSqlPhase(phase, generate)).rejects.toThrow(
      'Workflow outputs rejected',
    )
    expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 0 })
    await expect(
      deliverSqlPhase(phase, async () => {
        throw new Error('must not rebuild rejected retained plan')
      }),
    ).rejects.toThrow('Workflow outputs rejected')
    expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 0 })
    outputsAccepted = true
    const result = await deliverSqlPhase(phase, async () => {
      throw new Error('must not rebuild validated retained plan')
    })
    count = 999
    expect(result).toEqual({ sqlArtefactCount: 5 })
    expect(
      await deliverSqlPhase(phase, async () => {
        throw new Error('must not rebuild')
      }),
    ).toEqual(result)
    expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 1 })
  } finally {
    db.close()
    await rm(root, { recursive: true, force: true })
    await rm(dirname(sqlDeliveryPhaseDirectory(phase)), {
      recursive: true,
      force: true,
    })
  }
})

test('remote release preparation seals returned workflow outputs alongside SQL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'remote-phase-outputs-'))
  try {
    await writeFile(
      join(root, 'manifest.json'),
      JSON.stringify({ preparedAt: 'fixed' }),
    )
    const context = {
      state: {
        target: 'preview',
        dbCacheDir: root,
        bindings: { DB_CURRENT: { databaseId: 'remote-current' } },
      },
    } as unknown as LocalAddressDbContext
    const input = {
      directory: join(root, 'plan'),
      context,
      releaseId: 'release',
      phase: 'division-data',
      inputs: {},
    }
    await expect(
      prepareReleaseSqlDelivery({
        ...input,
        generate: async () => {
          throw new Error('generation interrupted')
        },
      }),
    ).rejects.toThrow('generation interrupted')
    expect(await readPendingSqlDelivery(root)).toBeNull()
    const plan = await prepareReleaseSqlDelivery({
      ...input,
      generate: async capture => {
        await capture({ databaseId: 'remote-current' }, Buffer.from('SELECT 1;'))
        return { sqlArtefactCount: 4 }
      },
    })
    expect(plan.outputs).toEqual({ sqlArtefactCount: 4 })
    expect(await readPendingSqlDelivery(root)).toEqual({
      releaseId: 'release',
      directories: [input.directory],
    })
    let competingGenerated = false
    await expect(
      prepareReleaseSqlDelivery({
        ...input,
        releaseId: 'competing',
        directory: join(root, 'competing'),
        generate: async () => {
          competingGenerated = true
        },
      }),
    ).rejects.toThrow('unfinished SQL delivery')
    expect(competingGenerated).toBe(false)
    expect(
      (
        await prepareReleaseSqlDelivery({
          ...input,
          generate: async () => {
            throw new Error('must not rebuild')
          },
        })
      ).outputs,
    ).toEqual(plan.outputs)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
