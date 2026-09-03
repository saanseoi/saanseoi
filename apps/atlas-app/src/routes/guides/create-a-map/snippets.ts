import {
  getCreateAMapOpeningPosition,
  type CreateAMapOpeningPosition,
  type CreateAMapSelectionQuery,
} from '#lib/guides/createAMapSelections.js'

export type CreateAMapRenderer = 'maplibre' | 'mapbox' | 'leaflet'

export type CreateAMapRendererReference = {
  code: string
  installCommand: string
  label: string
  setupInstruction?: string
  stylesheetCode: string
}

export type CreateAMapProjectSetupReference = {
  code: string
  language: 'bash' | 'powershell'
  path: string
  title: string
  type: 'CLI'
}

type CreateAMapProjectSetupReferenceLabels = {
  configureVite: string
  createProject: string
  createProjectDirectory: string
  enterProjectDirectory: string
  installPackages: string
}

const stylesheetSnippet = [
  "@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');",
  '',
  'html,',
  'body,',
  '#app,',
  '#map {',
  '  width: 100%;',
  '  height: 100%;',
  '  margin: 0;',
  '}',
  '',
  'body {',
  "  font-family: 'Plus Jakarta Sans', 'Segoe UI', ui-sans-serif, system-ui, sans-serif;",
  '}',
].join('\n')

export const editorCardExplainerCode = [
  "import { Map } from 'maplibre-gl'",
  "import 'maplibre-gl/dist/maplibre-gl.css'",
  '',
  'new Map({',
  "  container: 'map',",
  '  attributionControl: { compact: true },',
  '})',
].join('\n')

export const editorCardExplainerDisplayCode = editorCardExplainerCode

const mapLibreViteConfigCode = [
  "import { defineConfig } from 'vite'",
  '',
  'export default defineConfig({',
  '  plugins: [],',
  '  optimizeDeps: {',
  "    exclude: ['maplibre-gl'],",
  '  },',
  '})',
].join('\n')

const rendererReferences: Record<CreateAMapRenderer, CreateAMapRendererReference> = {
  maplibre: {
    label: 'MapLibre',
    installCommand: 'bun add maplibre-gl',
    code: [
      "import * as maplibregl from 'maplibre-gl'",
      "import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'",
      "import 'maplibre-gl/dist/maplibre-gl.css'",
      "import './style.css'",
      '',
      'maplibregl.setWorkerUrl(workerUrl)',
      '',
      "document.querySelector<HTMLDivElement>('#app')!.innerHTML = '<div id=\"map\"></div>'",
      '',
      'new maplibregl.Map({',
      "  container: 'map',",
      '  center: [114.1694, 22.3193],',
      '  zoom: 11.5,',
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
      '  attributionControl: { compact: true },',
      '})',
    ].join('\n'),
    stylesheetCode: stylesheetSnippet,
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
      'const map = new mapboxgl.Map({',
      "  container: 'map',",
      "  style: 'mapbox://styles/mapbox/standard',",
      '  center: [114.1694, 22.3193],',
      '  zoom: 11.5,',
      '})',
    ].join('\n'),
    stylesheetCode: stylesheetSnippet,
  },
  leaflet: {
    label: 'Leaflet',
    installCommand: 'bun add leaflet maplibre-gl @maplibre/maplibre-gl-leaflet',
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
    stylesheetCode: stylesheetSnippet,
  },
}

export const isCreateAMapRenderer = (value?: string): value is CreateAMapRenderer =>
  value === 'maplibre' || value === 'mapbox' || value === 'leaflet'

export const getCreateAMapRendererReference = (
  renderer: CreateAMapRenderer,
  openingPosition: CreateAMapOpeningPosition = getCreateAMapOpeningPosition(undefined),
): CreateAMapRendererReference => {
  const [longitude, latitude] = openingPosition.center
  const reference = rendererReferences[renderer]
  const code =
    renderer === 'leaflet'
      ? reference.code.replace(
          "L.map('map').setView([22.3193, 114.1694], 11)",
          `L.map('map').setView([${latitude}, ${longitude}], ${openingPosition.zoom})`,
        )
      : reference.code
          .replace(
            'center: [114.1694, 22.3193],',
            `center: [${longitude}, ${latitude}],`,
          )
          .replace('zoom: 11.5,', `zoom: ${openingPosition.zoom},`)

  return { ...reference, code }
}

export const createAMapRendererBasemapCode = (
  renderer: CreateAMapRenderer,
  _styleUrl: string,
  tilejsonUrl: string,
  openingPosition: CreateAMapOpeningPosition = getCreateAMapOpeningPosition(undefined),
) => {
  const [longitude, latitude] = openingPosition.center

  return renderer === 'leaflet'
    ? [
        "import L from 'leaflet'",
        "import 'leaflet/dist/leaflet.css'",
        "import * as maplibregl from 'maplibre-gl'",
        "import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'",
        "import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'",
        "import 'maplibre-gl/dist/maplibre-gl.css'",
        "import './style.css'",
        '',
        'maplibregl.setWorkerUrl(workerUrl)',
        '',
        'const accessToken = import.meta.env.VITE_SAANSEOI_API_KEY',
        'const urlSafeApiKey = encodeURIComponent(accessToken)',
        `const basemapBaseUrl = '${tilejsonUrl}'`,
        `const basemapUrl = \`\${basemapBaseUrl}?access_token=\${urlSafeApiKey}\``,
        '',
        "document.querySelector<HTMLDivElement>('#app')!.innerHTML = '<div id=\"map\"></div>'",
        '',
        "const map = L.map('map', {",
        '  zoomAnimation: false,',
        '  fadeAnimation: false,',
        '  markerZoomAnimation: false,',
        `}).setView([${latitude}, ${longitude}], ${openingPosition.zoom})`,
        'maplibreGL({',
        '  style: {',
        '    version: 8,',
        '    sources: {',
        "      basemap: { type: 'vector', url: basemapUrl },",
        '    },',
        '    layers: [],',
        '  },',
        '}).addTo(map)',
      ].join('\n')
    : [
        ...(renderer === 'mapbox'
          ? ["import mapboxgl from 'mapbox-gl'"]
          : [
              "import * as maplibregl from 'maplibre-gl'",
              "import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'",
            ]),
        `import '${renderer === 'mapbox' ? 'mapbox-gl' : 'maplibre-gl'}/dist/${renderer === 'mapbox' ? 'mapbox-gl' : 'maplibre-gl'}.css'`,
        "import './style.css'",
        '',
        ...(renderer === 'maplibre' ? ['maplibregl.setWorkerUrl(workerUrl)', ''] : []),
        'const accessToken = import.meta.env.VITE_SAANSEOI_API_KEY',
        'const urlSafeApiKey = encodeURIComponent(accessToken)',
        `const basemapBaseUrl = '${tilejsonUrl}'`,
        `const basemapUrl = \`\${basemapBaseUrl}?access_token=\${urlSafeApiKey}\``,
        '',
        "document.querySelector<HTMLDivElement>('#app')!.innerHTML = '<div id=\"map\"></div>'",
        '',
        `${renderer === 'mapbox' ? 'const map = ' : ''}new ${renderer === 'mapbox' ? 'mapboxgl.Map' : 'maplibregl.Map'}({`,
        "  container: 'map',",
        `  center: [${longitude}, ${latitude}],`,
        `  zoom: ${openingPosition.zoom},`,
        '  style: {',
        '    version: 8,',
        '    sources: {',
        "      basemap: { type: 'vector', url: basemapUrl },",
        '    },',
        '    layers: [],',
        '  },',
        ...(renderer === 'maplibre'
          ? ['  attributionControl: { compact: true },']
          : []),
        '})',
      ].join('\n')
}

export const createAMapRendererStyleCode = (
  renderer: CreateAMapRenderer,
  styleUrl: string,
  tilejsonUrl: string,
  openingPosition: CreateAMapOpeningPosition = getCreateAMapOpeningPosition(undefined),
) => {
  const [longitude, latitude] = openingPosition.center

  return renderer === 'leaflet'
    ? [
        "import L from 'leaflet'",
        "import 'leaflet/dist/leaflet.css'",
        "import * as maplibregl from 'maplibre-gl'",
        "import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'",
        "import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'",
        "import 'maplibre-gl/dist/maplibre-gl.css'",
        "import './style.css'",
        '',
        'maplibregl.setWorkerUrl(workerUrl)',
        '',
        'const accessToken = import.meta.env.VITE_SAANSEOI_API_KEY',
        'const urlSafeApiKey = encodeURIComponent(accessToken)',
        `const basemapBaseUrl = '${tilejsonUrl}'`,
        `const basemapUrl = \`\${basemapBaseUrl}?access_token=\${urlSafeApiKey}\``,
        '',
        `const styleUrl = '${styleUrl}'`,
        'const style = await fetch(styleUrl).then(response => response.json())',
        'style.sources = {',
        "  basemap: { type: 'vector', url: basemapUrl },",
        '}',
        '',
        "document.querySelector<HTMLDivElement>('#app')!.innerHTML = '<div id=\"map\"></div>'",
        '',
        "const map = L.map('map', {",
        '  zoomAnimation: false,',
        '  fadeAnimation: false,',
        '  markerZoomAnimation: false,',
        `}).setView([${latitude}, ${longitude}], ${openingPosition.zoom})`,
        'maplibreGL({',
        '  style,',
        '}).addTo(map)',
      ].join('\n')
    : [
        ...(renderer === 'mapbox'
          ? ["import mapboxgl from 'mapbox-gl'"]
          : [
              "import * as maplibregl from 'maplibre-gl'",
              "import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'",
            ]),
        `import '${renderer === 'mapbox' ? 'mapbox-gl' : 'maplibre-gl'}/dist/${renderer === 'mapbox' ? 'mapbox-gl' : 'maplibre-gl'}.css'`,
        "import './style.css'",
        '',
        ...(renderer === 'maplibre' ? ['maplibregl.setWorkerUrl(workerUrl)', ''] : []),
        'const accessToken = import.meta.env.VITE_SAANSEOI_API_KEY',
        'const urlSafeApiKey = encodeURIComponent(accessToken)',
        `const basemapBaseUrl = '${tilejsonUrl}'`,
        `const basemapUrl = \`\${basemapBaseUrl}?access_token=\${urlSafeApiKey}\``,
        '',
        `const styleUrl = '${styleUrl}'`,
        'const style = await fetch(styleUrl).then(response => response.json())',
        'style.sources = {',
        "  basemap: { type: 'vector', url: basemapUrl },",
        '}',
        '',
        "document.querySelector<HTMLDivElement>('#app')!.innerHTML = '<div id=\"map\"></div>'",
        '',
        `${renderer === 'mapbox' ? 'const map = ' : ''}new ${renderer === 'mapbox' ? 'mapboxgl.Map' : 'maplibregl.Map'}({`,
        "  container: 'map',",
        `  center: [${longitude}, ${latitude}],`,
        `  zoom: ${openingPosition.zoom},`,
        '  style,',
        ...(renderer === 'maplibre'
          ? ['  attributionControl: { compact: true },']
          : []),
        '})',
      ].join('\n')
}

