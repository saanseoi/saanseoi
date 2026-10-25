import type { StreetMockManifest } from './streetsMock'
import type { ExportHttpContext } from './httpContext'
import type { ExportManifest, ExportProjection } from './contracts'
import type { BuildingAlphaManifest } from './buildingsAlpha'

/** Serve exact manifest-listed bytes for either a canonical release or explicit alpha export. */
export async function serveExportManifest(
  c: ExportHttpContext,
  manifest: ExportManifest | BuildingAlphaManifest | StreetMockManifest,
  prefix: string,
  releaseId: string,
): Promise<Response> {
  const { family, version, domain, variant, projection, file } = c.req.param()
  const canonicalVersion = family === 'divisions' && version === 'v1' ? 'v0.2' : version
  const urlFor = (projectionName: string, filename: string): string => {
    const url = new URL(
      `/${family}/${canonicalVersion}/exports/${domain}/${variant}/${projectionName}/${filename}`,
      c.req.url,
    )
    url.searchParams.set('region', manifest.region)
    url.searchParams.set('release', releaseId)
    return url.href
  }
  // Both discovery responses pin every subsequent request to this exact release.
  if (!projection)
    return c.json({
      ...manifest,
      projections: Object.fromEntries(
        Object.entries(manifest.projections).map(([name, descriptor]) => [
          name,
          {
            status: descriptor.status,
            recordCount: descriptor.recordCount,
            ...(descriptor.status === 'ready'
              ? { href: urlFor(name, 'manifest.json') }
              : {}),
          },
        ]),
      ),
    })
  const projections: Record<string, ExportProjection> = manifest.projections
  const descriptor = projections[projection]
  if (!descriptor) return c.json({ error: 'export_projection_not_found' }, 404)
  if (descriptor.status === 'not_implemented')
    return c.json({ error: 'export_not_implemented', projection }, 501)
  if (file === 'manifest.json')
    return c.json({
      ...manifest,
      projection,
      projections: undefined,
      ...descriptor,
      files: descriptor.files.map(({ key, ...metadata }) => ({
        ...metadata,
        href: urlFor(projection, key.split('/').at(-1)!),
      })),
    })
  const retained = descriptor.files.find(
    entry =>
      entry.key.startsWith(`${prefix}${projection}/`) &&
      entry.key.split('/').at(-1) === file,
  )
  if (!retained) return c.json({ error: 'export_file_not_found' }, 404)
  const range = c.req.header('range')
  let byteRange: { offset: number; length: number } | undefined
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    const start = match?.[1] ?? ''
    const end = match?.[2] ?? ''
    const valid =
      match &&
      (start || end) &&
      retained.byteLength > 0 &&
      (!start ||
        (Number.isSafeInteger(Number(start)) && Number(start) < retained.byteLength)) &&
      (!end || Number.isSafeInteger(Number(end))) &&
      (start ? !end || Number(end) >= Number(start) : Number(end) > 0)
    if (!valid)
      return new Response(null, {
        status: 416,
        headers: {
          'Content-Range': `bytes */${retained.byteLength}`,
          'Cache-Control': 'no-store',
        },
      })
    const offset = start
      ? Number(start)
      : Math.max(0, retained.byteLength - Number(end))
    const last =
      start && end
        ? Math.min(Number(end), retained.byteLength - 1)
        : retained.byteLength - 1
    byteRange = { offset, length: last - offset + 1 }
  }
  const data = await c.env.R2_ASSETS.get(
    retained.key,
    byteRange ? { range: byteRange } : undefined,
  )
  if (!data) return c.json({ error: 'export_not_ready' }, 503)
  const headers = new Headers({
    'Content-Type': retained.mediaType,
    'Cache-Control': 'no-store',
    'Accept-Ranges': 'bytes',
    ETag: data.httpEtag,
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Expose-Headers':
      'Content-Length, Content-Range, Accept-Ranges, ETag',
  })
  if (byteRange) {
    headers.set(
      'Content-Range',
      `bytes ${byteRange.offset}-${byteRange.offset + byteRange.length - 1}/${data.size}`,
    )
    headers.set('Content-Length', String(byteRange.length))
  } else headers.set('Content-Length', String(data.size))
  return new Response(data.body, { status: byteRange ? 206 : 200, headers })
}
