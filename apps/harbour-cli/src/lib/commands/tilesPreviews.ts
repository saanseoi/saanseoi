import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { note, outro } from '@clack/prompts'
import { mapStyleIds, type MapStyleId } from '@repo/basemap'
import {
  STYLE_PREVIEW_CAMERAS,
  type PreviewMode,
  type Region,
  type StylePreviewCamera,
} from './tilesTypes.ts'
import {
  objectKey,
  purgeTilesHostCache,
  putObject,
  readRegionVersions,
  readVersionsIndex,
} from './tilesStorage.ts'
import { BROWSER_RENDER_ENDPOINT, TILES_ROOT, VIEWER_ORIGIN } from './tilesConfig.ts'

export async function renderBasemapPreviews(input: {
  region: Region
  version: string
  modes: PreviewMode[]
  dryRun: boolean
}) {
  const datedNames = input.modes.map(
    mode => `${input.region.name}-${input.version}-${mode}.webp`,
  )
  if (input.dryRun) {
    note(
      [
        `region: ${input.region.code} (${input.region.name})`,
        `version: ${input.version}`,
        ...input.modes.map(
          mode =>
            `viewer (${mode}): ${basemapRenderUrl(input.region, input.version, mode)}`,
        ),
        ...datedNames.map(name => `preview: ${objectKey(input.region.code, name)}`),
      ].join('\n'),
      'TILES RENDER DRY RUN',
    )
    return
  }

  const regionVersions = await readRegionVersions(input.region)
  if (!regionVersions.versions.some(entry => entry.version === input.version)) {
    throw new Error(
      `Cannot render ${input.region.name}-${input.version}: the release is not published.`,
    )
  }
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token) {
    throw new Error(
      'tiles:render requires CLOUDFLARE_API_TOKEN with Browser Rendering - Edit and Workers R2 Storage - Edit permissions.',
    )
  }
  await mkdir(resolve(TILES_ROOT, 'renders'), { recursive: true })
  const latestVersion = (await readVersionsIndex()).regions[input.region.code]?.latest
    ?.version

  for (const [index, mode] of input.modes.entries()) {
    const name = datedNames[index]
    if (!name) continue
    note(
      `Rendering ${input.region.description} ${input.version} (${mode}).`,
      'BASEMAP PREVIEW',
    )
    const response = await fetch(BROWSER_RENDER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: basemapRenderUrl(input.region, input.version, mode),
        viewport: { width: 1200, height: 800, deviceScaleFactor: 1 },
        gotoOptions: {
          waitUntil:
            mode === 'postcard' || mode === 'postcard-lit'
              ? 'domcontentloaded'
              : 'networkidle2',
          timeout: 60_000,
        },
        waitForSelector: { selector: '#basemap-render-ready', timeout: 120_000 },
        actionTimeout: 120_000,
        screenshotOptions: { type: 'webp', quality: 88, fullPage: false },
      }),
    })
    if (!response.ok) {
      throw new Error(
        `Cloudflare Browser Rendering failed (${response.status}): ${await response.text()}`,
      )
    }
    const path = resolve(TILES_ROOT, 'renders', name)
    await writeFile(path, new Uint8Array(await response.arrayBuffer()))
    await putObject(objectKey(input.region.code, name), path, 'image/webp')
    if (latestVersion === input.version) {
      await putObject(
        objectKey(input.region.code, `${input.region.name}-latest-${mode}.webp`),
        path,
        'image/webp',
      )
    }
  }
  await purgeTilesHostCache()
  outro(`Rendered ${input.region.name}-${input.version} basemap previews`)
}