export const createGeoJsonImportCode = (renderer: CreateAMapRenderer) => {
  if (renderer === 'leaflet') {
    return [
      "const places = await fetch('/features.geojson').then(response => response.json())",
      '',
      'L.geoJSON(places, {',
      '  pointToLayer: (_, latlng) => L.circleMarker(latlng, {',
      "    color: '#0f766e',",
      "    fillColor: '#2dd4bf',",
      '    fillOpacity: 0.9,',
      '    radius: 7,',
      '  }),',
      "  onEachFeature: (feature, layer) => layer.bindPopup(feature.properties?.name ?? 'Place'),",
      '}).addTo(map)',
    ].join('\n')
  }

  return [
    "const places = await fetch('/features.geojson').then(response => response.json())",
    '',
    'const addPlaces = () => {',
    "  map.addSource('places', { type: 'geojson', data: places })",
    "  map.addLayer({ id: 'places', type: 'circle', source: 'places',",
    "    paint: { 'circle-radius': 7, 'circle-color': '#2dd4bf',",
    "      'circle-stroke-width': 2, 'circle-stroke-color': '#0f766e' },",
    '  })',
    '}',
    '',
    'if (map.isStyleLoaded()) addPlaces()',
    "else map.once('load', addPlaces)",
  ].join('\n')
}

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

export const getHostingInstallCode = (hosting?: string) =>
  hosting === 'cloudflare'
    ? 'bun add -d wrangler'
    : hosting === 'github-pages'
      ? 'bun add -d gh-pages'
      : hosting === 'vercel'
        ? 'bun add -d vercel'
        : hosting === 'netlify'
          ? 'bun add -d netlify-cli'
          : ''

export const createProjectSetupCode = (
  operatingSystem?: string,
  renderer?: CreateAMapRenderer,
) =>
  ['mkdir saanseoi-project', 'cd saanseoi-project']
    .concat([
      '# If prompted that the directory is not empty, choose “Ignore files and continue”.',
      ...(operatingSystem === 'windows'
        ? ['bun create vite . --template vanilla-ts --no-immediate']
        : [
            '# This selects “Ignore files and continue” if Vite shows that prompt.',
            String.raw`printf '\033[B\033[B\r' | bun create vite . --template vanilla-ts --no-immediate --interactive`,
          ]),
      ...(renderer === 'maplibre' || renderer === 'leaflet'
        ? operatingSystem === 'windows'
          ? [
              '# Prepare Vite for MapLibre support.',
              "$viteConfig = @'",
              mapLibreViteConfigCode,
              "'@",
              '$viteConfig | Set-Content vite.config.js',
            ]
          : [
              '# Prepare Vite for MapLibre support.',
              [
                "printf '%s\\n' \\",
                ...mapLibreViteConfigCode
                  .split('\n')
                  .map(line => `  ${JSON.stringify(line)} \\`),
                '  > vite.config.js',
              ].join('\n'),
            ]
        : []),
      'bun install',
    ])
    .join('\n')

export const createProjectSetupReferences = (
  operatingSystem: string | undefined,
  renderer: CreateAMapRenderer | undefined,
  labels: CreateAMapProjectSetupReferenceLabels,
): CreateAMapProjectSetupReference[] => {
  const isWindows = operatingSystem?.toLowerCase() === 'windows'
  const language = isWindows ? 'powershell' : 'bash'
  const projectPath = isWindows ? '~\\saanseoi-project' : '~/saanseoi-project'
  const viteCommand = isWindows
    ? 'bun create vite . --template vanilla-ts --no-immediate'
    : String.raw`printf '\033[B\033[B\r' | bun create vite . --template vanilla-ts --no-immediate --interactive`
  const references: CreateAMapProjectSetupReference[] = [
    {
      code: 'mkdir saanseoi-project',
      language,
      path: '~',
      title: labels.createProjectDirectory,
      type: 'CLI',
    },
    {
      code: 'cd saanseoi-project',
      language,
      path: '~',
      title: labels.enterProjectDirectory,
      type: 'CLI',
    },
    {
      code: viteCommand,
      language,
      path: projectPath,
      title: labels.createProject,
      type: 'CLI',
    },
  ]

  if (renderer === 'maplibre' || renderer === 'leaflet') {
    references.push({
      code: isWindows
        ? [
            "$viteConfig = @'",
            mapLibreViteConfigCode,
            "'@",
            '$viteConfig | Set-Content vite.config.js',
          ].join('\n')
        : [
            "printf '%s\\n' \\",
            ...mapLibreViteConfigCode
              .split('\n')
              .map(line => `  ${JSON.stringify(line)} \\`),
            '  > vite.config.js',
          ].join('\n'),
      language,
      path: projectPath,
      title: labels.configureVite,
      type: 'CLI',
    })
  }

  references.push({
    code: 'bun install',
    language,
    path: projectPath,
    title: labels.installPackages,
    type: 'CLI',
  })

  return references
}

export const createRestartProjectCode = (operatingSystem?: string) =>
  operatingSystem === 'windows'
    ? 'cd saanseoi-project\nbun dev'
    : 'cd saanseoi-project && bun dev'

export const viteReadyOutput = [
  'VITE v8.2.1  ready in 58 ms',
  '',
  '➜  Local:   http://localhost:5173/',
  '➜  Network: use --host to expose',
  '➜  press h + enter to show help',
].join('\n')

export const getBunInstallCode = (operatingSystem?: string) =>
  operatingSystem === 'windows'
    ? 'irm bun.sh/install.ps1 | iex'
    : 'curl -fsSL https://bun.sh/install | bash'

export const createNotebookSetupCode = (
  operatingSystem?: string,
  notebookLibrary?: string,
) =>
  operatingSystem === 'windows'
    ? [
        'py -m venv .venv',
        '.venv\\Scripts\\Activate.ps1',
        `py -m pip install jupyterlab ${notebookLibrary === 'maplibre-jupyter' ? 'maplibre' : 'folium'}`,
        'jupyter lab',
      ].join('\n')
    : [
        'python3 -m venv .venv',
        'source .venv/bin/activate',
        `python -m pip install jupyterlab ${notebookLibrary === 'maplibre-jupyter' ? 'maplibre' : 'folium'}`,
        'jupyter lab',
      ].join('\n')

export const createDeploymentCode = (hosting?: string) =>
  hosting === 'cloudflare'
    ? 'bunx wrangler deploy'
    : hosting === 'github-pages'
      ? [
          'bunx tsc --noEmit && bunx vite build --base=/saanseoi-project/',
          'bunx gh-pages -d dist',
        ].join('\n')
      : hosting === 'vercel'
        ? 'bunx vercel --prod'
        : hosting === 'netlify'
          ? 'bunx netlify deploy --dir=dist --prod --no-build'
          : [
              'bun run build',
              '# Publish the contents of dist/ with your hosting provider.',
            ].join('\n')

export const iframeCode = [
  '<iframe',
  '  src="https://your-map.example"',
  '  title="My SaanSeoi map"',
  '  width="100%"',
  '  height="600"',
  '  loading="lazy"',
  '></iframe>',
].join('\n')

export const createNotebookCode = (notebookLibrary?: string) =>
  notebookLibrary === 'maplibre-jupyter'
    ? [
        'from maplibre import Map, MapOptions',
        '',
        'map_view = Map(MapOptions(center=(114.1694, 22.3193), zoom=11.5))',
        "map_view.save('map.html', preview=True)",
      ].join('\n')
    : [
        'import folium',
        '',
        'map_view = folium.Map(location=[22.3193, 114.1694], zoom_start=11.5)',
        'map_view',
      ].join('\n')

export const getRendererTerminalCommand = (operatingSystem?: string) =>
  operatingSystem === 'windows'
    ? 'Set-Location ~\\saanseoi-project'
    : 'cd ~/saanseoi-project'

export const createAgentProjectCommand = (
  agentTool: CreateAMapSelectionQuery['agentTool'],
) => {
  const commands = {
    'codex-cli': 'codex',
    'claude-code': 'claude',
    'kimi-code': 'kimi',
    'qwen-code': 'qwen',
    opencode: 'opencode',
    pi: 'pi',
  } as const
  const command = agentTool && commands[agentTool as keyof typeof commands]
  return command
    ? `mkdir saanseoi-project && cd saanseoi-project && ${command}`
    : undefined
}

