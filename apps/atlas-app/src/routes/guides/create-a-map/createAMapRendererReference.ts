export type CreateAMapRenderer = 'maplibre' | 'mapbox' | 'leaflet'

export type CreateAMapRendererReference = {
  code: string
  installCommand: string
  label: string
  setupInstruction?: string
  stylesheetCode: string
}

const stylesheetCode = [
  'html,',
  'body,',
  '#app,',
  '#map {',
  '  width: 100%;',
  '  height: 100%;',
  '  margin: 0;',
  '}',
].join('\n')

const references: Record<CreateAMapRenderer, CreateAMapRendererReference> = {
  maplibre: {
    label: 'MapLibre',
    installCommand: 'bun add maplibre-gl',
    code: [
      "import { Map } from 'maplibre-gl'",
      "import 'maplibre-gl/dist/maplibre-gl.css'",
      "import './style.css'",
      '',
      "document.querySelector<HTMLDivElement>('#app')!.innerHTML = '<div id=\"map\"></div>'",
      '',
      'new Map({',
      "  container: 'map',",
      '  center: [114.1694, 22.3193],',
      '  zoom: 11,',
      '  style: {',
      '    version: 8,',
      '    sources: {},',
      '    layers: [',
      '      {',
      "        id: 'background',",
      "        type: 'background',",
      "        paint: { 'background-color': '#fff9ed' },",
      '      },',
      '    ],',
      '  },',
      '})',
    ].join('\n'),
    stylesheetCode,
  },
  mapbox: {
    label: 'Mapbox GL JS',
    installCommand: 'bun add mapbox-gl',
    setupInstruction:
      'Use the Mapbox access token already stored in local `.env` as `VITE_MAPBOX_TOKEN`. Do not ask for or reveal its value.',
    code: [
      "import mapboxgl from 'mapbox-gl'",
      "import 'mapbox-gl/dist/mapbox-gl.css'",
      "import './style.css'",
      '',
      "document.querySelector<HTMLDivElement>('#app')!.innerHTML = '<div id=\"map\"></div>'",
      '',
      'mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN',
      "// Mapbox Standard is Mapbox's hosted, ready-to-use basemap style.",
      'const map = new mapboxgl.Map({',
      "  container: 'map',",
      "  style: 'mapbox://styles/mapbox/standard',",
      '  center: [114.1694, 22.3193],',
      '  zoom: 11,',
      '})',
    ].join('\n'),
    stylesheetCode,
  },
  leaflet: {
    label: 'Leaflet',
    installCommand: 'bun add leaflet maplibre-gl maplibre-gl-leaflet',
    code: [
      "import L from 'leaflet'",
      "import 'leaflet/dist/leaflet.css'",
      "import './style.css'",
      '',
      "document.querySelector<HTMLDivElement>('#app')!.innerHTML = '<div id=\"map\"></div>'",
      '',
      "const map = L.map('map').setView([22.3193, 114.1694], 11)",
      "L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {",
      "  attribution: '© OpenStreetMap contributors',",
      '}).addTo(map)',
    ].join('\n'),
    stylesheetCode,
  },
}

export const isCreateAMapRenderer = (value?: string): value is CreateAMapRenderer =>
  value === 'maplibre' || value === 'mapbox' || value === 'leaflet'

export const getCreateAMapRendererReference = (renderer: CreateAMapRenderer) =>
  references[renderer]

export const createAMapRendererReferenceInstructions = (
  renderer: CreateAMapRenderer,
  headingLevel = 3,
) => {
  const reference = getCreateAMapRendererReference(renderer)
  const heading = '#'.repeat(headingLevel)

  return [
    `${heading} Setup`,
    '',
    `Install the latest version of ${reference.label} with:`,
    '',
    '```bash',
    reference.installCommand,
    '```',
    ...(reference.setupInstruction ? ['', reference.setupInstruction] : []),
    '',
    `${heading} Code edits`,
    '',
    'Replace the existing `src/main.ts` with:',
    '',
    '```ts',
    reference.code,
    '```',
    '',
    'Set `VITE_SAANSEOI_API_KEY` in your local `.env` file. This public key is embedded in the browser build. Keep it out of source control; use it directly as the `access_token` query parameter for SaanSeoi APIs and tiles.',
    '',
    'Replace the existing styles in `src/style.css` with:',
    '',
    '```css',
    reference.stylesheetCode,
    '```',
  ].join('\n')
}