function basemapRenderUrl(region: Region, version: string, mode: PreviewMode) {
  const url = new URL(VIEWER_ORIGIN)
  url.searchParams.set('headless', 'true')
  url.searchParams.set('region', region.code)
  url.searchParams.set('version', version)
  // Light and dark marketing modes deliberately share the midnight map style for now.
  url.searchParams.set('theme', 'midnight')
  if (mode === 'postcard' || mode === 'postcard-lit')
    url.searchParams.set('render', mode)
  // Browser Rendering retains its navigation cache between captures. Ensure a
  // refreshed artefact always evaluates the newly deployed postcard camera.
  url.searchParams.set('capture', `${mode}-${Date.now()}`)
  url.searchParams.set('locale', 'en')
  return url.toString()
}

export async function renderStyleLibraryPreviews(
  region: Region,
  version: string,
  dryRun: boolean,
) {
  const previews = mapStyleIds.flatMap(style =>
    ([16, 19] as const).map(zoom => ({ style, zoom })),
  )
  if (dryRun) {
    note(
      previews
        .map(({ style, zoom }) => {
          const camera = STYLE_PREVIEW_CAMERAS[region.code][zoom]
          const name = stylePreviewName(region, version, style, camera.landmark, zoom)
          return `${style} z${zoom}: ${basemapStylePreviewUrl(region, version, style, camera, zoom)}\npreview: ${objectKey(region.code, name)}`
        })
        .join('\n'),
      'STYLE LIBRARY PREVIEW DRY RUN',
    )
    return
  }

  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token) {
    throw new Error(
      'Style preview rendering requires CLOUDFLARE_API_TOKEN with Browser Rendering - Edit and Workers R2 Storage - Edit permissions.',
    )
  }
  await mkdir(resolve(TILES_ROOT, 'renders'), { recursive: true })
  const latestVersion = (await readVersionsIndex()).regions[region.code]?.latest
    ?.version
  for (const { style, zoom } of previews) {
    const camera = STYLE_PREVIEW_CAMERAS[region.code][zoom]
    const name = stylePreviewName(region, version, style, camera.landmark, zoom)
    const response = await fetch(BROWSER_RENDER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: basemapStylePreviewUrl(region, version, style, camera, zoom),
        viewport: { width: 512, height: 512, deviceScaleFactor: 1 },
        gotoOptions: { waitUntil: 'networkidle2', timeout: 60_000 },
        waitForSelector: { selector: '#basemap-render-ready', timeout: 120_000 },
        actionTimeout: 120_000,
        screenshotOptions: { type: 'webp', quality: 88, fullPage: false },
      }),
    })
    if (!response.ok) {
      throw new Error(
        `Cloudflare Browser Rendering failed (${response.status}): ${await response.text()}`,
      )
    }
    const path = resolve(TILES_ROOT, 'renders', name)
    await writeFile(path, new Uint8Array(await response.arrayBuffer()))
    await putObject(objectKey(region.code, name), path, 'image/webp')
    if (latestVersion === version) {
      await putObject(
        objectKey(
          region.code,
          stylePreviewName(region, 'latest', style, camera.landmark, zoom),
        ),
        path,
        'image/webp',
      )
    }
  }
}

function stylePreviewName(
  region: Region,
  version: string,
  style: MapStyleId,
  landmark: string,
  zoom: 16 | 19,
) {
  return `${region.name}-${version}-${style}-${landmark}-z${zoom}.webp`
}

function basemapStylePreviewUrl(
  region: Region,
  version: string,
  style: MapStyleId,
  camera: StylePreviewCamera,
  zoom: 16 | 19,
) {
  const url = new URL(VIEWER_ORIGIN)
  url.searchParams.set('headless', 'true')
  url.searchParams.set('region', region.code)
  url.searchParams.set('version', version)
  url.searchParams.set('theme', style)
  url.searchParams.set('lng', String(camera.lng))
  url.searchParams.set('lat', String(camera.lat))
  url.searchParams.set('z', String(zoom))
  url.searchParams.set('bearing', '0')
  url.searchParams.set('pitch', '0')
  url.searchParams.set('locale', 'en')
  return url.toString()
}
