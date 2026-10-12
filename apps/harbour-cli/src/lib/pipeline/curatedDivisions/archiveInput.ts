import {
  assertInternalSourcePins,
  assertInternalSourceReferences,
} from '@repo/core/pipeline/services/sources/internalSourceReferences'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { parquetWriteFile } from 'hyparquet-writer'

export type CuratedSourceRelease = {
  datasetCode: string
  releaseCode: string
  sourceVersion: string
  resourceType: string
  snapshotId?: string
  rawObjectKey: string
  contentHash: string
  releaseNotesUrl: string | null
}
export type CuratedArchiveManifest = {
  schemaVersion: number
  datasetCode: string
  releaseCode: string
  resourceType: 'division' | 'divisionArea'
  sourceVersion: string
  sourceReleases: CuratedSourceRelease[]
  provenance: Record<string, unknown>
}
const parse = (value: unknown) =>
  typeof value === 'string' ? JSON.parse(value) : value

export function curatedArchiveRows(bytes: Uint8Array) {
  const files = unzipSync(bytes)
  if (!files['manifest.json'] || !files['records.json'])
    throw new Error('Curated archive requires manifest.json and records.json.')
  const manifest = JSON.parse(
    strFromU8(files['manifest.json']),
  ) as CuratedArchiveManifest
  if (
    manifest.schemaVersion !== 1 ||
    !['division', 'divisionArea'].includes(manifest.resourceType) ||
    manifest.datasetCode !== 'ds-hk-saanseoi-division' ||
    manifest.releaseCode !==
      `dr-hk-saanseoi-${manifest.resourceType === 'division' ? 'division' : 'division-area'}-${manifest.sourceVersion}` ||
    !Array.isArray(manifest.sourceReleases) ||
    !manifest.sourceReleases.length
  )
    throw new Error('Invalid curated archive manifest.')
  if (
    new Set(manifest.sourceReleases.map(source => source.releaseCode)).size !==
    manifest.sourceReleases.length
  )
    throw new Error('Duplicate curated source release.')
  for (const source of manifest.sourceReleases)
    if (
      !source.datasetCode ||
      !source.releaseCode ||
      !source.sourceVersion ||
      !source.resourceType ||
      (source.snapshotId !== undefined &&
        (typeof source.snapshotId !== 'string' || !source.snapshotId)) ||
      (source.datasetCode === 'ds-hk-overture-division' && !source.snapshotId) ||
      !source.rawObjectKey?.startsWith('by-source/') ||
      !/^[a-f0-9]{64}$/.test(source.contentHash)
    )
      throw new Error(
        'Curated archive inputs require retained source release identities and archives.',
      )
  assertInternalSourcePins(manifest.sourceReleases)
  const records = JSON.parse(strFromU8(files['records.json'])) as {
    rows: Record<string, any>[]
  }
  if (!Array.isArray(records.rows) || !records.rows.length)
    throw new Error('Curated archive has no records.')
  const ids = new Set<string>()
  const rows = records.rows.map(input => {
    if (typeof input.id !== 'string' || !input.id || ids.has(input.id))
      throw new Error('Curated records require unique identities.')
    ids.add(input.id)
    assertInternalSourceReferences(input, manifest)
    const row = { ...input }
    for (const key of [
      'geometry',
      ...(manifest.resourceType === 'divisionArea' ? ['bbox'] : []),
      'hierarchies',
      'identifiers',
      'sources',
      'cartography',
    ])
      row[key] = parse(row[key])
    if (manifest.resourceType === 'division') {
      if (!row.names || Array.isArray(row.names))
        throw new Error(`Missing curated names: ${row.id}`)
      return { id: row.id, source: 'saanseoi', record: JSON.stringify(input) }
    }
    if (!row.divisionId || !['Polygon', 'MultiPolygon'].includes(row.geometry?.type))
      throw new Error(`Invalid curated area: ${row.id}`)
    for (const field of ['isLand', 'isTerritorial'])
      if (row[field] != null && typeof row[field] !== 'boolean')
        throw new Error(`Curated area ${row.id} requires boolean ${field}.`)
    return {
      id: row.id,
      record: JSON.stringify({
        ...row,
        source_properties: Object.fromEntries(
          Object.entries(input).filter(([key]) => key !== 'id' && key !== 'geometry'),
        ),
        source_geometry: parse(input.geometry),
        division_id: row.divisionId,
        is_land: row.isLand ?? null,
        is_territorial: row.isTerritorial ?? null,
        class: row.type,
      }),
    }
  })
  if (manifest.resourceType === 'division') {
    const classes = new Map(records.rows.map(row => [row.id, row.class]))
    for (const row of records.rows) {
      const hierarchy = parse(row.hierarchies)
      if (!hierarchy || !Array.isArray(hierarchy.full))
        throw new Error(`Missing curated ancestry: ${row.id}`)
      for (const paths of Object.values(hierarchy) as any[]) {
        if (!Array.isArray(paths))
          throw new Error(`Invalid curated ancestry: ${row.id}`)
        for (const path of paths) {
          if (
            !Array.isArray(path) ||
            new Set(path.map((entry: any) => entry.id)).size !== path.length
          )
            throw new Error(`Invalid curated ancestry path: ${row.id}`)
          for (const parent of path)
            if (
              parent.id === row.id ||
              !ids.has(parent.id) ||
              parent.class !== classes.get(parent.id)
            )
              throw new Error(`Unknown or conflicting curated ancestor: ${parent.id}`)
        }
      }
    }
  }
  return { manifest, rows }
}

/** Only decoding differs from ordinary ingestion; retain the ZIP as the source asset. */
export async function prepareCuratedArchive(filePath: string, source?: string) {
  if (
    !filePath.endsWith('.zip') ||
    (source !== 'saanseoi' &&
      (source !== undefined ||
        !/^dr-hk-saanseoi-division(?:-area)?-/.test(basename(filePath))))
  )
    return null
  const { manifest, rows } = curatedArchiveRows(
    new Uint8Array(await readFile(filePath)),
  )
  const directory = await mkdtemp(join(tmpdir(), 'saanseoi-curated-'))
  try {
    const output = join(directory, `${manifest.releaseCode}.parquet`)
    parquetWriteFile({
      filename: output,
      columnData: [
        { name: 'id', type: 'STRING', data: rows.map(row => row.id) },
        { name: 'source', type: 'STRING', data: rows.map(() => 'saanseoi') },
        { name: 'record', type: 'STRING', data: rows.map(row => row.record) },
      ],
    })
    return {
      filePath: output,
      originalFileName: basename(filePath),
      regionCode: 'hk' as const,
      source: 'saanseoi',
      sourceVersion: manifest.sourceVersion,
      cohortKey: manifest.sourceVersion,
      datasetCode: manifest.datasetCode,
      resourceType: manifest.resourceType,
      theme: 'divisions' as const,
      preparation: manifest.provenance
        .preparation as import('./preparationAudit').PreparationEvidence,
      sourceReleases: manifest.sourceReleases,
      cleanup: () => rm(directory, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}
