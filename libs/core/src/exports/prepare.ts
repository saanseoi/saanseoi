import { and, eq, metaSchema } from '@repo/db'
import type { HarbourReadableDb } from '../lib/db/types'
import type { ReplayShard } from '../pipeline/db/snapshotReplay'
import {
  exportPrefix,
  supportsExports,
  type ExportFile,
  type ExportManifest,
  type ExportProjection,
  type ExportSelection,
} from './contracts'
import { exportHistoryRows, historySchema } from './history'
import {
  exportHierarchies,
  exportLocales,
  exportNames,
  mergeBounds,
} from './projections'

/** Hash the exact UTF-8 representation bytes, before HTTP content encoding. */
export async function exportHash(body: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)),
    ),
    byte => byte.toString(16).padStart(2, '0'),
  ).join('')
}

/** Retain immutable files with conditional creation and verify competing writes. */
async function retain(
  bucket: R2Bucket,
  key: string,
  body: string,
  mediaType: string,
): Promise<void> {
  const hash = await exportHash(body)
  const object = await bucket.put(key, body, {
    onlyIf: { etagDoesNotMatch: '*' },
    sha256: hash,
    httpMetadata: { contentType: mediaType, cacheControl: 'no-store' },
    customMetadata: { sha256: hash },
  })
  if (!object) {
    const existing = await bucket.head(key)
    if (
      !existing ||
      existing.customMetadata?.sha256 !== hash ||
      existing.size !== new TextEncoder().encode(body).byteLength
    )
      throw new Error(`Conflicting immutable export: ${key}`)
  }
}