export const createUrbanDensityMapReadyCode = (
  styleUrl: string,
  renderer: CreateAMapRenderer = 'maplibre',
) =>
  [
    ...(renderer === 'leaflet'
      ? [
          "import L from 'leaflet'",
          "import * as maplibregl from 'maplibre-gl'",
          "import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'",
          "import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'",
          "import 'leaflet/dist/leaflet.css'",
          "import 'maplibre-gl/dist/maplibre-gl.css'",
        ]
      : [
          renderer === 'mapbox'
            ? "import mapboxgl from 'mapbox-gl'"
            : "import * as maplibregl from 'maplibre-gl'",
          ...(renderer === 'maplibre'
            ? [
                "import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'",
              ]
            : []),
          `import '${renderer === 'mapbox' ? 'mapbox-gl' : 'maplibre-gl'}/dist/${renderer === 'mapbox' ? 'mapbox-gl' : 'maplibre-gl'}.css'`,
        ]),
    "import './style.css'",
    '',
    ...(renderer === 'maplibre' || renderer === 'leaflet'
      ? ['maplibregl.setWorkerUrl(workerUrl)', '']
      : []),
    'const accessToken = import.meta.env.VITE_SAANSEOI_API_KEY',
    'const urlSafeApiKey = encodeURIComponent(accessToken)',
    "const basemapBaseUrl = 'https://tiles.saanseoi.hk/hongkong-latest.json'",
    `const basemapUrl = \`\${basemapBaseUrl}?access_token=\${urlSafeApiKey}\``,
    '',
    `const styleUrl = '${styleUrl}'`,
    'const style = await fetch(styleUrl).then(response => response.json())',
    'style.sources = {',
    "  basemap: { type: 'vector', url: basemapUrl },",
    '}',
    '',
    ...(renderer === 'mapbox'
      ? ['mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN', '']
      : []),
    "document.querySelector<HTMLDivElement>('#app')!.innerHTML = '<div id=\"map\"></div>'",
    '',
    ...(renderer === 'leaflet'
      ? [
          "const leafletMap = L.map('map', {",
          '  zoomAnimation: false,',
          '  fadeAnimation: false,',
          '  markerZoomAnimation: false,',
          '}).setView([22.32, 114.16], 11.5)',
          'const basemapLayer = maplibreGL({ style }).addTo(leafletMap)',
          'const map = basemapLayer.getMaplibreMap()',
        ]
      : [
          `const map = new ${renderer === 'mapbox' ? 'mapboxgl.Map' : 'maplibregl.Map'}({`,
          "  container: 'map',",
          '  center: [114.16, 22.32],',
          '  zoom: 11.5,',
          '  style,',
          ...(renderer === 'maplibre'
            ? ['  attributionControl: { compact: true },']
            : []),
          '})',
        ]),
  ].join('\n')

export const createUrbanDensityStatsCode = (
  apiBaseUrl: string,
  savedResultComment: string,
) =>
  [
    "import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'",
    'type DistrictProperties = { districtCode: string; districtName: string; area: string; population: number; landAreaSqKm: number }',
    'type District = Feature<Polygon | MultiPolygon, DistrictProperties>',
    'type AreaMetric = { name: string; population: number; landAreaSqKm: number; peoplePerSqKm: number }',
    'type LandAnalysisResult = {',
    '  districts: District[]',
    '  excludedDistrictLand: FeatureCollection<Polygon | MultiPolygon, DistrictProperties>',
    '}',
    '',
    ...savedResultComment.split('\n').map(line => `// ${line}`),
    'let savedResult: LandAnalysisResult | undefined',
    "const savedResultUrl = new URL('./land-analysis.json.gz', import.meta.url)",
    'try {',
    '  const savedResultResponse = await fetch(savedResultUrl)',
    '  if (savedResultResponse.ok && savedResultResponse.body) {',
    "    const savedResultBody = savedResultResponse.headers.get('content-encoding') === 'gzip'",
    '      ? savedResultResponse.body',
    "      : savedResultResponse.body.pipeThrough(new DecompressionStream('gzip'))",
    '    savedResult = (await new Response(savedResultBody).json()) as LandAnalysisResult',
    '  }',
    '} catch {}',
    '',
    `const apiBaseUrl = '${apiBaseUrl}'`,
    'let populationByDistrict: Record<string, string> = {}',
    'let landAreaByDistrict: Record<string, string> = {}',
    'let districts: District[] = savedResult?.districts ?? []',
    'let metrics: AreaMetric[] = []',
    '',
    'if (!savedResult) {',
    "const statsEndpoint = '/stats/v0.1/geographies'",
    "const densityDatasetCode = 'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district'",
    '',
    'async function getDistrictField(field: string) {',
    '  const url = new URL(statsEndpoint, apiBaseUrl)',
    "  url.searchParams.set('cohort', '2024')",
    "  url.searchParams.set('filter[dataset]', densityDatasetCode)",
    "  url.searchParams.set('filter[field]', field)",
    "  url.searchParams.set('filter[referencePeriod]', '2024')",
    '',
    "  const response = await fetch(url, { headers: { 'x-api-key': accessToken } })",
    '  const result = (await response.json()) as { message?: string; values?: Record<string, string> }',
    `  const message = typeof result.message === 'string' ? \`: \${result.message}\` : ''`,
    `  if (!response.ok || !result.values) throw new Error(\`Statistics request failed: \${response.status}\${message}\`)`,
    '  return result.values',
    '}',
    '',
    '[populationByDistrict, landAreaByDistrict] = await Promise.all([',
    "  getDistrictField('populationMidYear'),",
    "  getDistrictField('landArea'),",
    '])',
    '}',
  ].join('\n')

export const createUrbanDensityStatsDisplayCode = (
  apiBaseUrl: string,
  savedResultComment: string,
) => createUrbanDensityStatsCode(apiBaseUrl, savedResultComment)

export const urbanDensityCalculationCode = [
  'type DivisionsResponse = {',
  '  data: Array<{',
  '    id: string',
  '    attributes: { divisionCode: string; i18n?: { en?: { name?: string } } }',
  '    relationships: { hierarchy: { data: Array<{ meta?: { subType?: string; name?: string } }> } }',
  '  }>',
  '  included: Array<{ type: string; attributes: { divisionId?: string; geometry?: Polygon | MultiPolygon } }>',
  '}',
  '',
  'if (!savedResult) {',
  "const divisionsEndpoint = '/divisions/v0'",
  'const divisionsUrl = new URL(divisionsEndpoint, apiBaseUrl)',
  "divisionsUrl.searchParams.set('filter[level]', '2')",
  "divisionsUrl.searchParams.set('include', 'hierarchy,areas:hkgov-censtatd-landclipped@2021')",
  "const divisionsResponse = await fetch(divisionsUrl, { headers: { 'x-api-key': accessToken } })",
  'if (!divisionsResponse.ok) {',
  '  const error = await divisionsResponse.json().catch(() => null)',
  `  const message = typeof error?.message === 'string' ? \`: \${error.message}\` : ''`,
  `  throw new Error(\`Divisions request failed: \${divisionsResponse.status}\${message}\`)`,
  '}',
  'const response = (await divisionsResponse.json()) as DivisionsResponse',
  '',
  'districts = response.data.flatMap(division => {',
  '  const code = division.attributes.divisionCode',
  "  const area = division.relationships.hierarchy.data.find(item => item.meta?.subType === 'area')",
  "  const geometry = response.included.find(item => item.type === 'division-areas' && item.attributes.divisionId === division.id)?.attributes.geometry",
  '  if (!area || !geometry) return []',
  '',
  '  return {',
  "    type: 'Feature' as const,",
  '    properties: { districtCode: code, districtName: division.attributes.i18n?.en?.name ?? code, area: area.meta?.name ?? code, population: Number(populationByDistrict[code]), landAreaSqKm: Number(landAreaByDistrict[code]) },',
  '    geometry,',
  '  }',
  '})',
  '',
  'const totalsByArea = districts.reduce((totals, district) => {',
  '  const { area, population, landAreaSqKm } = district.properties',
  '  const total = totals.get(area) ?? { name: area, population: 0, landAreaSqKm: 0 }',
  '  total.population += population',
  '  total.landAreaSqKm += landAreaSqKm',
  '  totals.set(area, total)',
  '  return totals',
  '}, new Map<string, { name: string; population: number; landAreaSqKm: number }>())',
  '',
  'metrics = [...totalsByArea.values()]',
  '  .map(total => ({',
  '    ...total,',
  '    peoplePerSqKm: total.population / total.landAreaSqKm,',
  '  }))',
  '  .sort((first, second) => first.name.localeCompare(second.name))',
  '}',
].join('\n')

export const urbanDensityCalculationDisplayCode = urbanDensityCalculationCode

export const urbanDensityMapCode = [
  "const nonLiveableLandUse = ['aerodrome', 'airfield', 'allotments', 'bare_rock', 'beach', 'cemetery', 'commercial', 'construction', 'dam', 'dog_park', 'farmland', 'forest', 'garden', 'golf_course', 'grass', 'grassland', 'industrial', 'meadow', 'military', 'nature_reserve', 'park', 'pedestrian', 'pier', 'pitch', 'platform', 'playground', 'railway', 'recreation_ground', 'runway', 'sand', 'scrub', 'wetland', 'wood', 'zoo']",
  '',
  'let firstLabelLayerId: string | undefined',
  '',
  "await new Promise<void>(resolve => (map.isStyleLoaded() ? resolve() : map.once('load', () => resolve())))",
  '',
  'if (!savedResult) {',
  "document.querySelector('#urban-density-metrics')?.remove()",
  '',
  "firstLabelLayerId = map.getStyle().layers.find(layer => layer.type === 'symbol')?.id",
  '',
  "map.addSource('completed-exclusions', {",
  "  type: 'geojson',",
  "  data: { type: 'FeatureCollection', features: [] },",
  '})',
  '',
  'map.addLayer({',
  "  id: 'not-liveable',",
  "  type: 'fill',",
  "  source: 'basemap',",
  "  'source-layer': 'landuse',",
  "  filter: ['in', 'kind', ...nonLiveableLandUse],",
  "  paint: { 'fill-color': '#e76f51', 'fill-opacity': 0.62 },",
  '}, firstLabelLayerId)',
  '',
  'map.addLayer({',
  "  id: 'not-liveable-outline',",
  "  type: 'line',",
  "  source: 'basemap',",
  "  'source-layer': 'landuse',",
  "  filter: ['in', 'kind', ...nonLiveableLandUse],",
  "  paint: { 'line-color': '#8c3427', 'line-width': 1 },",
  '}, firstLabelLayerId)',
  '}',
].join('\n')

