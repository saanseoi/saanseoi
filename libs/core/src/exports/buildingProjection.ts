import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { BuildingAlphaManifest } from './buildingsAlpha'
import { alphaDigest } from './buildingsAlpha'
const label = z.record(z.string(), z.string())
const schemas = {
  names: z.object({
    id: z.string().min(1),
    name: z.string().nullable(),
    names: z
      .object({
        en: z.string().nullable(),
        'zh-Hant': z.string().nullable(),
        'zh-Hans': z.string().nullable(),
      })
      .strict(),
  }),
  points: z.object({
    id: z.string().min(1),
    coordinates: z.tuple([
      z.number().finite().min(-180).max(180),
      z.number().finite().min(-90).max(90),
    ]),
  }),
  addresses: z.object({
    id: z.string().min(1),
    addresses: z.array(
      z.object({
        id: z.string().min(1),
        snapshotId: z.string().min(1),
        display: label,
        match: z.literal('point-in-footprint'),
      }),
    ),
  }),
}
/** Verify every bounded representation before a publication pointer becomes discoverable.
 * @param bucket Candidate object store. @param manifest Pinned source inventory.
 * @param prefix Immutable release prefix. @returns Nothing if all hashes and IDs agree.
 */
export async function verifyBuildingProjections(
  bucket: R2Bucket,
  manifest: BuildingAlphaManifest,
  prefix: string,
): Promise<void> {
  const hashes: Record<string, string> = {}
  let nameIds: Set<string> | undefined
  for (const projection of ['names', 'points', 'addresses'] as const) {
    const descriptor = manifest.projections[projection]
    if (!descriptor) continue
    if (descriptor.recordCount !== manifest.source.recordCount)
      throw Error('Alpha source inventory mismatch')
    const files = descriptor.files
    if (new Set(files.map(f => f.key)).size !== files.length)
      throw Error('Duplicate alpha files')
    for (const format of ['json', 'ndjson'])
      if (
        files
          .filter(f => f.format === format)
          .reduce((n, f) => n + f.recordCount, 0) !== descriptor.recordCount
      )
        throw Error('Incomplete alpha representation')
    const ids = new Set<string>(),
      parts = new Map<string, { hash: string; formats: Set<string> }>()
    const hash = createHash('sha256').update('[')
    let previousId = ''
    for (const file of files) {
      const filePrefix = `${prefix}${projection}/`
      const expected =
        file.format === 'json'
          ? ['array', 'application/json']
          : ['records', 'application/x-ndjson']
      if (
        !file.key.startsWith(filePrefix) ||
        !new RegExp(`^\\d{5}-${file.sha256}\\.${file.format}$`).test(
          file.key.slice(filePrefix.length),
        ) ||
        file.envelope !== expected[0] ||
        file.mediaType !== expected[1]
      )
        throw Error('Invalid alpha representation key or envelope')
      const object = await bucket.get(file.key)
      if (!object || object.size !== file.byteLength)
        throw Error(`Missing alpha file: ${file.key}`)
      const bytes = await object.arrayBuffer()
      if ((await alphaDigest(bytes)) !== file.sha256)
        throw Error(`Alpha checksum mismatch: ${file.key}`)
      const text = new TextDecoder().decode(bytes)
      const raw =
        file.format === 'json'
          ? JSON.parse(text)
          : text
              .trimEnd()
              .split('\n')
              .filter(Boolean)
              .map(line => JSON.parse(line))
      const rows = z.array(schemas[projection]).parse(raw)
      if (rows.length !== file.recordCount)
        throw Error('Alpha file record count mismatch')
      if (
        file.minId !== undefined &&
        (rows[0]?.id !== file.minId || rows.at(-1)?.id !== file.maxId)
      )
        throw Error('Alpha ID range mismatch')
      if (
        manifest.source.recipe === 'overture-building-details-alpha-v2' &&
        !file.minId
      )
        throw Error('Missing alpha ID range')
      const partId = file.key.slice(filePrefix.length, filePrefix.length + 5)
      const partHash = createHash('sha256').update(JSON.stringify(rows)).digest('hex')
      const part = parts.get(partId)
      if (part && (part.hash !== partHash || part.formats.has(file.format)))
        throw Error('Alpha representations disagree')
      parts.set(partId, {
        hash: partHash,
        formats: new Set([...(part?.formats ?? []), file.format]),
      })
      if (file.format === 'json')
        for (const row of rows) {
          if (ids.has(row.id)) throw Error('Duplicate alpha building ID')
          if (previousId && row.id <= previousId)
            throw Error('Unsorted alpha building IDs')
          previousId = row.id
          if (ids.size) hash.update(',')
          ids.add(row.id)
          hash.update(JSON.stringify(row))
        }
    }
    if (
      [...parts.values()].some(part => part.formats.size !== 2) ||
      ids.size !== descriptor.recordCount
    )
      throw Error('Alpha content inventory checksum mismatch')
    const expectedIds = nameIds
    if (
      expectedIds &&
      (ids.size !== expectedIds.size || [...ids].some(id => !expectedIds.has(id)))
    )
      throw Error('Alpha projection IDs disagree')
    if (projection === 'names') nameIds = ids
    hashes[projection] = hash.update(']').digest('hex')
  }
  const complete = manifest.source.recipe === 'overture-building-details-alpha-v2'
  if (complete && (!hashes.points || !hashes.addresses || !manifest.addressSource))
    throw Error('Incomplete building detail projections')
  const contentHash = complete
    ? createHash('sha256').update(JSON.stringify(hashes)).digest('hex')
    : hashes.names
  if (contentHash !== manifest.source.contentSha256)
    throw Error('Alpha content inventory checksum mismatch')
}
