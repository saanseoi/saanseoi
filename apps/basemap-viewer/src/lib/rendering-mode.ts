import type { Map as MapLibreMap } from 'maplibre-gl'

const POSTCARD_BOUNDS = {
  gba: [112.4, 21.6, 115.2, 23.5],
  hk: [113.82, 22.14, 114.48, 22.58],
  mo: [113.48, 22.1, 113.62, 22.25],
} as const
const POSTCARD_BEARING = { gba: 0, hk: 0, mo: 90 } as const
const POSTCARD_OFFSET = { gba: [-240, -160], hk: [-60, 70], mo: [80, -80] } as const
const POSTCARD_ZOOM = { gba: 0.14, hk: 0, mo: 0.7 } as const

export type RenderingMode = {
  headless: boolean
  postcard: boolean
  illuminated: boolean
  bounds: (regionCode: string | null) => [number, number, number, number] | null
  bearing: (regionCode: string | null) => number
  padding: (regionCode: string | null) => {
    top: number
    right: number
    bottom: number
    left: number
  }
  offset: (regionCode: string | null) => [number, number]
  zoomAdjustment: (regionCode: string | null) => number
  waitUntilReady: (
    target: MapLibreMap,
    waitForSource: () => Promise<void>,
  ) => Promise<void>
}

export function createRenderingMode(search: string): RenderingMode {
  const params = new URLSearchParams(search)
  const headless = params.get('headless') === 'true'
  const render = params.get('render')
  const postcard = headless && (render === 'postcard' || render === 'postcard-lit')
  const illuminated = postcard && render === 'postcard-lit'
  return {
    headless,
    postcard,
    illuminated,
    bounds: regionCode => {
      if (!postcard || !regionCode) return null
      const bounds = POSTCARD_BOUNDS[regionCode as keyof typeof POSTCARD_BOUNDS]
      return bounds ? [...bounds] : null
    },
    bearing: regionCode => {
      if (!postcard || !regionCode) return 0
      return POSTCARD_BEARING[regionCode as keyof typeof POSTCARD_BEARING] ?? 0
    },
    padding: regionCode =>
      postcard && regionCode === 'gba'
        ? { top: 48, right: 48, bottom: 48, left: 48 }
        : { top: 0, right: 0, bottom: 0, left: 0 },
    offset: regionCode => {
      if (!postcard || !regionCode) return [0, 0]
      const offset = POSTCARD_OFFSET[regionCode as keyof typeof POSTCARD_OFFSET]
      return offset ? [...offset] : [0, 0]
    },
    zoomAdjustment: regionCode => {
      if (!postcard || !regionCode) return 0
      return POSTCARD_ZOOM[regionCode as keyof typeof POSTCARD_ZOOM] ?? 0
    },
    waitUntilReady: async (target, waitForSource) => {
      if (postcard) await waitForSource()
      else if (!(target.loaded() && target.areTilesLoaded()))
        await new Promise<void>(resolve => target.once('idle', () => resolve()))
      await new Promise<void>(resolve =>
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => resolve()),
        ),
      )
      signalReady()
    },
  }
}

function signalReady(): void {
  if (document.querySelector('#basemap-render-ready')) return
  const signal = document.createElement('span')
  signal.id = 'basemap-render-ready'
  signal.dataset.ready = 'true'
  signal.hidden = true
  document.body.append(signal)
}
