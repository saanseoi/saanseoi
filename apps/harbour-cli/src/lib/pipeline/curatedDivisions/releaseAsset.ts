import { curatedRecordSources } from '@repo/core/pipeline/services/sources/curatedRecordSources'
import {
  assertInternalSourcePins,
  assertInternalSourceReferences,
} from '@repo/core/pipeline/services/sources/internalSourceReferences'
import { divisionIdentifiers } from '@repo/core/pipeline/services/sources/divisionIdentifiers.ts'
import { camelCaseJson } from '@repo/core/jsonKeys'
import { curatedNameObject } from './recordContract'
import { stableJsonStringify } from '@repo/core/pipeline/utils'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { buildSourceReleaseAssetObjectKey } from '../../sources/sourceAssets'

/** Snapshot placement and ingestion times are not publisher record content. */
export function curatedContentRows(rows: Record<string, unknown>[]) {
  return rows
    .map(
      ({
        snapshotId: _,
        createdAt: __,
        updatedAt: ___,
        versionHash: _hash,
        sourceReleaseId: _source,
        validFromRelease: _from,
        validToRelease: _to,
        isCurrent: _current,
        ...row
      }) => row,
    )
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

export async function prepareCuratedReleaseAsset(input: {
  directory: string
  datasetCode: string
  releaseCode: string
  resourceType: 'division' | 'divisionArea'
  sourceVersion: string
  sourceReleases?: import('./archiveInput').CuratedSourceRelease[]
  provenance: Record<string, unknown>
  rows: Record<string, unknown>[]
  names?: Record<string, unknown>[]
}) {
  const names = new Map<string, Record<string, unknown>>()
  for (const { divisionId, locale, ...value } of curatedContentRows(
    input.names ?? [],
  )) {
    const key = String(divisionId)
    const localisations = names.get(key) ?? {}
    if (Object.hasOwn(localisations, String(locale)))
      throw new Error(`Duplicate archive locale: ${key}/${locale}`)
    localisations[String(locale)] = curatedNameObject(value)
    names.set(key, localisations)
  }
  const rows = curatedContentRows(input.rows).map(row =>
    Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => input.resourceType !== 'division' || key !== 'bbox')
        .map(([key, value]) => [
          key,
          [
            'geometry',
            'bbox',
            'hierarchies',
            'identifiers',
            'sources',
            'cartography',
          ].includes(key) && typeof value === 'string'
            ? JSON.parse(value)
            : value,
        ]),
    ),
  )
  for (const row of rows) {
    row.sources = curatedRecordSources(row.sources, String(row.id))
    if (input.resourceType === 'divisionArea') {
      for (const field of ['isLand', 'isTerritorial']) {
        const value = row[field]
        if (value === 0 || value === 1) row[field] = value === 1
        else if (value != null && typeof value !== 'boolean')
          throw new Error(`Curated area ${row.id} requires boolean ${field}.`)
      }
    }
    if ('identifiers' in row) row.identifiers = divisionIdentifiers(row.identifiers)
  }
  const ids = new Set(rows.map(row => String(row.id)))
  for (const id of names.keys())
    if (!ids.has(id)) throw new Error(`Names reference missing archive division: ${id}`)
  const records = {
    rows: rows.map(row =>
      camelCaseJson(
        input.resourceType === 'division'
          ? { ...row, names: names.get(String(row.id)) ?? {} }
          : row,
      ),
    ),
  }
  assertInternalSourcePins(input.sourceReleases ?? [])
  for (const row of records.rows)
    assertInternalSourceReferences(row, {
      datasetCode: input.datasetCode,
      sourceReleases: input.sourceReleases ?? [],
    })
  const manifest = {
    schemaVersion: 1,
    datasetCode: input.datasetCode,
    releaseCode: input.releaseCode,
    resourceType: input.resourceType,
    sourceVersion: input.sourceVersion,
    sourceReleases: input.sourceReleases ?? [],
    provenance: input.provenance,
  }
  const bytes = zipSync(
    {
      'manifest.json': strToU8(stableJsonStringify(manifest)!),
      'records.json': strToU8(stableJsonStringify(records)!),
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