export const urbanDensityMapDisplayCode = urbanDensityMapCode

export const urbanDensityTurfInstallCode =
  'bun add @turf/turf @mapbox/vector-tile pbf geos-wasm'

export const urbanDensityTurfInstallOutput = [
  'bun add v1.4.0 (34cbb9a40)',
  '',
  'installed @turf/turf@7.4.0',
  'installed @mapbox/vector-tile@3.0.0',
  'installed pbf@5.1.2 with binaries:',
  ' - pbf',
  'installed geos-wasm@3.1.1',
].join('\n')

export const urbanDensityGeometryWorkerCode = [
  "import { booleanValid, cleanCoords, flatten, unkinkPolygon } from '@turf/turf'",
  "import initGeosJs from 'geos-wasm'",
  "import { geojsonToGeosGeom, geosGeomToGeojson } from 'geos-wasm/helpers'",
  "import type { Feature, Geometry, MultiPolygon, Polygon } from 'geojson'",
  '',
  "type Operation = 'snap' | 'union' | 'intersection'",
  'type GeometryRequest = { id: number; operation: Operation; geometries: Array<Polygon | MultiPolygon>; precisionGrid: number }',
  'type GeometryResponse = { id: number; geometry?: Polygon | MultiPolygon; error?: string }',
  '',
  'const geosReady = initGeosJs()',
  "const polygonalCoordinates = (geometry: Geometry): MultiPolygon['coordinates'] =>",
  "  geometry.type === 'Polygon'",
  '    ? [geometry.coordinates]',
  "    : geometry.type === 'MultiPolygon'",
  '      ? geometry.coordinates',
  "      : geometry.type === 'GeometryCollection'",
  '        ? geometry.geometries.flatMap(polygonalCoordinates)',
  '        : []',
  'const polygonalGeometry = (geometry: Geometry) => {',
  '  const coordinates = polygonalCoordinates(geometry)',
  '  if (coordinates.length === 0) return undefined',
  '  return coordinates.length === 1',
  "    ? { type: 'Polygon' as const, coordinates: coordinates[0]! }",
  "    : { type: 'MultiPolygon' as const, coordinates }",
  '}',
  'const polygonParts = (geometries: Array<Polygon | MultiPolygon>) => geometries.flatMap(geometry => {',
  "  const cleaned = cleanCoords({ type: 'Feature', properties: {}, geometry }) as Feature<Polygon | MultiPolygon>",
  '  const polygons = flatten(cleaned).features as Feature<Polygon>[]',
  '  return polygons.flatMap(polygon =>',
  '    booleanValid(polygon) ? [polygon.geometry] : unkinkPolygon(polygon).features.map(feature => feature.geometry),',
  '  )',
  '})',
  '',
  'const snapGeometry = async (geometry: Polygon | MultiPolygon, precisionGrid: number) => {',
  '  const geos = await geosReady',
  '  let input = 0',
  '  let madeValid = 0',
  '  let snapped = 0',
  '  try {',
  '    input = geojsonToGeosGeom(geometry, geos)',
  '    if (geos.GEOSisValid(input) !== 1) madeValid = geos.GEOSMakeValid(input)',
  '    snapped = geos.GEOSGeom_setPrecision(',
  '      madeValid || input, precisionGrid, geos.GEOSPrecisionRules.GEOS_PREC_VALID_OUTPUT,',
  '    )',
  "    if (!snapped || geos.GEOSisEmpty(snapped) === 1) throw new Error('Precision repair left no polygonal land.')",
  '    const polygon = polygonalGeometry(geosGeomToGeojson(snapped, geos) as Geometry)',
  "    if (!polygon) throw new Error('Precision repair left no polygonal land.')",
  '    return polygon',
  '  } finally {',
  '    if (snapped) geos.GEOSGeom_destroy(snapped)',
  '    if (madeValid) geos.GEOSGeom_destroy(madeValid)',
  '    if (input) geos.GEOSGeom_destroy(input)',
  '  }',
  '}',
  '',
  'const unionGeometries = async (geometries: Array<Polygon | MultiPolygon>, precisionGrid: number) => {',
  '  const parts = polygonParts(geometries)',
  '  if (parts.length === 0) return undefined',
  '  const geos = await geosReady',
  '  let collection = 0',
  '  let merged = 0',
  '  try {',
  "    collection = geojsonToGeosGeom({ type: 'GeometryCollection', geometries: parts }, geos)",
  '    merged = geos.GEOSUnaryUnionPrec(collection, precisionGrid)',
  '    if (!merged || geos.GEOSisEmpty(merged) === 1) return undefined',
  '    const polygon = polygonalGeometry(geosGeomToGeojson(merged, geos) as Geometry)',
  "    if (!polygon) throw new Error('Land union is not polygonal.')",
  '    return polygon',
  '  } finally {',
  '    if (merged) geos.GEOSGeom_destroy(merged)',
  '    if (collection) geos.GEOSGeom_destroy(collection)',
  '  }',
  '}',
  '',
  'const intersectGeometries = async (geometries: Array<Polygon | MultiPolygon>, precisionGrid: number) => {',
  '  const geos = await geosReady',
  '  let first = 0',
  '  let second = 0',
  '  let overlap = 0',
  '  try {',
  '    first = geojsonToGeosGeom(geometries[0]!, geos)',
  '    second = geojsonToGeosGeom(geometries[1]!, geos)',
  '    overlap = geos.GEOSIntersectionPrec(first, second, precisionGrid)',
  '    if (!overlap || geos.GEOSisEmpty(overlap) === 1) return undefined',
  '    return polygonalGeometry(geosGeomToGeojson(overlap, geos) as Geometry)',
  '  } finally {',
  '    if (overlap) geos.GEOSGeom_destroy(overlap)',
  '    if (second) geos.GEOSGeom_destroy(second)',
  '    if (first) geos.GEOSGeom_destroy(first)',
  '  }',
  '}',
  '',
  'self.onmessage = async ({ data }: MessageEvent<GeometryRequest>) => {',
  '  try {',
  "    const geometry = data.operation === 'snap'",
  '      ? await snapGeometry(data.geometries[0]!, data.precisionGrid)',
  "      : data.operation === 'union'",
  '        ? await unionGeometries(data.geometries, data.precisionGrid)',
  '        : await intersectGeometries(data.geometries, data.precisionGrid)',
  '    self.postMessage({ id: data.id, geometry } satisfies GeometryResponse)',
  '  } catch (cause) {',
  "    const error = cause instanceof Error ? cause.message : 'Geometry worker failed.'",
  '    self.postMessage({ id: data.id, error } satisfies GeometryResponse)',
  '  }',
  '}',
].join('\n')

