import { serveDivisionMirror } from './mirror'
import { serveStreetMock } from './streetsMock'
import { serveExportManifest } from './response'
import { serveBuildingAlpha } from './buildings'
import type { HarbourReadableDb } from '../lib/db/types'
import { exportPrefix, type ExportManifest, type ExportSelection } from './contracts'
import { listExportReleases } from './retention'
import type { ExportHttpContext } from './httpContext'
type CanonicalExportContext = ExportHttpContext & {
  var: { metaDb: unknown }
  header(name: string, value: string): void
}

/** Serve only retained published releases; these routes are deliberately absent from OpenAPI. */
export async function serveReleaseExport(c: CanonicalExportContext): Promise<Response> {
  c.header('Cache-Control', 'no-store')
  c.header(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Range, Accept-Ranges, ETag',
  )
  const { family, version, domain, variant } = c.req.param()
  if (family === 'buildings') return serveBuildingAlpha(c)
  const canonicalVersion = family === 'divisions' && version === 'v1' ? 'v0.2' : version
  const supported =
    (family === 'divisions' &&
      canonicalVersion === 'v0.2' &&
      domain === 'geographic') ||
    (family === 'streets' && canonicalVersion === 'v0.1' && domain === 'physical')
  if (!supported || variant !== 'saanseoi')
    return c.json({ error: 'export_not_found' }, 404)
  const region = c.req.query('region') ?? 'hk'
  if (region !== 'hk') return c.json({ error: 'export_not_found' }, 404)
  const selection: ExportSelection = {
    family: family === 'divisions' ? 'divisions' : 'streets',
    apiVersion: `api-${family}-${canonicalVersion}`,
    region,
    domain,
    apiReleaseSetId: '',
    snapshots: [],
  }
  const releases = await listExportReleases(
    c.var.metaDb as unknown as HarbourReadableDb,
    selection,
  )
  if (family === 'streets' && releases.length === 0) return serveStreetMock(c)
  if (family === 'divisions' && releases.length === 0) return serveDivisionMirror(c)
  const requested = c.req.query('release')
  const index = requested
    ? releases.findIndex(row => row.id === requested || row.code === requested)
    : 0
  if (index < 0) return c.json({ error: 'export_release_not_found' }, 404)
  if (index > 1)
    return c.json(
      {
        error: 'export_expired',
        message:
          'Only the latest release and its predecessor are hosted. Use the historical API or a retained local copy.',
      },
      410,
    )
  const release = releases[index]
  if (!release) return c.json({ error: 'export_not_ready' }, 503)
  selection.apiReleaseSetId = release.id
  const prefix = exportPrefix(selection)
  const object = await c.env.R2_ASSETS.get(`${prefix}manifest.json`)
  if (!object) return c.json({ error: 'export_not_ready' }, 503)
  const manifest = await object.json<ExportManifest>()
  return serveExportManifest(c, manifest, prefix, release.id)
}
