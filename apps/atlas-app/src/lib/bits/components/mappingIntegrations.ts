import type { MappingIntegration } from './mappingIntegration.svelte'

const publicKey = 'import.meta.env.VITE_SAANSEOI_API_KEY'
const tilejson = 'https://tiles.saanseoi.hk/hongkong-latest.json'
const style = 'https://api.saanseoi.hk/v0/styles/light/1.0.0.json'

export const basemapIntegrations = [
  {
    id: 'maplibre',
    label: 'MapLibre GL JS',
    summary: 'Loads the SaanSeoi style and its vector-tile source directly.',
    code: [
      "import maplibregl from 'maplibre-gl'",
      "import 'maplibre-gl/dist/maplibre-gl.css'",
      '',
      `const accessToken = ${publicKey}`,
      `const style = await fetch('${style}').then(r => r.json())`,
      'style.sources = {',
      "  basemap: { type: 'vector', url: '" +
        tilejson +
        "?access_token=' + accessToken },",
      '}',
      "new maplibregl.Map({ container: 'map', style, center: [114.1694, 22.3193], zoom: 11 })",
    ].join('\n'),
  },
  {
    id: 'mapbox',
    label: 'Mapbox GL JS',
    summary:
      'Uses the same Mapbox Style Specification and SaanSeoi vector source. Keep your Mapbox token separate.',
    code: [
      "import mapboxgl from 'mapbox-gl'",
      '',
      `const accessToken = ${publicKey}`,
      `const style = await fetch('${style}').then(r => r.json())`,
      'style.sources = {',
      "  basemap: { type: 'vector', url: '" +
        tilejson +
        "?access_token=' + accessToken },",
      '}',
      "new mapboxgl.Map({ container: 'map', style, center: [114.1694, 22.3193], zoom: 11 })",
    ].join('\n'),
  },
  {
    id: 'leaflet',
    label: 'Leaflet',
    summary:
      'Leaflet needs a vector-tile renderer. The MapLibre GL Leaflet bridge renders the SaanSeoi style in a Leaflet map.',
    code: [
      "import L from 'leaflet'",
      "import 'maplibre-gl-leaflet'",
      '',
      `const accessToken = ${publicKey}`,
      `const style = await fetch('${style}').then(r => r.json())`,
      'style.sources = {',
      "  basemap: { type: 'vector', url: '" +
        tilejson +
        "?access_token=' + accessToken },",
      '}',
      "const map = L.map('map').setView([22.3193, 114.1694], 11)",
      'L.maplibreGL({ style }).addTo(map)',
    ].join('\n'),
  },
] as const satisfies readonly MappingIntegration[]

export const themeIntegrations = [
  {
    id: 'maplibre',
    label: 'MapLibre GL JS',
    summary: 'MapLibre reads the SaanSeoi MapLibre style JSON directly.',
    code: [
      "import maplibregl from 'maplibre-gl'",
      "import 'maplibre-gl/dist/maplibre-gl.css'",
      '',
      `const accessToken = ${publicKey}`,
      `const style = await fetch('${style}').then(r => r.json())`,
      'style.sources = {',
      "  basemap: { type: 'vector', url: '" +
        tilejson +
        "?access_token=' + accessToken },",
      '}',
      "new maplibregl.Map({ container: 'map', style, center: [114.1694, 22.3193], zoom: 11 })",
    ].join('\n'),
  },
  {
    id: 'mapbox',
    label: 'Mapbox GL JS',
    summary:
      'Mapbox GL JS can load the same style specification. Your Mapbox token, if used, remains a separate credential.',
    code: [
      "import mapboxgl from 'mapbox-gl'",
      '',
      `const accessToken = ${publicKey}`,
      `const style = await fetch('${style}').then(r => r.json())`,
      'style.sources = {',
      "  basemap: { type: 'vector', url: '" +
        tilejson +
        "?access_token=' + accessToken },",
      '}',
      "new mapboxgl.Map({ container: 'map', style, center: [114.1694, 22.3193], zoom: 11 })",
    ].join('\n'),
  },
  {
    id: 'leaflet',
    label: 'Leaflet',
    summary:
      'Use the MapLibre GL Leaflet bridge, which understands the SaanSeoi style specification.',
    code: [
      "import L from 'leaflet'",
      "import 'maplibre-gl-leaflet'",
      '',
      `const accessToken = ${publicKey}`,
      `const style = await fetch('${style}').then(r => r.json())`,
      'style.sources = {',
      "  basemap: { type: 'vector', url: '" +
        tilejson +
        "?access_token=' + accessToken },",
      '}',
      "const map = L.map('map').setView([22.3193, 114.1694], 11)",
      'L.maplibreGL({ style }).addTo(map)',
    ].join('\n'),
  },
] as const satisfies readonly MappingIntegration[]

const geojsonAdapter = [
  'const document = await fetch(',
  "  'https://api.saanseoi.hk/v0/divisions?profile=map&page[limit]=100',",
  `  { headers: { 'x-api-key': ${publicKey} } },`,
  ').then(r => r.json())',
  '',
  'const data = {',
  "  type: 'FeatureCollection',",
  '  features: document.data.flatMap((resource: any) => {',
  '    const geometry = resource.attributes.geometry',
  "    return geometry ? [{ type: 'Feature', geometry, properties: resource.attributes }] : []",
  '  }),',
  '}',
].join('\n')

export const apiIntegrations = [
  {
    id: 'maplibre',
    label: 'MapLibre GL JS',
    summary:
      'Convert the JSON:API response to a GeoJSON feature collection, then add it as a source.',
    code: [
      geojsonAdapter,
      '',
      "map.addSource('divisions', { type: 'geojson', data })",
      "map.addLayer({ id: 'divisions-fill', type: 'fill', source: 'divisions', paint: { 'fill-color': '#0d9488', 'fill-opacity': 0.25 } })",
    ].join('\n'),
  },
  {
    id: 'mapbox',
    label: 'Mapbox GL JS',
    summary: 'Mapbox GL JS accepts the same GeoJSON source and layer pattern.',
    code: [
      geojsonAdapter,
      '',
      "map.addSource('divisions', { type: 'geojson', data })",
      "map.addLayer({ id: 'divisions-fill', type: 'fill', source: 'divisions', paint: { 'fill-color': '#0d9488', 'fill-opacity': 0.25 } })",
    ].join('\n'),
  },
  {
    id: 'leaflet',
    label: 'Leaflet',
    summary: 'Leaflet consumes the converted GeoJSON directly.',
    code: [
      geojsonAdapter,
      '',
      "L.geoJSON(data, { style: { color: '#0d9488', weight: 2, fillOpacity: 0.25 } }).addTo(map)",
    ].join('\n'),
  },
  {
    id: 'google-maps',
    label: 'Google Maps',
    summary:
      'Google Maps Data layer supports external GeoJSON, including points, lines, and polygons.',
    code: [
      geojsonAdapter,
      '',
      'map.data.addGeoJson(data)',
      "map.data.setStyle({ fillColor: '#0d9488', fillOpacity: 0.25, strokeColor: '#0f766e', strokeWeight: 2 })",
    ].join('\n'),
  },
] as const satisfies readonly MappingIntegration[]