const urbanDensitySetupZ14TileFetcherBody = [
  "import { VectorTile } from '@mapbox/vector-tile'",
  "import { PbfReader } from 'pbf'",
  "import { area, bbox, bboxPolygon, booleanIntersects, featureCollection } from '@turf/turf'",
  "import type { Geometry, Position } from 'geojson'",
  '',
  'const analysisZoom = 14',
  'const analysisExtent = 4096',
  'const precisionGrid = 4',
  'const analysisWorldSize = 2 ** analysisZoom * analysisExtent',
  'const longitudeToTile = (longitude: number) => ((longitude + 180) / 360) * 2 ** analysisZoom',
  'const latitudeToTile = (latitude: number) => {',
  '  const radians = (latitude * Math.PI) / 180',
  '  return ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * 2 ** analysisZoom',
  '}',
  'const tileToLongitude = (x: number) => (x / 2 ** analysisZoom) * 360 - 180',
  'const tileToLatitude = (y: number) => {',
  '  const radians = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** analysisZoom)))',
  '  return (radians * 180) / Math.PI',
  '}',
  'const tileBounds = ({ x, y }: { x: number; y: number }): [number, number, number, number] => [',
  '  tileToLongitude(x), tileToLatitude(y + 1), tileToLongitude(x + 1), tileToLatitude(y),',
  ']',
  'type ProcessingTile = { x: number; y: number; district: (typeof districts)[number] }',
  'type Bounds = [number, number, number, number]',
  'const mapPolygonPositions = (geometry: Polygon | MultiPolygon, transform: (position: Position) => Position): Polygon | MultiPolygon => {',
  "  const transformPolygon = (coordinates: Polygon['coordinates']) =>",
  '    coordinates.map(ring => ring.map(transform))',
  "  return geometry.type === 'Polygon'",
  "    ? { type: 'Polygon', coordinates: transformPolygon(geometry.coordinates) }",
  "    : { type: 'MultiPolygon', coordinates: geometry.coordinates.map(transformPolygon) }",
  '}',
  'const toAnalysisPosition = ([longitude, latitude]: Position): Position => {',
  '  const radians = (latitude * Math.PI) / 180',
  '  return [',
  '    ((longitude + 180) / 360) * analysisWorldSize,',
  '    ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * analysisWorldSize,',
  '  ]',
  '}',
  'const fromAnalysisPosition = ([x, y]: Position): Position => [',
  '  tileToLongitude(x / analysisExtent),',
  '  tileToLatitude(y / analysisExtent),',
  ']',
  'const toAnalysisGeometry = (geometry: Polygon | MultiPolygon) =>',
  '  mapPolygonPositions(geometry, toAnalysisPosition)',
  'const fromAnalysisGeometry = (geometry: Polygon | MultiPolygon) =>',
  '  mapPolygonPositions(geometry, fromAnalysisPosition)',
  'const tileCoreGeometry = ({ x, y }: { x: number; y: number }): Polygon => {',
  '  const west = x * analysisExtent',
  '  const north = y * analysisExtent',
  '  const east = (x + 1) * analysisExtent',
  '  const south = (y + 1) * analysisExtent',
  "  return { type: 'Polygon', coordinates: [[[west, north], [east, north], [east, south], [west, south], [west, north]]] }",
  '}',
  'const tilesCovering = (district: (typeof districts)[number]) => {',
  '  const [west, south, east, north] = bbox(district) as Bounds',
  '  const minX = Math.floor(longitudeToTile(west))',
  '  const maxX = Math.floor(longitudeToTile(east))',
  '  const minY = Math.floor(latitudeToTile(north))',
  '  const maxY = Math.floor(latitudeToTile(south))',
  '  const candidateTiles = Array.from({ length: (maxX - minX + 1) * (maxY - minY + 1) }, (_, index) => ({',
  '    x: minX + (index % (maxX - minX + 1)),',
  '    y: minY + Math.floor(index / (maxX - minX + 1)),',
  '    district,',
  '  }))',
  '  return candidateTiles.filter(tile => booleanIntersects(bboxPolygon(tileBounds(tile)), district))',
  '}',
  '',
  'const nonLiveableKinds = new Set(nonLiveableLandUse)',
  'const excludedDistrictLand: Array<Feature<Polygon | MultiPolygon, DistrictProperties>> = []',
  "type GeometryOperation = 'snap' | 'union' | 'intersection'",
  'type GeometryResponse = { id: number; geometry?: Polygon | MultiPolygon; error?: string }',
  'let geometryWorker: Worker | undefined',
  'let nextGeometryRequestId = 0',
  'const pendingGeometryRequests = new Map<number, {',
  '  resolve: (geometry: Polygon | MultiPolygon | undefined) => void',
  '  reject: (cause: Error) => void',
  '}>()',
  'const getGeometryWorker = () => {',
  '  if (geometryWorker) return geometryWorker',
  "  geometryWorker = new Worker(new URL('./land-analysis.worker.ts', import.meta.url), { type: 'module' })",
  '  geometryWorker.onmessage = ({ data }: MessageEvent<GeometryResponse>) => {',
  '    const pending = pendingGeometryRequests.get(data.id)',
  '    if (!pending) return',
  '    pendingGeometryRequests.delete(data.id)',
  '    if (data.error) pending.reject(new Error(data.error))',
  '    else pending.resolve(data.geometry)',
  '  }',
  '  geometryWorker.onerror = ({ message }) => {',
  "    const error = new Error(message || 'Geometry worker failed.')",
  '    for (const pending of pendingGeometryRequests.values()) pending.reject(error)',
  '    pendingGeometryRequests.clear()',
  '    geometryWorker?.terminate()',
  '    geometryWorker = undefined',
  '  }',
  '  return geometryWorker',
  '}',
  'const runGeometryOperation = (operation: GeometryOperation, geometries: Array<Polygon | MultiPolygon>) =>',
  '  new Promise<Polygon | MultiPolygon | undefined>((resolve, reject) => {',
  '    const id = nextGeometryRequestId++',
  '    pendingGeometryRequests.set(id, { resolve, reject })',
  '    getGeometryWorker().postMessage({ id, operation, geometries, precisionGrid })',
  '  })',
  'const stopGeometryWorker = () => {',
  '  geometryWorker?.terminate()',
  '  geometryWorker = undefined',
  '}',
  'const snapAnalysisGeometry = async (geometry: Polygon | MultiPolygon) => {',
  "  const snapped = await runGeometryOperation('snap', [geometry])",
  "  if (!snapped) throw new Error('Precision repair left no polygonal land.')",
  '  return snapped',
  '}',
  'const unionAnalysisGeometries = (geometries: Array<Polygon | MultiPolygon>) =>',
  "  geometries.length === 0 ? Promise.resolve(undefined) : runGeometryOperation('union', geometries)",
  'const intersectAnalysisGeometries = (first: Polygon | MultiPolygon, second: Polygon | MultiPolygon) =>',
  "  runGeometryOperation('intersection', [first, second])",
  'const mergeTileCoverage = async (tile: { x: number; y: number }, features: Feature<Polygon | MultiPolygon>[]) => {',
  '  const merged = await unionAnalysisGeometries(features.map(feature => toAnalysisGeometry(feature.geometry)))',
  '  return merged ? intersectAnalysisGeometries(merged, tileCoreGeometry(tile)) : undefined',
  '}',
  "const tileTemplate = basemapUrl.replace('.json?', '/{z}/{x}/{y}.mvt?')",
  `const tileKey = ({ x, y }: { x: number; y: number }) => \`\${x}/\${y}\``,
  'const tileUrlFor = ({ x, y }: { x: number; y: number }) =>',
  '  tileTemplate',
  "    .replace('{z}', String(analysisZoom))",
  "    .replace('{x}', String(x))",
  "    .replace('{y}', String(y))",
  'const tileRequests = new Map<string, Promise<Feature<Polygon | MultiPolygon>[]>>()',
  'const fetchNonLiveableLand = (tile: { x: number; y: number }) => {',
  '  const key = tileKey(tile)',
  '  const pending = tileRequests.get(key)',
  '  if (pending) return pending',
  '  const request = (async () => {',
  '    const response = await fetch(tileUrlFor(tile))',
  `    if (!response.ok && response.status !== 204) throw new Error(\`Tile request failed: \${response.status}\`)`,
  '    const landuse = response.status === 204',
  '      ? undefined',
  '      : new VectorTile(new PbfReader(await response.arrayBuffer())).layers.landuse',
  `    if (landuse && landuse.extent !== analysisExtent) throw new Error(\`Unexpected land-use tile extent: \${landuse.extent}\`)`,
  '    const features = landuse',
  '      ? Array.from({ length: landuse.length }, (_, featureIndex) => {',
  '        const feature = landuse.feature(featureIndex)',
  '        const kind = feature.properties.kind',
  "        if (typeof kind !== 'string' || !nonLiveableKinds.has(kind)) return []",
  '',
  '        const geojson = feature.toGeoJSON(tile.x, tile.y, analysisZoom) as Feature<Geometry>',
  "        const isArea = geojson.geometry.type === 'Polygon'",
  "          || geojson.geometry.type === 'MultiPolygon'",
  '        return isArea ? [geojson as Feature<Polygon | MultiPolygon>] : []',
  '      }).flatMap(features => features)',
  '      : []',
  '',
  '    return features',
  '  })().catch(cause => {',
  '    tileRequests.delete(key)',
  '    throw cause',
  '  })',
  '  tileRequests.set(key, request)',
  '  return request',
  '}',
  'const tileCoverageRequests = new Map<string, Promise<Polygon | MultiPolygon | undefined>>()',
  'const getTileCoverage = (tile: { x: number; y: number }) => {',
  '  const key = tileKey(tile)',
  '  const pending = tileCoverageRequests.get(key)',
  '  if (pending) return pending',
  '  const request = fetchNonLiveableLand(tile)',
  '    .then(features => mergeTileCoverage(tile, features))',
  '    .catch(cause => {',
  '      tileCoverageRequests.delete(key)',
  '      throw cause',
  '    })',
  '  tileCoverageRequests.set(key, request)',
  '  return request',
  '}',
  '',
  "map.addSource('processing-tile', {",
  "  type: 'geojson',",
  '  data: featureCollection([]),',
  '})',
  'map.addLayer({',
  "  id: 'processing-tile', type: 'line', source: 'processing-tile',",
  "  paint: { 'line-color': '#f4a261', 'line-width': 3 },",
  '})',
  "map.addSource('processing-district', {",
  "  type: 'geojson',",
  '  data: featureCollection([]),',
  '})',
  'map.addLayer({',
  "  id: 'processing-district', type: 'line', source: 'processing-district',",
  "  paint: { 'line-color': '#79e7d1', 'line-width': 4, 'line-dasharray': [2, 1] },",
  '})',
  "const tileOutlineSource = map.getSource('processing-tile') as GeoJSONSource",
  "const districtOutlineSource = map.getSource('processing-district') as GeoJSONSource",
  'let focusedDistrict: (typeof districts)[number] | undefined',
  'const showTileOutline = (tile: ProcessingTile) => {',
  '  tileOutlineSource.setData(bboxPolygon(tileBounds(tile)))',
  '  if (focusedDistrict !== tile.district) {',
  '    districtOutlineSource.setData(featureCollection([]))',
  '    focusedDistrict = tile.district',
  '    const [west, south, east, north] = bbox(tile.district) as Bounds',
  '    map.fitBounds([west, south, east, north], { padding: 48, duration: 500, maxZoom: 12 })',
  '  }',
  '}',
  'const clearProcessingOutlines = () => {',
  '  tileOutlineSource.setData(featureCollection([]))',
  '  districtOutlineSource.setData(featureCollection([]))',
  '}',
  '',
  'if (!savedResult) {',
  "  map.addSource('analysis-tiles', { type: 'geojson', data: featureCollection([]) })",
  '  map.addLayer({',
  "    id: 'analysis-tiles', type: 'fill', source: 'analysis-tiles',",
  "    paint: { 'fill-color': ['match', ['feature-state', 'status'], 'active', '#f4a261', 'complete', '#43c6ad', '#ffffff'], 'fill-opacity': ['match', ['feature-state', 'status'], 'active', 0.34, 'complete', 0.14, 0.025] },",
  '  }, firstLabelLayerId)',
  '  map.addLayer({',
  "    id: 'analysis-tiles-outline', type: 'line', source: 'analysis-tiles',",
  "    paint: { 'line-color': ['match', ['feature-state', 'status'], 'active', '#f4a261', 'complete', '#43c6ad', '#ffffff'], 'line-opacity': ['match', ['feature-state', 'status'], 'active', 1, 'complete', 0.45, 0.12], 'line-width': ['match', ['feature-state', 'status'], 'active', 2, 1] },",
  '  }, firstLabelLayerId)',
  '}',
  "const analysisTilesSource = map.getSource('analysis-tiles') as GeoJSONSource",
  'const showDistrictTiles = (tiles: ProcessingTile[]) => {',
  "  map.removeFeatureState({ source: 'analysis-tiles' })",
  '  analysisTilesSource.setData(featureCollection(tiles.map(tile => ({',
  '    ...bboxPolygon(tileBounds(tile)),',
  '    id: tileKey(tile),',
  '    properties: { tileKey: tileKey(tile) },',
  '  }))))',
  '}',
  "const setTileStatus = (tile: { x: number; y: number }, status: 'active' | 'complete') =>",
  "  map.setFeatureState({ source: 'analysis-tiles', id: tileKey(tile) }, { status })",
  '',
  "const progressPanel = document.createElement('section')",
  "progressPanel.id = 'land-analysis-progress'",
  "progressPanel.setAttribute('aria-live', 'polite')",
  "const progressPhase = document.createElement('p')",
  "progressPhase.className = 'land-analysis-progress-phase'",
  "const progressDistrict = document.createElement('h2')",
  "progressDistrict.className = 'land-analysis-progress-district'",
  "const progressCounts = document.createElement('dl')",
  "progressCounts.className = 'land-analysis-progress-counts'",
  `progressCounts.innerHTML = \`<div><dt>TILES</dt><dd data-tiles>0 / 0</dd></div><div aria-hidden="true">and</div><div><dt>PARTS</dt><dd data-parts>0 / –</dd></div><div aria-hidden="true">for</div><div><dt>DISTRICTS</dt><dd data-districts>0 / \${districts.length}</dd></div>\``,
  "const progress = document.createElement('div')",
  "progress.className = 'land-analysis-progress-bar'",
  "progress.setAttribute('role', 'progressbar')",
  "progress.setAttribute('aria-valuemin', '0')",
  "const progressFill = document.createElement('div')",
  "progressFill.className = 'land-analysis-progress-fill'",
  'progress.append(progressFill)',
  'progressPanel.append(progressPhase, progressDistrict, progressCounts, progress)',
  'if (!savedResult) document.body.append(progressPanel)',
  'const progressNode = { phase: progressPhase, district: progressDistrict, progress, progressFill }',
  'const setProgress = (',
  '  node: { phase: HTMLParagraphElement; district: HTMLHeadingElement; progress: HTMLDivElement; progressFill: HTMLDivElement },',
  '  completed: number, total: number, district: (typeof districts)[number], phase: string,',
  `  countLabel = \`\${completed.toLocaleString()} / \${total.toLocaleString()}\`,`,
  ') => {',
  "  node.progress.setAttribute('aria-valuemax', String(total))",
  "  node.progress.setAttribute('aria-valuenow', String(completed))",
  "  node.progress.setAttribute('aria-valuetext', countLabel)",
  `  node.progressFill.style.transform = \`scaleX(\${total === 0 ? 0 : completed / total})\``,
  '  node.phase.textContent = phase',
  '  node.district.textContent = district.properties.districtName',
  '}',
  'const setProgressCounts = (completedTiles: number, totalTiles: number, completedParts: number, totalParts: number | undefined, completedDistricts: number) => {',
  `  progressCounts.querySelector('[data-tiles]')!.textContent = \`\${completedTiles.toLocaleString()} / \${totalTiles.toLocaleString()}\``,
  `  progressCounts.querySelector('[data-parts]')!.textContent = \`\${completedParts.toLocaleString()} / \${totalParts?.toLocaleString() ?? '–'}\``,
  `  progressCounts.querySelector('[data-districts]')!.textContent = \`\${completedDistricts.toLocaleString()} / \${districts.length.toLocaleString()}\``,
  '}',
  'const districtTiles = districts.map(tilesCovering)',
  'const totalAnalysisTiles = districtTiles.reduce((total, tiles) => total + tiles.length, 0)',
  'const tilesBeforeDistrict = (district: (typeof districts)[number]) =>',
  '  districtTiles',
  '    .slice(0, districts.indexOf(district))',
  '    .reduce((total, tiles) => total + tiles.length, 0)',
  "const showTileProgress = (completed: number, tile: ProcessingTile, phase = 'DOWNLOAD, SNAP & MERGE TILE') => {",
  '  const completedTiles = tilesBeforeDistrict(tile.district) + completed',
  '  const totalTiles = districtTiles[districts.indexOf(tile.district)]!.length',
  '  setProgressCounts(completed, totalTiles, 0, undefined, districts.indexOf(tile.district))',
  '  setProgress(progressNode, completedTiles, totalAnalysisTiles, tile.district, phase)',
  '}',
  "const showDistrictProgress = (completed: number, district: (typeof districts)[number], completedParts = 0, totalParts = 0, phase = 'INTERSECT TILE COVERAGE') => {",
  '  if (focusedDistrict !== district) {',
  '    focusedDistrict = district',
  '    const [west, south, east, north] = bbox(district) as Bounds',
  '    map.fitBounds([west, south, east, north], { padding: 48, duration: 500, maxZoom: 12 })',
  '  }',
  '  districtOutlineSource.setData(district)',
  '  const completedTiles = tilesBeforeDistrict(district) + districtTiles[districts.indexOf(district)]!.length',
  '  const totalTiles = districtTiles[districts.indexOf(district)]!.length',
  '  setProgressCounts(totalTiles, totalTiles, completedParts, totalParts, completed)',
  '  setProgress(progressNode, completedTiles, totalAnalysisTiles, district, phase)',
  '}',
].join('\n')