/** Prepare exact canonical projections before the release's metadata transaction becomes public. */
export async function prepareReleaseExports(args: {
  metaDb: HarbourReadableDb
  shards: ReadonlyMap<string, ReplayShard>
  bucket: R2Bucket
  selection: ExportSelection
}): Promise<void> {
  const { metaDb, shards, bucket, selection } = args
  if (!supportsExports(selection)) return
  const prefix = exportPrefix(selection)
  const snapshotKey = (row: ExportSelection['snapshots'][number]) =>
    `${row.resourceType}:${row.variant}:${row.snapshotId}`
  const snapshots = [...selection.snapshots].sort((a, b) =>
    snapshotKey(a).localeCompare(snapshotKey(b)),
  )
  const existing = await bucket.get(`${prefix}manifest.json`)
  if (existing) {
    const manifest = await existing.json<ExportManifest>()
    if (
      manifest.apiReleaseSetId !== selection.apiReleaseSetId ||
      JSON.stringify(manifest.snapshots) !== JSON.stringify(snapshots)
    )
      throw new Error('Export release composition changed')
    // A retry cannot acknowledge a manifest whose files have disappeared.
    for (const projection of Object.values(manifest.projections))
      for (const file of projection.files) {
        const object = await bucket.head(file.key)
        if (
          !object ||
          object.size !== file.byteLength ||
          object.customMetadata?.sha256 !== file.sha256
        )
          throw new Error(`Missing or corrupt prepared export ${file.key}`)
      }
    return
  }
  const manifest: ExportManifest = {
    schemaVersion: 1,
    apiReleaseSetId: selection.apiReleaseSetId,
    apiVersion: selection.apiVersion,
    family: selection.family,
    domain: selection.domain,
    variant: 'saanseoi',
    region: selection.region,
    snapshots,
    locales: exportLocales,
    crs: 'OGC:CRS84',
    bboxSemantics: 'canonical-saanseoi-area',
    projections: {},
  }
  /** Upload one size-bounded chunk in both implemented representations. */
  async function flush(projection: string, rows: unknown[]): Promise<void> {
    const descriptor: ExportProjection = manifest.projections[projection] ?? {
      status: 'ready',
      recordCount: 0,
      files: [],
    }
    manifest.projections[projection] = descriptor
    if (!rows.length && descriptor.files.length) return
    const part = String(descriptor.files.length / 2).padStart(5, '0')
    for (const format of ['json', 'ndjson'] as const) {
      const body =
        format === 'json'
          ? `${JSON.stringify(rows)}\n`
          : rows.map(row => `${JSON.stringify(row)}\n`).join('')
      const sha256 = await exportHash(body)
      const mediaType = format === 'json' ? 'application/json' : 'application/x-ndjson'
      const key = `${prefix}${projection}/${part}-${sha256}.${format}`
      await retain(bucket, key, body, mediaType)
      const file: ExportFile = {
        key,
        format,
        envelope: format === 'json' ? 'array' : 'records',
        mediaType,
        recordCount: rows.length,
        byteLength: new TextEncoder().encode(body).byteLength,
        sha256,
      }
      descriptor.files.push(file)
    }
    descriptor.recordCount = (descriptor.recordCount ?? 0) + rows.length
  }
  const buffered = new Map<string, { rows: unknown[]; bytes: number }>()
  /** Small catalogues stay in one file; large projections split by byte budget, not DB batch size. */
  async function write(projection: string, rows: unknown[]): Promise<void> {
    let buffer = buffered.get(projection) ?? { rows: [], bytes: 2 }
    for (const row of rows) {
      const bytes = new TextEncoder().encode(JSON.stringify(row)).byteLength + 1
      if (buffer.rows.length && buffer.bytes + bytes > 2 * 1024 * 1024) {
        await flush(projection, buffer.rows)
        buffer = { rows: [], bytes: 2 }
      }
      buffer.rows.push(row)
      buffer.bytes += bytes
    }
    buffered.set(projection, buffer)
  }
  const names = new Map<string, Array<{ locale: string; name: string | null }>>()
  if (selection.family === 'divisions') {
    const snapshot = snapshots.find(
      row => row.resourceType === 'division' && row.variant === 'saanseoi',
    )!
    const areaSnapshot = snapshots.find(
      row => row.resourceType === 'divisionArea' && row.variant === 'saanseoi',
    )
    if (!areaSnapshot)
      throw new Error('Divisions exports require the pinned SaanSeoi area snapshot')
    for await (const rows of exportHistoryRows(
      metaDb,
      shards,
      snapshot.snapshotId,
      'divisionI18n',
      historySchema.divisionsI18n,
    ))
      for (const row of rows) {
        const values = names.get(row.divisionId) ?? []
        values.push(row)
        names.set(row.divisionId, values)
      }
    const bounds = new Map<string, number[] | null>()
    const members = new Set<string>()
    const references = new Set<string>()
    for await (const rows of exportHistoryRows(
      metaDb,
      shards,
      areaSnapshot.snapshotId,
      'divisionArea',
      historySchema.divisionAreas,
    )) {
      for (const row of rows) {
        if (!row.divisionId || row.variant !== 'saanseoi')
          throw new Error('Unexpected canonical area export member')
        bounds.set(
          row.divisionId,
          mergeBounds(bounds.get(row.divisionId) ?? null, row.bbox),
        )
      }
      await write(
        'geometry',
        rows.map(row => ({
          id: row.id,
          divisionId: row.divisionId,
          geometry: row.geometry,
          bbox: row.bbox,
          variant: row.variant,
          type: row.type,
          isLand: row.isLand,
          isTerritorial: row.isTerritorial,
        })),
      )
    }
    for await (const rows of exportHistoryRows(
      metaDb,
      shards,
      snapshot.snapshotId,
      'division',
      historySchema.divisions,
    )) {
      for (const row of rows) members.add(row.id)
      await write(
        'names',
        rows.map(row => ({
          id: row.id,
          divisionCode: row.divisionCode,
          class: row.class,
          category: row.category,
          level: row.level,
          names: exportNames(names.get(row.id) ?? []),
        })),
      )
      await write(
        'hierarchies',
        rows.map(row => {
          const hierarchies = exportHierarchies(row.hierarchies)
          for (const paths of Object.values(hierarchies))
            for (const path of paths ?? [])
              for (const ancestor of path) references.add(ancestor.id)
          return { id: row.id, hierarchies }
        }),
      )
      await write(
        'points',
        rows.map(row => ({
          id: row.id,
          geometry: row.geometry,
          bbox: bounds.get(row.id) ?? null,
        })),
      )
    }
    for (const id of [...references, ...bounds.keys()])
      if (!members.has(id)) throw new Error(`Export references missing division ${id}`)
    for (const projection of ['names', 'hierarchies', 'points', 'geometry'])
      if (!manifest.projections[projection]) await write(projection, [])
  } else {
    const snapshot = snapshots.find(
      row => row.resourceType === 'street' && row.variant === 'hkgov-landsd',
    )
    if (!snapshot)
      throw new Error('Streets exports require the primary LandsD snapshot')
    const codeRows = await metaDb
      .select({
        id: metaSchema.metaDivisionCodes.canonicalId,
        code: metaSchema.metaDivisionCodes.divisionCode,
      })
      .from(metaSchema.metaDivisionCodes)
      .where(
        and(
          eq(metaSchema.metaDivisionCodes.domainCode, 'geographic'),
          eq(metaSchema.metaDivisionCodes.divisionClass, 'district'),
        ),
      )
      .all()
    const codes = new Map(codeRows.map(row => [row.id, row.code]))
    manifest.divisionCodeRegistryHash = await exportHash(
      JSON.stringify([...codes].sort(([a], [b]) => a.localeCompare(b))),
    )
    for await (const rows of exportHistoryRows(
      metaDb,
      shards,
      snapshot.snapshotId,
      'streetI18n',
      historySchema.streetsI18n,
    ))
      for (const row of rows) {
        const values = names.get(row.streetId) ?? []
        values.push(row)
        names.set(row.streetId, values)
      }
    for await (const rows of exportHistoryRows(
      metaDb,
      shards,
      snapshot.snapshotId,
      'street',
      historySchema.streets,
    ))
      await write(
        'names',
        rows
          .filter(row => row.status === 'active')
          .map(row => ({
            id: row.id,
            names: exportNames(names.get(row.id) ?? []),
            divisionCodes: [
              ...new Set(
                (row.districtIds ?? []).map(id => {
                  const code = codes.get(id)
                  if (!code)
                    throw new Error(`Missing divisionCode for street district ${id}`)
                  return code
                }),
              ),
            ].sort(),
          })),
      )
    if (!manifest.projections.names) await write('names', [])
    for (const projection of ['points', 'geometry'])
      manifest.projections[projection] = { status: 'not_implemented', files: [] }
  }
  for (const [projection, buffer] of buffered) await flush(projection, buffer.rows)
  // The manifest is the final readiness receipt; a failed build never advertises partial files.
  await retain(
    bucket,
    `${prefix}manifest.json`,
    `${JSON.stringify(manifest)}\n`,
    'application/json',
  )
}
