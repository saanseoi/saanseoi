import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import type { Database } from 'bun:sqlite'
import type { UploadTarget } from '../../cli/options'
import {
  buildSourceReleaseAssetObjectKey,
  uploadManagedSourceAsset,
} from '../../sources/sourceAssets'

/** Snapshot placement and ingestion times are not publisher record content. */
export function curatedContentRows(rows: Record<string, unknown>[]) {
  return rows
    .map(({ snapshotId: _, createdAt: __, updatedAt: ___, ...row }) => row)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

export async function prepareCuratedReleaseAsset(input: {
  directory: string
  datasetCode: string
  releaseCode: string
  resourceType: 'division' | 'divisionArea'
  sourceVersion: string
  provenance: Record<string, unknown>
  rows: Record<string, unknown>[]
  names?: Record<string, unknown>[]
}) {
  const records = {
    rows: curatedContentRows(input.rows),
    ...(input.names ? { names: curatedContentRows(input.names) } : {}),
  }
  const manifest = {
    schemaVersion: 1,
    datasetCode: input.datasetCode,
    releaseCode: input.releaseCode,
    resourceType: input.resourceType,
    sourceVersion: input.sourceVersion,
    provenance: input.provenance,
  }
  const bytes = zipSync(
    {
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'records.json': strToU8(JSON.stringify(records)),
    },
    { level: 6, mtime: new Date('1980-01-01T00:00:00Z') },
  )
  const contentHash = createHash('sha256').update(bytes).digest('hex')
  const fileName = `${input.releaseCode}.zip`
  const filePath = resolve(input.directory, fileName)
  await writeFile(filePath, bytes)
  const assetKey = buildSourceReleaseAssetObjectKey({
    datasetCode: input.datasetCode,
    publisherCode: 'saanseoi',
    releaseCode: input.releaseCode,
    sha256: contentHash,
    fileName,
  })
  return { filePath, fileName, assetKey, contentHash, manifest }
}

export async function uploadCuratedReleaseAsset(
  target: UploadTarget,
  asset: Awaited<ReturnType<typeof prepareCuratedReleaseAsset>>,
  release: {
    datasetId: string
    resourceReleaseId: string
    existingObjectKeys: (string | null)[]
  },
  upload = uploadManagedSourceAsset,
) {
  if (release.existingObjectKeys.some(key => key && key !== asset.assetKey))
    throw new Error(
      'Curated release asset differs from its retained edition; create a new release version.',
    )
  await upload(target, {
    fileName: asset.fileName,
    filePath: asset.filePath,
    metadata: {
      assetKey: asset.assetKey,
      contentHash: asset.contentHash,
      datasetId: release.datasetId,
      resourceReleaseId: release.resourceReleaseId,
      mediaType: 'application/zip',
      role: 'sourceArchive',
      retrievedAt: new Date().toISOString(),
      manifest: asset.manifest,
    },
  })
  return asset.assetKey
}

export function linkCuratedReleaseAsset(
  db: Database,
  input: {
    sourceReleaseId: string
    resourceReleaseId: string
    assetKey: string
    fileName: string
  },
) {
  db.transaction(() => {
    const targets = [
      ['sourceReleases', input.sourceReleaseId],
      ['resourceReleases', input.resourceReleaseId],
    ] as const
    for (const [table, id] of targets) {
      const row = db.query(`SELECT rawObjectKey FROM ${table} WHERE id=?`).get(id) as {
        rawObjectKey: string | null
      } | null
      if (!row || (row.rawObjectKey !== null && row.rawObjectKey !== input.assetKey))
        throw new Error('Curated release changed while retaining its asset.')
    }
    for (const [table, id] of targets)
      db.query(`UPDATE ${table} SET rawObjectKey=?, originalFileName=? WHERE id=?`).run(
        input.assetKey,
        input.fileName,
        id,
      )
  }).immediate()
}