export const createUrbanDensitySetupZ14TileFetcherCode = (
  renderer: CreateAMapRenderer = 'maplibre',
) =>
  [
    `import type { GeoJSONSource } from '${renderer === 'mapbox' ? 'mapbox-gl' : 'maplibre-gl'}'`,
    urbanDensitySetupZ14TileFetcherBody,
  ].join('\n')

export const urbanDensitySetupZ14TileFetcherCode =
  createUrbanDensitySetupZ14TileFetcherCode()

export const urbanDensitySetupZ14TileFetcherDisplayCode =
  urbanDensitySetupZ14TileFetcherCode

export const createUrbanDensitySetupZ14TileFetcherDisplayCode = (
  renderer: CreateAMapRenderer = 'maplibre',
) => createUrbanDensitySetupZ14TileFetcherCode(renderer)

export const urbanDensitySetupZ14TileFetcherCss = [
  '#land-analysis-progress {',
  '  --land-analysis-progress-font: ui-monospace, monospace;',
  '  --land-analysis-progress-text: rgba(255, 255, 255, 0.85);',
  '  position: fixed; left: 50%; bottom: 1rem; z-index: 1;',
  '  width: min(calc(100% - 2rem), 29rem); transform: translateX(-50%);',
  '  border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(16, 21, 26, 0.95);',
  '  padding: 1rem 1.25rem; color: white; text-align: center; font-family: system-ui, sans-serif;',
  '}',
  '#land-analysis-progress :is(.land-analysis-progress-phase, .land-analysis-progress-district, .land-analysis-progress-counts) {',
  '  font-family: var(--land-analysis-progress-font);',
  '}',
  '#land-analysis-progress .land-analysis-progress-counts {',
  '  font-variant-numeric: tabular-nums;',
  '}',
  '#land-analysis-progress .land-analysis-progress-phase {',
  '  margin: 0; color: rgba(255, 255, 255, 0.7);',
  '  font-size: 0.68rem; font-weight: 700; letter-spacing: 0.12em;',
  '}',
  '#land-analysis-progress .land-analysis-progress-district {',
  '  margin: 0.375rem 0 0; padding-top: 0.125rem; color: #79e7d1;',
  '  font-size: 2rem; font-weight: 700; letter-spacing: -0.025em; line-height: 1;',
  '}',
  '#land-analysis-progress .land-analysis-progress-counts {',
  '  display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; align-items: end; gap: 0;',
  '  margin: 0.75rem 0 0;',
  '}',
  '#land-analysis-progress .land-analysis-progress-counts dt {',
  '  color: rgba(255, 255, 255, 0.55); font-size: 0.68rem; font-weight: 700; letter-spacing: 0.12em;',
  '}',
  '#land-analysis-progress .land-analysis-progress-counts dd {',
  '  margin: 0.125rem 0 0; color: var(--land-analysis-progress-text); font-size: 1rem; font-weight: 600;',
  '}',
  '#land-analysis-progress .land-analysis-progress-counts [aria-hidden="true"] {',
  '  padding-bottom: 0.125rem; color: rgba(255, 255, 255, 0.45); font-size: 0.75rem; font-weight: 700;',
  '}',
  '#land-analysis-progress .land-analysis-progress-bar {',
  '  display: block; width: 100%; height: 0.5rem; margin-top: 1rem; overflow: hidden;',
  '  background: rgb(255 255 255 / 16%);',
  '}',
  '#land-analysis-progress .land-analysis-progress-fill {',
  '  position: relative; width: 100%; height: 100%; overflow: hidden; transform: scaleX(0);',
  '  transform-origin: left; background: #5ad8a6; transition: transform 180ms ease-out; will-change: transform;',
  '}',
  '#land-analysis-progress .land-analysis-progress-fill::after {',
  "  position: absolute; inset: 0; width: 45%; content: ''; transform: translateX(-160%);",
  '  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 16%), rgb(255 255 255 / 75%), rgb(255 255 255 / 16%), transparent);',
  '  animation: land-analysis-progress-glow 1.6s ease-in-out infinite;',
  '}',
  '@keyframes land-analysis-progress-glow {',
  '  to { transform: translateX(320%); }',
  '}',
  '@media (prefers-reduced-motion: reduce) {',
  '  #land-analysis-progress .land-analysis-progress-fill { transition: none; }',
  '  #land-analysis-progress .land-analysis-progress-fill::after { animation: none; }',
  '}',
  '@media (max-width: 640px) {',
  '  #land-analysis-progress { box-sizing: border-box; bottom: 0; left: 0; z-index: 11; width: 100%; padding: .75rem 1rem; transform: none; }',
  '  #land-analysis-progress .land-analysis-progress-phase { font-size: .58rem; letter-spacing: .08em; overflow-wrap: anywhere; }',
  '  #land-analysis-progress .land-analysis-progress-district { font-size: clamp(1.5rem, 8vw, 2rem); overflow-wrap: anywhere; }',
  '  #land-analysis-progress .land-analysis-progress-counts { margin-top: .625rem; }',
  '  #land-analysis-progress .land-analysis-progress-bar { margin-top: .75rem; }',
  '}',
].join('\n')

