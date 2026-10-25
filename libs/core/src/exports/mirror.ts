import { createHash } from 'node:crypto'
import type { ExportManifest } from './contracts'
import type { ExportHttpContext } from './httpContext'
import { serveExportManifest } from './response'

export const mirrorRoot = 'exports/mirror/divisions/v0.2/hk/geographic/saanseoi/'
type MirrorIndex = { releases: string[] }
export type MirroredManifest = ExportManifest & {
  mirror: { sourceOrigin: 'https://api.saanseoi.hk'; purpose: 'development-seed' }
}

/** Verify every uploaded object before exposing a development-only mirror of a public release. */
export async function publishDivisionMirror(
  bucket: R2Bucket,
  manifest: MirroredManifest,
): Promise<void> {
  if (
    manifest.family !== 'divisions' ||
    manifest.domain !== 'geographic' ||
    manifest.variant !== 'saanseoi' ||
    manifest.region !== 'hk' ||
    !/^[a-f0-9-]{36}$/.test(manifest.apiReleaseSetId) ||
    manifest.mirror?.sourceOrigin !== 'https://api.saanseoi.hk' ||
    manifest.mirror.purpose !== 'development-seed'
  )
    throw Error('Invalid development mirror')
  const prefix = `${mirrorRoot}${manifest.apiReleaseSetId}/`
  for (const [name, projection] of Object.entries(manifest.projections)) {
    if (
      !['names', 'hierarchies', 'points', 'geometry'].includes(name) ||
      projection.status !== 'ready'
    )
      throw Error('Invalid mirror projection')
    for (const file of projection.files) {
      if (
        !file.key.startsWith(`${prefix}${name}/`) ||
        !new RegExp(`^\\d{5}-${file.sha256}\\.${file.format}$`).test(
          file.key.slice(`${prefix}${name}/`.length),
        )
      )
        throw Error('Invalid mirror key')
      const object = await bucket.get(file.key)
      if (
        !object ||
        object.size !== file.byteLength ||
        createHash('sha256')
          .update(new Uint8Array(await object.arrayBuffer()))
          .digest('hex') !== file.sha256
      )
        throw Error('Mirror file verification failed')
    }
  }
  await bucket.put(`${prefix}manifest.json`, JSON.stringify(manifest), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
  })
  // Deployment is serialised by CI; CAS also rejects competing manual seed operations.
  const current = await bucket.get(`${mirrorRoot}index.json`)
  const previous = current ? await current.json<MirrorIndex>() : { releases: [] }
  const releases =
    previous.releases[0] === manifest.apiReleaseSetId
      ? previous.releases
      : [
          manifest.apiReleaseSetId,
          ...previous.releases.filter(id => id !== manifest.apiReleaseSetId),
        ]
  const written = await bucket.put(
    `${mirrorRoot}index.json`,
    JSON.stringify({ releases }),
    {
      onlyIf: current ? { etagMatches: current.etag } : { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
    },
  )
  if (!written) throw Error('Concurrent mirror seed; retry')
  for (const id of releases.slice(2)) {
    let cursor: string | undefined
    do {
      const page = await bucket.list({ prefix: `${mirrorRoot}${id}/`, cursor })
      if (page.objects.length) await bucket.delete(page.objects.map(row => row.key))
      cursor = page.truncated ? page.cursor : undefined
    } while (cursor)
  }
}

/** Use a labelled public-data mirror only when this environment has no canonical releases. */
export async function serveDivisionMirror(c: ExportHttpContext): Promise<Response> {
  if (c.env.ALLOW_EXPORT_MIRRORS !== 'true')
    return c.json({ error: 'export_not_ready' }, 503)
  const object = await c.env.R2_ASSETS.get(`${mirrorRoot}index.json`)
  if (!object) return c.json({ error: 'export_not_ready' }, 503)
  const index = await object.json<MirrorIndex>()
  const release = c.req.query('release')
  const position = release ? index.releases.indexOf(release) : 0
  if (position < 0) return c.json({ error: 'export_release_not_found' }, 404)
  if (position > 1) return c.json({ error: 'export_expired' }, 410)
  const id = index.releases[position]
  const prefix = `${mirrorRoot}${id}/`
  const data = await c.env.R2_ASSETS.get(`${prefix}manifest.json`)
  if (!data) return c.json({ error: 'export_not_ready' }, 503)
  return serveExportManifest(c, await data.json<MirroredManifest>(), prefix, id!)
}
