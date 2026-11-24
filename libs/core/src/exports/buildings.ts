import {
  BuildingAlphaIndexSchema,
  BuildingAlphaManifestSchema,
  buildingAlphaRoot,
  alphaDigest,
} from './buildingsAlpha'
import type { ExportHttpContext } from './httpContext'
import { serveExportManifest } from './response'

/** Expose the export-only alpha family without registering or advertising a stable Buildings API. */
export async function serveBuildingAlpha(c: ExportHttpContext): Promise<Response> {
  const { family, version, domain, variant } = c.req.param()
  if (
    family !== 'buildings' ||
    version !== 'v0.1' ||
    domain !== 'physical' ||
    variant !== 'overture' ||
    (c.req.query('region') ?? 'hk') !== 'hk'
  )
    return c.json({ error: 'export_not_found' }, 404)
  const object = await c.env.R2_ASSETS.get(`${buildingAlphaRoot}index.json`)
  if (!object) return c.json({ error: 'export_not_ready' }, 503)
  const index = BuildingAlphaIndexSchema.parse(await object.json())
  const requested = c.req.query('release')
  const position = requested ? index.releases.findIndex(row => row.id === requested) : 0
  if (position < 0) return c.json({ error: 'export_release_not_found' }, 404)
  if (position > 1) return c.json({ error: 'export_expired', maturity: 'alpha' }, 410)
  const release = index.releases[position]
  if (!release) return c.json({ error: 'export_not_ready' }, 503)
  const prefix = `${buildingAlphaRoot}${release.id}/`
  const retained = await c.env.R2_ASSETS.get(`${prefix}manifest.json`)
  if (!retained) return c.json({ error: 'export_not_ready' }, 503)
  const bytes = await retained.arrayBuffer()
  if ((await alphaDigest(bytes)) !== release.manifestSha256)
    return c.json({ error: 'export_not_ready' }, 503)
  const manifest = BuildingAlphaManifestSchema.parse(
    JSON.parse(new TextDecoder().decode(bytes)),
  )
  if (manifest.exportReleaseId !== release.id)
    return c.json({ error: 'export_not_ready' }, 503)
  return serveExportManifest(c, manifest, prefix, release.id)
}