export const urbanDensityCollectNonLiveableLandCode = [
  'if (!savedResult) {',
  '  const pauseForAir = () => new Promise<void>(resolve => window.setTimeout(resolve, 0))',
  "  const completedExclusionSource = map.getSource('completed-exclusions') as GeoJSONSource",
  '  map.addLayer({',
  "    id: 'completed-exclusions', type: 'fill', source: 'completed-exclusions',",
  "    paint: { 'fill-color': ['match', ['get', 'area'], 'Hong Kong Island', '#5b8ff9', 'Kowloon', '#f6bd16', 'New Territories', '#5ad8a6', '#e76f51'], 'fill-opacity': 0.72 },",
  '  }, firstLabelLayerId)',
  '  map.addLayer({',
  "    id: 'completed-exclusions-outline', type: 'line', source: 'completed-exclusions',",
  "    paint: { 'line-color': ['match', ['get', 'area'], 'Hong Kong Island', '#5b8ff9', 'Kowloon', '#f6bd16', 'New Territories', '#5ad8a6', '#e76f51'], 'line-width': 2 },",
  '  }, firstLabelLayerId)',
  '',
  '  for (const [districtIndex, district] of districts.entries()) {',
  '    const tiles = tilesCovering(district)',
  '    showDistrictTiles(tiles)',
  '    const queuedCoverages = new Map<number, Promise<Polygon | MultiPolygon | undefined>>()',
  '    const queueCoverage = (index: number) => {',
  '      const tile = tiles[index]',
  '      if (tile) queuedCoverages.set(index, getTileCoverage(tile))',
  '    }',
  '    for (let index = 0; index < Math.min(2, tiles.length); index += 1) queueCoverage(index)',
  '    const tileCoverages: Array<Polygon | MultiPolygon> = []',
  '    for (const [index, tile] of tiles.entries()) {',
  '      showTileOutline(tile)',
  "      setTileStatus(tile, 'active')",
  '      showTileProgress(index, tile)',
  '      const coverage = await queuedCoverages.get(index)!',
  '      queuedCoverages.delete(index)',
  '      queueCoverage(index + 2)',
  '      if (coverage) tileCoverages.push(coverage)',
  "      setTileStatus(tile, 'complete')",
  '      showTileProgress(index + 1, tile)',
  '      await new Promise(requestAnimationFrame)',
  '    }',
  '    tileOutlineSource.setData(featureCollection([]))',
  '    showDistrictProgress(districtIndex, district, 0, tileCoverages.length)',
  '    const districtGeometry = await snapAnalysisGeometry(toAnalysisGeometry(district.geometry))',
  '    const clippedExclusions: Array<Polygon | MultiPolygon> = []',
  '    for (const [tileIndex, coverage] of tileCoverages.entries()) {',
  '      const clipped = await intersectAnalysisGeometries(coverage, districtGeometry)',
  '      if (clipped) clippedExclusions.push(clipped)',
  '      showDistrictProgress(districtIndex, district, tileIndex + 1, tileCoverages.length)',
  '      if (tileIndex % 4 === 3) await pauseForAir()',
  '    }',
  "    if (clippedExclusions.length === 0) throw new Error('No excluded land overlaps this District.')",
  "    showDistrictProgress(districtIndex, district, tileCoverages.length, tileCoverages.length, 'DISSOLVE DISTRICT COVERAGE')",
  '    const excludedGeometry = await unionAnalysisGeometries(clippedExclusions)',
  "    if (!excludedGeometry) throw new Error('No excluded land remains after the District dissolve.')",
  '    excludedDistrictLand.push({ ...district, geometry: fromAnalysisGeometry(excludedGeometry) })',
  '    completedExclusionSource.setData(featureCollection(excludedDistrictLand))',
  "    showDistrictProgress(districtIndex + 1, district, tileCoverages.length, tileCoverages.length, 'DISTRICT COMPLETE')",
  '    await pauseForAir()',
  '  }',
  '  clearProcessingOutlines()',
  "  map.setLayoutProperty('analysis-tiles', 'visibility', 'none')",
  "  map.setLayoutProperty('analysis-tiles-outline', 'visibility', 'none')",
  '  stopGeometryWorker()',
  '  progressPanel.remove()',
  '}',
].join('\n')

export const urbanDensityCollectNonLiveableLandDisplayCode =
  urbanDensityCollectNonLiveableLandCode
    .split('\n')
    .slice(1, -1)
    .map(line => (line.startsWith('  ') ? line.slice(2) : line))
    .join('\n')

export const urbanDensityLiveableAreaCode = [
  'if (!savedResult) {',
  'const analysisResult = {',
  '  districts,',
  '  excludedDistrictLand: featureCollection(excludedDistrictLand),',
  '}',
  "const compressedResult = await new Response(new Blob([JSON.stringify(analysisResult)]).stream().pipeThrough(new CompressionStream('gzip'))).blob()",
  "const resultDialog = document.createElement('dialog')",
  "resultDialog.id = 'land-analysis-result'",
  "const resultTitle = document.createElement('h2')",
  "resultTitle.textContent = 'Calculation complete'",
  "resultTitle.className = 'land-analysis-result-title'",
  "const download = document.createElement('a')",
  "download.textContent = 'Download land-analysis.json.gz'",
  "download.className = 'land-analysis-result-download'",
  'download.href = URL.createObjectURL(compressedResult)',
  "download.download = 'land-analysis.json.gz'",
  'resultDialog.append(resultTitle, download)',
  'document.body.append(resultDialog)',
  'resultDialog.showModal()',
  'savedResult = analysisResult',
  '}',
].join('\n')

export const urbanDensityLiveableAreaDisplayCode = urbanDensityLiveableAreaCode

export const urbanDensityLiveableAreaCss = [
  '#land-analysis-result {',
  '  --land-analysis-result-accent: #79e7d1;',
  '  --land-analysis-result-font: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;',
  '  margin: auto; width: min(calc(100vw - 2rem), 32.5rem);',
  '  border: 1px solid rgba(255, 255, 255, 0.2); background: #171c25; padding: 1.25rem;',
  '  box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);',
  '}',
  '#land-analysis-result :is(.land-analysis-result-title, .land-analysis-result-download) {',
  '  font-family: var(--land-analysis-result-font); font-weight: 700;',
  '}',
  '#land-analysis-result .land-analysis-result-title {',
  '  margin: 0 0 1rem; color: var(--land-analysis-result-accent); font-size: 0.875rem;',
  '  letter-spacing: 0.08em; line-height: 1.25rem; text-transform: uppercase;',
  '}',
  '#land-analysis-result .land-analysis-result-download {',
  '  display: block; border: 1px solid var(--land-analysis-result-accent); background: #43c6ad;',
  '  padding: 0.625rem 1rem; color: #10151a; font-size: 1rem; line-height: 1.5rem;',
  '  text-align: center; text-decoration: none;',
  '}',
].join('\n')

export const urbanDensityLiveableAreaMapCode = [
  'if (savedResult) {',
  "const liveableFirstLabelLayerId = map.getStyle().layers.find(layer => layer.type === 'symbol')?.id",
  '',
  'const { excludedDistrictLand } = savedResult',
  "map.addSource('liveable-districts', { type: 'geojson', data: featureCollection(savedResult.districts) })",
  'map.addLayer({',
  "  id: 'liveable-districts', type: 'fill', source: 'liveable-districts',",
  "  paint: { 'fill-antialias': false, 'fill-color': '#36a269', 'fill-opacity': 0, 'fill-opacity-transition': { duration: 700 } },",
  '}, liveableFirstLabelLayerId)',
  '',
  "map.addSource('excluded-districts', { type: 'geojson', data: excludedDistrictLand })",
  "map.addLayer({ id: 'excluded-districts', type: 'fill', source: 'excluded-districts',",
  "  paint: { 'fill-antialias': false, 'fill-color': '#ff503d', 'fill-opacity': 0, 'fill-opacity-transition': { duration: 700 } },",
  '}, liveableFirstLabelLayerId)',
  "map.addLayer({ id: 'excluded-districts-outline', type: 'line', source: 'excluded-districts',",
  "  paint: { 'line-color': '#8c3427', 'line-opacity': 0, 'line-opacity-transition': { duration: 700 }, 'line-width': 1 },",
  '}, liveableFirstLabelLayerId)',
  '',
  "const landUseHeader = document.createElement('div')",
  "landUseHeader.id = 'land-use-header'",
  "const landUseTitle = document.createElement('h2')",
  "landUseTitle.textContent = 'Population Density of Liveable Land Area'",
  "const landUseLegend = document.createElement('ul')",
  "landUseLegend.id = 'land-use-legend'",
  "landUseLegend.setAttribute('aria-label', 'Land-use legend')",
  'landUseLegend.innerHTML = `',
  '  <li data-kind="liveable"><span aria-hidden="true"></span>LIVEABLE LAND</li>',
  '  <li data-kind="excluded"><span aria-hidden="true"></span>EXCLUDED LAND</li>',
  '`',
  'landUseHeader.append(landUseTitle, landUseLegend)',
  'document.body.append(landUseHeader)',
  '',
  "requestAnimationFrame(() => { map.setPaintProperty('excluded-districts', 'fill-opacity', 0.62); map.setPaintProperty('liveable-districts', 'fill-opacity', 0.48); map.setPaintProperty('excluded-districts-outline', 'line-opacity', 1) })",
  '}',
].join('\n')

