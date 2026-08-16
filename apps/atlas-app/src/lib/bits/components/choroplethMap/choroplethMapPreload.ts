export const preconnectChoroplethMapOrigins = [
  'https://tiles.saanseoi.hk',
  'https://protomaps.github.io',
]

/**
 * Warms cacheable sprite metadata while a release Notes page is idle. TileJSON
 * is not fetched here because development origins cannot request it directly;
 * the preconnect above still warms its network connection for MapLibre.
 */
export function preloadChoroplethMapAssets(signal: AbortSignal) {
  void fetch('https://protomaps.github.io/basemaps-assets/sprites/v4/dark.json', {
    signal,
  }).catch(() => undefined)
}
