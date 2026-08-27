import { expect, test } from 'bun:test'

import { linkManagedSourceAssetToRelease } from './sourceAssets'

function createLinkDb(options: {
  assetReleaseId?: string | null
  linkedReleaseStatus?: string
  linkedSourceReleaseId: string | null
  updateChanges: number
}) {
  let selectCount = 0
  const db = {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                async get() {
                  selectCount += 1
                  if (selectCount === 1) {
                    return {
                      assetId: 'asset-1',
                      releaseId: options.assetReleaseId ?? null,
                    }
                  }
                  if (selectCount === 2) return { sourceReleaseId: 'source-1' }
                  if (options.assetReleaseId && selectCount === 3) {
                    return {
                      sourceReleaseId: options.linkedSourceReleaseId,
                      status: options.linkedReleaseStatus ?? 'published',
                    }
                  }
                  if (selectCount === 3) {
                    return { releaseId: 'winning-release' }
                  }
                  return {
                    sourceReleaseId: options.linkedSourceReleaseId,
                    status: options.linkedReleaseStatus ?? 'published',
                  }
                },
              }
            },
          }
        },
      }
    },
    update() {
      return {
        set() {
          return {
            where() {
              return {
                async run() {
                  return { meta: { changes: options.updateChanges } }
                },
              }
            },
          }
        },
      }
    },
  }

  return db as never
}

test('returns existing when a concurrent link wins for the same source release', async () => {
  const result = await linkManagedSourceAssetToRelease(
    createLinkDb({ linkedSourceReleaseId: 'source-1', updateChanges: 0 }),
    { assetKey: 'by-source/hk/example/asset.bin', releaseId: 'target-release' },
  )

  expect(result).toEqual({ assetId: 'asset-1', status: 'existing' })
})

test('rejects a concurrent link that wins for a different source release', async () => {
  await expect(
    linkManagedSourceAssetToRelease(
      createLinkDb({ linkedSourceReleaseId: 'source-2', updateChanges: 0 }),
      { assetKey: 'by-source/hk/example/asset.bin', releaseId: 'target-release' },
    ),
  ).rejects.toThrow('already linked to a different source release')
})

test('relinks an immutable source asset when its previous release failed', async () => {
  const result = await linkManagedSourceAssetToRelease(
    createLinkDb({
      assetReleaseId: 'failed-release',
      linkedReleaseStatus: 'failed',
      linkedSourceReleaseId: 'failed-source',
      updateChanges: 1,
    }),
    { assetKey: 'by-source/hk/example/asset.bin', releaseId: 'target-release' },
  )

  expect(result).toEqual({ assetId: 'asset-1', status: 'linked' })
})