export const urbanDensityLiveableAreaMapDisplayCode = urbanDensityLiveableAreaMapCode

export const urbanDensityLiveableMetricsCode = [
  'if (savedResult) {',
  'const excludedDistrictFeatures = savedResult.excludedDistrictLand.features',
  'const liveableTotalsByArea = excludedDistrictFeatures.reduce((totals, district) => {',
  '  const { area: areaName, population, landAreaSqKm } = district.properties',
  '  const total = totals.get(areaName) ?? { name: areaName, population: 0, landAreaSqKm: 0, excludedLandAreaSqKm: 0 }',
  '  total.population += population',
  '  total.landAreaSqKm += landAreaSqKm',
  '  total.excludedLandAreaSqKm += area(district) / 1_000_000',
  '  totals.set(areaName, total)',
  '  return totals',
  '}, new Map<string, { name: string; population: number; landAreaSqKm: number; excludedLandAreaSqKm: number }>())',
  '',
  'const liveableMetrics = [...liveableTotalsByArea.values()]',
  '  .map(total => {',
  '    const liveableLandAreaSqKm = total.landAreaSqKm - total.excludedLandAreaSqKm',
  '    return {',
  '      ...total,',
  '      liveableLandAreaSqKm,',
  '      peoplePerSqKm: total.population / liveableLandAreaSqKm,',
  '      liveablePercentage: (liveableLandAreaSqKm / total.landAreaSqKm) * 100,',
  '    }',
  '  })',
  '  .sort((first, second) => first.name.localeCompare(second.name))',
  '',
  "const liveableMetricBar = document.createElement('section')",
  "liveableMetricBar.id = 'urban-density-metrics'",
  "liveableMetricBar.setAttribute('aria-label', 'Liveable-area population density')",
  'liveableMetricBar.innerHTML = liveableMetrics.map(metric => `',
  `  <article data-area="\${metric.name}"><p>\${metric.name}</p><strong>\${Math.round(metric.peoplePerSqKm).toLocaleString()}</strong>`,
  '  <span>people per km²</span><p class="secondary-stats">',
  `  <strong>\${metric.liveablePercentage.toFixed(0)}%</strong> or`,
  `  <strong>\${metric.liveableLandAreaSqKm.toFixed(1)} km²</strong> liveable land</p></article>`,
  "`).join('')",
  'document.body.append(liveableMetricBar)',
  '}',
].join('\n')

export const urbanDensityLiveableMetricsDisplayCode = urbanDensityLiveableMetricsCode

export const urbanDensityMetricsCode = [
  'if (!savedResult) {',
  "const metricBar = document.createElement('section')",
  "metricBar.id = 'urban-density-metrics'",
  "metricBar.setAttribute('aria-label', 'Urban population density')",
  'metricBar.innerHTML = metrics.map(metric => `',
  `  <article data-area="\${metric.name}">`,
  `    <p>\${metric.name}</p>`,
  `    <strong>\${Math.round(metric.peoplePerSqKm).toLocaleString()}</strong>`,
  `    <span class="density-detail"><span>people per km²</span><span class="density-area-connector"> on </span><strong>\${metric.landAreaSqKm.toFixed(1)}</strong><span> km²</span></span>`,
  '  </article>',
  "`).join('')",
  'document.body.append(metricBar)',
  '}',
].join('\n')

export const urbanDensityMetricsDisplayCode = urbanDensityMetricsCode

export const createUrbanDensityMetricsCss = (appearance: 'light' | 'dark') => {
  const isDark = appearance === 'dark'
  const cardBorder = isDark ? 'rgb(255 255 255 / 20%)' : '#bdc7cd'
  const cardBackground = isDark ? 'rgb(16 21 26 / 92%)' : 'rgb(255 249 237 / 92%)'
  const cardText = isDark ? '#fff' : '#10151a'
  const mutedText = isDark ? 'rgb(255 255 255 / 65%)' : 'rgb(16 21 26 / 65%)'
  const attributionIconColour = isDark ? '%23fff' : '%2310151a'
  const areaTitle = (colour: string) => (isDark ? colour : cardText)

  return [
    '#urban-density-metrics {',
    '  position: fixed; bottom: 3.25rem; left: 50%; z-index: 10; width: min(calc(100% - 4rem), 780px); transform: translateX(-50%);',
    '  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem;',
    "  font-family: 'Plus Jakarta Sans', 'Segoe UI', ui-sans-serif, system-ui, sans-serif;",
    '}',
    `#urban-density-metrics article { padding: 1rem 1.5rem; border: 1px solid ${cardBorder}; background: ${cardBackground}; color: ${cardText}; box-shadow: 0 12px 32px rgb(0 0 0 / 24%); animation: density-card-enter 360ms ease-out both; }`,
    '#urban-density-metrics article:nth-child(2) { animation-delay: 80ms; }',
    '#urban-density-metrics article:nth-child(3) { animation-delay: 160ms; }',
    '#urban-density-metrics p { margin: 0; font-size: .875rem; }',
    `#urban-density-metrics article[data-area="Hong Kong Island"] > p { color: ${areaTitle('#5b8ff9')}; }`,
    `#urban-density-metrics article[data-area="Kowloon"] > p { color: ${areaTitle('#f6bd16')}; }`,
    `#urban-density-metrics article[data-area="New Territories"] > p { color: ${areaTitle('#5ad8a6')}; }`,
    '#urban-density-metrics article > strong { display: block; margin: .25rem 0; font-size: 2rem; font-weight: 700; line-height: 1; letter-spacing: -.025em; font-variant-numeric: tabular-nums; }',
    '#urban-density-metrics .density-detail { display: block; font-size: .75rem; line-height: 1.25; }',
    `#urban-density-metrics .density-area-connector, #urban-density-metrics .secondary-stats { color: ${mutedText}; }`,
    `#urban-density-metrics .density-detail strong, #urban-density-metrics .secondary-stats strong { font-weight: 700; color: ${cardText}; }`,
    '#urban-density-metrics .secondary-stats { margin: .55rem 0 0; font-size: .75rem; }',
    `#map .maplibregl-ctrl-attrib { background-color: ${cardBackground}; color: ${cardText}; }`,
    `#map .maplibregl-ctrl-attrib a { color: ${cardText}; }`,
    `#map .maplibregl-ctrl-attrib-button { background-color: transparent; background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20fill%3D%22${attributionIconColour}%22%20fill-rule%3D%22evenodd%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20d%3D%22M4%2010a6%206%200%201%200%2012%200%206%206%200%201%200-12%200m5-3a1%201%200%201%200%202%200%201%201%200%201%200-2%200m0%203a1%201%200%201%201%202%200v3a1%201%200%201%201-2%200%22%2F%3E%3C%2Fsvg%3E"); background-position: center; background-repeat: no-repeat; background-size: 24px 24px; }`,
    '@keyframes density-card-enter { from { opacity: 0; transform: translateY(0.5rem); } to { opacity: 1; transform: translateY(0); } }',
    '@media (prefers-reduced-motion: reduce) { #urban-density-metrics article { animation: none; } }',
    '@media (max-width: 640px) {',
    '  #urban-density-metrics { inset: auto .75rem 2.5rem; z-index: 12; width: auto; transform: none; grid-template-columns: 1fr; gap: .5rem; }',
    '  #urban-density-metrics article { padding: .75rem 1rem; }',
    '  #urban-density-metrics p { font-size: .75rem; }',
    '  #urban-density-metrics article > strong { margin: .2rem 0; font-size: 1.35rem; }',
    '  #urban-density-metrics .density-detail { font-size: .68rem; line-height: 1.25; }',
    '}',
    '#land-use-header {',
    '  position: fixed; top: .75rem; left: 50%; z-index: 10; transform: translateX(-50%);',
    '  display: flex; align-items: stretch; gap: .75rem; pointer-events: none;',
    '  font-family: ui-monospace, monospace; font-size: .68rem; font-weight: 600; letter-spacing: .08em; text-transform: uppercase;',
    '}',
    '#land-use-header .land-use-title {',
    '  display: grid; max-inline-size: 13rem; place-items: center; margin: 0; padding: .375rem .75rem;',
    '  border-left: .25rem solid #36a269; background: rgb(16 21 26 / 90%); color: #f6f2ea;',
    '  font: inherit; line-height: 1.35; text-align: center; box-shadow: 0 1px 2px rgb(0 0 0 / 18%);',
    '}',
    '#land-use-legend {',
    '  display: grid; grid-template-rows: repeat(2, minmax(0, 1fr)); gap: .375rem;',
    '  margin: 0; padding: 0; list-style: none;',
    '}',
    '#land-use-legend li {',
    '  display: flex; align-items: center; gap: .375rem; padding: .25rem .5rem;',
    '  border-radius: .125rem; background: rgb(16 21 26 / 90%); box-shadow: 0 1px 2px rgb(0 0 0 / 18%);',
    '}',
    '#land-use-legend li > span { width: .5rem; height: .5rem; flex: none; }',
    '#land-use-legend [data-kind="liveable"] { color: #36a269; }',
    '#land-use-legend [data-kind="liveable"] > span { background: #36a269; }',
    '#land-use-legend [data-kind="excluded"] { color: #ffad9d; }',
    '#land-use-legend [data-kind="excluded"] > span { background: #e76f51; }',
  ].join('\n')
}
