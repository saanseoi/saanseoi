import { expect, test } from 'bun:test'
import { resolveSharedRemoteDbCacheDir } from '../dbCache/localDbCacheTargets.ts'
import type { SqlDeliveryPlan } from '../pipeline/local/sqlDeliveryTypes.ts'
import { resumeAddressInitialisation } from './resumeAddressInitialisation.ts'

const target = { remote: true, environment: 'preview' } as const

function fixture() {
  const events: string[] = []
  let pending = true
  const plan: SqlDeliveryPlan = {
    version: 1,
    id: 'plan',
    batches: [],
    preparedAt: '',
    generationMs: 0,
    mirrorPreparationMs: 0,
    context: {
      releaseId: 'release',
      environment: 'preview',
      phase: 'address-data',
      cacheDir: resolveSharedRemoteDbCacheDir(target),
      cachePreparedAt: '',
      inputs: {
        message: {
          releaseId: 'release',
          releaseCode: 'code',
          datasetId: 'dataset',
          datasetCode: 'ds-hk-hkgov-dpo-address',
          rawObjectKey: 'raw',
          sourceVersion: '2024-07-31.0',
          cohortKey: '2024-07-31.0',
          regionCode: 'hk',
          totalRows: 10,
        },
      },
    },
  }
  const dependencies: NonNullable<Parameters<typeof resumeAddressInitialisation>[1]> = {
    readPendingSqlDelivery: async () =>
      pending ? { releaseId: 'release', directories: ['first', 'second'] } : null,
    readDeliveryPlan: async () => plan,
    runSqlDeliveryCommand: async args => {
      events.push(String(args.options.plan))
    },
    processLocalAddressSqlUpload: async (
      _target,
      preview,
      _message,
      prepared,
      options,
    ) => {
      events.push('finish release')
      expect(preview.sourceVersion).toBe('2024-07-31.0')
      expect(prepared.filePath).toEndWith('hkgov-hk-2024-07-31.0-address.parquet')
      expect(options?.deferApiReleaseSet).toBe(true)
      pending = false
      return {} as Awaited<
        ReturnType<NonNullable<typeof dependencies.processLocalAddressSqlUpload>>
      >
    },
    assertSqlDeliveryPlanningAllowed: async () => {
      expect(pending).toBe(false)
      events.push('ready')
    },
  }
  return {
    events,
    plan,
    dependencies,
    clear: () => {
      pending = false
    },
  }
}

test('recovers all retained plans and finishes their owner before allowing planning', async () => {
  const f = fixture()
  await resumeAddressInitialisation(target, f.dependencies)
  expect(f.events).toEqual(['first', 'second', 'finish release', 'ready'])
})

test('does not reprocess a release whose recovery already released ownership', async () => {
  const f = fixture()
  f.dependencies.runSqlDeliveryCommand = async () => {
    f.clear()
  }
  await resumeAddressInitialisation(target, f.dependencies)
  expect(f.events).toEqual(['ready'])
})

test('rejects an unrelated retained release before replaying SQL', async () => {
  const f = fixture()
  f.plan.context.inputs.message = { datasetCode: 'other' }
  await expect(resumeAddressInitialisation(target, f.dependencies)).rejects.toThrow(
    'not an official-address release',
  )
  expect(f.events).toEqual([])
})

test('a failed replay prevents release processing and later planning', async () => {
  const f = fixture()
  f.dependencies.runSqlDeliveryCommand = async () => {
    throw new Error('replay failed')
  }
  await expect(resumeAddressInitialisation(target, f.dependencies)).rejects.toThrow(
    'replay failed',
  )
  expect(f.events).toEqual([])
})

test('no pending delivery needs no recovery', async () => {
  const f = fixture()
  f.clear()
  await resumeAddressInitialisation(target, f.dependencies)
  expect(f.events).toEqual([])
})

test('accepts the matching Address3D plan without a duplicated pipeline message', async () => {
  const f = fixture()
  const threeDimensional = {
    ...f.plan,
    context: {
      ...f.plan.context,
      phase: 'address3d-data',
      inputs: { sourceVersion: '2024-07-31.0' },
    },
  }
  f.dependencies.readDeliveryPlan = async directory =>
    directory === 'first' ? f.plan : threeDimensional
  await resumeAddressInitialisation(target, f.dependencies)
  expect(f.events).toEqual(['first', 'second', 'finish release', 'ready'])
})
