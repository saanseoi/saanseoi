import { createHash } from 'node:crypto'
import { basename, resolve } from 'node:path'
import {
  BuildingAlphaManifestSchema,
  buildingAlphaRoot,
  type BuildingAlphaManifest,
} from '../../libs/core/src/exports/buildingsAlpha'
import { exportDevSettings } from '../../apps/release-exports/dev'

const sourceOrigin = 'https://api.saanseoi.hk'
const basePath = '/buildings/v0.1/exports/physical/overture'
const { port } = exportDevSettings(process.env)
const origin = `http://127.0.0.1:${port}`
const args = process.argv.slice(2)
if (args.length && (args.length !== 2 || args[0] !== '--directory'))
  throw Error('Usage: bun run exports:seed:local [--directory prepared-bundle]')
const directory = args[1] ? resolve(args[1]) : undefined
const vars = await Bun.file(
  resolve(import.meta.dir, '../../apps/release-exports/.dev.vars.preview'),
).text()
const encodedKey = /^EXPORT_PUBLISH_KEY=(.+)$/m.exec(vars)?.[1]
if (!encodedKey)
  throw Error(
    'Start bun run dev:exports first to create the local preparation credential',
  )
const key: string = encodedKey.startsWith('"') ? JSON.parse(encodedKey) : encodedKey
const headers = { Authorization: `Bearer ${key}` }

/** Fetch public source metadata without forwarding local credentials.
 * @param url Public immutable source URL.
 * @returns A successful source response.
 */
async function source(url: string): Promise<Response> {
  const parsed = new URL(url)
  if (
    parsed.origin !== sourceOrigin ||
    parsed.username ||
    parsed.password ||
    !parsed.pathname.startsWith(`${basePath}/`)
  )
    throw Error('Unexpected building source URL')
  const response = await fetch(parsed, { redirect: 'error' })
  if (!response.ok)
    throw Error(`Building source returned HTTP ${response.status}: ${parsed.pathname}`)
  return response
}

/** Send preparation only to the fixed local listener.
 * @param action Local preparation action.
 * @param body Validated candidate manifest or family selection.
 * @returns Parsed preparation receipt.
 */
async function post(action: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${origin}/buildings/v0.1/exports/${action}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'error',
  })
  if (!response.ok)
    throw Error(
      `Local ${action} failed: HTTP ${response.status}: ${await response.text()}`,
    )
  return response.json()
}

let manifest: BuildingAlphaManifest
const downloads = new Map<string, string>()
if (directory) {
  manifest = BuildingAlphaManifestSchema.parse(
    await Bun.file(resolve(directory, 'manifest.json')).json(),
  )
} else {
  const bundle = (await (
    await source(`${sourceOrigin}${basePath}/manifest.json`)
  ).json()) as Record<string, unknown>
  if (typeof bundle.exportReleaseId !== 'string')
    throw Error('Missing building release identity')
  const projections: Record<string, unknown> = {}
  // Pin all projections to one release even if publication advances during seeding.
  for (const name of ['names', 'points', 'addresses']) {
    const projection = (await (
      await source(
        `${sourceOrigin}${basePath}/${name}/manifest.json?release=${encodeURIComponent(bundle.exportReleaseId)}`,
      )
    ).json()) as {
      exportReleaseId: string
      recordCount: number
      files: Array<{ href: string; [key: string]: unknown }>
    }
    if (projection.exportReleaseId !== bundle.exportReleaseId)
      throw Error('Building source release mismatch')
    projections[name] = {
      status: 'ready',
      recordCount: projection.recordCount,
      files: projection.files.map(({ href, ...file }) => {
        const fileKey = `${buildingAlphaRoot}${bundle.exportReleaseId}/${name}/${basename(new URL(href).pathname)}`
        downloads.set(fileKey, href)
        return { ...file, key: fileKey }
      }),
    }
  }
  manifest = BuildingAlphaManifestSchema.parse({ ...bundle, projections })
}
if (!manifest.projections.points || !manifest.projections.addresses)
  throw Error('Building search requires names, points and addresses together')
const entries = Object.entries(manifest.projections).flatMap(
  ([projection, descriptor]) => descriptor.files.map(file => ({ projection, file })),
)
for (let offset = 0; offset < entries.length; offset += 4) {
  await Promise.all(
    entries.slice(offset, offset + 4).map(async ({ projection, file }) => {
      const bytes = directory
        ? await Bun.file(
            resolve(directory, projection, basename(file.key)),
          ).arrayBuffer()
        : await (await source(downloads.get(file.key)!)).arrayBuffer()
      if (
        bytes.byteLength !== file.byteLength ||
        createHash('sha256').update(new Uint8Array(bytes)).digest('hex') !== file.sha256
      )
        throw Error(
          `Building file integrity mismatch: ${projection}/${basename(file.key)}`,
        )
      const response = await fetch(
        `${origin}/buildings/v0.1/exports/_upload?key=${encodeURIComponent(file.key)}`,
        { method: 'PUT', headers, body: bytes, redirect: 'error' },
      )
      if (!response.ok) throw Error(`Local upload failed: HTTP ${response.status}`)
      await response.arrayBuffer()
    }),
  )
  if (offset % 40 === 0)
    console.log(
      `Building files: ${Math.min(offset + 4, entries.length)}/${entries.length}`,
    )
}
console.log('Buildings:', JSON.stringify(await post('_publish', manifest)))
console.log(
  'Streets:',
  JSON.stringify(await post('_prepare', { family: 'streets', dryRun: false })),
)
