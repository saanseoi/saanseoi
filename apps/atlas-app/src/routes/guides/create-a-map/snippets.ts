import type { CreateAMapSelectionQuery } from '#lib/guides/createAMapSelections.js'

export type CreateAMapRenderer = 'maplibre' | 'mapbox' | 'leaflet'

export type CreateAMapRendererReference = {
  code: string
  installCommand: string
  label: string
  setupInstruction?: string
  stylesheetCode: string
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
      "import { Map } from 'maplibre-gl'",
      "import 'maplibre-gl/dist/maplibre-gl.css'",
      "import './style.css'",
      '',
      "document.querySelector<HTMLDivElement>('#app')!.innerHTML = '<div id=\"map\"></div>'",
      '',
      'new Map({',
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
      "// Mapbox Standard is Mapbox's hosted, ready-to-use basemap style.",
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

export const getCreateAMapRendererReference = (renderer: CreateAMapRenderer) =>
  rendererReferences[renderer]

export const createAMapRendererBasemapCode = (
  renderer: CreateAMapRenderer,
  _styleUrl: string,
  tilejsonUrl: string,
) =>
  renderer === 'leaflet'
    ? [
        "import L from 'leaflet'",
        "import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'",
        "import 'maplibre-gl/dist/maplibre-gl.css'",
        "import './style.css'",
        '',
        'const accessToken = import.meta.env.VITE_SAANSEOI_API_KEY',
        'const urlSafeApiKey = encodeURIComponent(accessToken)',
        `const basemapBaseUrl = '${tilejsonUrl}'`,
        `const basemapUrl = \`\${basemapBaseUrl}?access_token=\${urlSafeApiKey}\``,
        '',
        "document.querySelector<HTMLDivElement>('#app')!.innerHTML = '<div id=\"map\"></div>'",
        '',
        "const map = L.map('map').setView([22.3193, 114.1694], 11)",
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
        `import ${renderer === 'mapbox' ? "mapboxgl from 'mapbox-gl'" : "{ Map } from 'maplibre-gl'"}`,
        `import '${renderer === 'mapbox' ? 'mapbox-gl' : 'maplibre-gl'}/dist/${renderer === 'mapbox' ? 'mapbox-gl' : 'maplibre-gl'}.css'`,
        "import './style.css'",
        '',
        'const accessToken = import.meta.env.VITE_SAANSEOI_API_KEY',
        'const urlSafeApiKey = encodeURIComponent(accessToken)',
        `const basemapBaseUrl = '${tilejsonUrl}'`,
        `const basemapUrl = \`\${basemapBaseUrl}?access_token=\${urlSafeApiKey}\``,
        '',
        "document.querySelector<HTMLDivElement>('#app')!.innerHTML = '<div id=\"map\"></div>'",
        '',
        `new ${renderer === 'mapbox' ? 'mapboxgl.Map' : 'Map'}({`,
        "  container: 'map',",
        '  center: [114.1694, 22.3193],',
        '  zoom: 11.5,',
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

export const createAMapRendererStyleCode = (
  renderer: CreateAMapRenderer,
  styleUrl: string,
  tilejsonUrl: string,
) =>
  renderer === 'leaflet'
    ? [
        "import L from 'leaflet'",
        "import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'",
        "import 'maplibre-gl/dist/maplibre-gl.css'",
        "import './style.css'",
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
        "const map = L.map('map').setView([22.3193, 114.1694], 11)",
        'maplibreGL({',
        '  style,',
        '}).addTo(map)',
      ].join('\n')
    : [
        `import ${renderer === 'mapbox' ? "mapboxgl from 'mapbox-gl'" : "{ Map } from 'maplibre-gl'"}`,
        `import '${renderer === 'mapbox' ? 'mapbox-gl' : 'maplibre-gl'}/dist/${renderer === 'mapbox' ? 'mapbox-gl' : 'maplibre-gl'}.css'`,
        "import './style.css'",
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
        `new ${renderer === 'mapbox' ? 'mapboxgl.Map' : 'Map'}({`,
        "  container: 'map',",
        '  center: [114.1694, 22.3193],',
        '  zoom: 11.5,',
        '  style,',
        ...(renderer === 'maplibre'
          ? ['  attributionControl: { compact: true },']
          : []),
        '})',
      ].join('\n')

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
    ? [
        'bun run build',
        'bunx wrangler login',
        'bunx wrangler deploy --assets=dist',
      ].join('\n')
    : hosting === 'github-pages'
      ? [
          'bun run build',
          '# For a project site, set Vite’s base path before building. See the guide below.',
          'bunx gh-pages -d dist',
        ].join('\n')
      : hosting === 'vercel'
        ? ['bun run build', 'bunx vercel --prod'].join('\n')
        : hosting === 'netlify'
          ? ['bunx netlify deploy --build --prod'].join('\n')
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

export const mapboxTokenCode =
  'bun -e \'import { createInterface } from "node:readline/promises"; const rl=createInterface({input:process.stdin,output:process.stdout}); const token=await rl.question("Paste your public Mapbox token: "); rl.close(); await Bun.write(".env","VITE_MAPBOX_TOKEN="+token.trim()+"\\n")\''

export const getRendererTerminalCommand = (operatingSystem?: string) =>
  operatingSystem === 'windows'
    ? 'Set-Location ~/saanseoi-project'
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

export const createUrbanDensityMapReadyCode = (styleUrl: string) =>
  [
    "import { Map as MapLibreMap, type GeoJSONSource } from 'maplibre-gl'",
    "import 'maplibre-gl/dist/maplibre-gl.css'",
    "import './style.css'",
    '',
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
    "document.querySelector<HTMLDivElement>('#app')!.innerHTML = '<div id=\"map\"></div>'",
    '',
    'const map = new MapLibreMap({',
    "  container: 'map',",
    '  center: [114.16, 22.32],',
    '  zoom: 11.5,',
    '  style,',
    '  attributionControl: { compact: true },',
    '})',
  ].join('\n')

export const createUrbanDensityStatsCode = (
  apiBaseUrl: string,
  savedResultComment: string,
) =>
  [
    ...savedResultComment.split('\n').map(line => `// ${line}`),
    'let savedResult',
    "const savedResultUrl = new URL('./land-analysis.json', import.meta.url)",
    'try {',
    '  const savedResultResponse = await fetch(savedResultUrl)',
    "  if (savedResultResponse.headers.get('content-type')?.includes('application/json')) {",
    '    savedResult = await savedResultResponse.json()',
    '  }',
    '} catch {}',
    '',
    `const apiBaseUrl = '${apiBaseUrl}'`,
    'let populationByDistrict: Record<string, string> = {}',
    'let landAreaByDistrict: Record<string, string> = {}',
    'let districts = savedResult?.districts ?? []',
    'let metrics = savedResult?.metrics ?? []',
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
    '  return (await response.json()).values as Record<string, string>',
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
  'if (!savedResult) {',
  "const divisionsEndpoint = '/divisions/v0'",
  'const divisionsUrl = new URL(divisionsEndpoint, apiBaseUrl)',
  "divisionsUrl.searchParams.set('filter[level]', '2')",
  "divisionsUrl.searchParams.set('include', 'hierarchy,areas:hkgov-censtatd-landclipped@2021')",
  "divisionsUrl.searchParams.set('transform', 'simplified')",
  "const divisionsResponse = await fetch(divisionsUrl, { headers: { 'x-api-key': accessToken } })",
  'if (!divisionsResponse.ok) {',
  '  const error = await divisionsResponse.json().catch(() => null)',
  `  const message = typeof error?.message === 'string' ? \`: \${error.message}\` : ''`,
  `  throw new Error(\`Divisions request failed: \${divisionsResponse.status}\${message}\`)`,
  '}',
  'const response = await divisionsResponse.json()',
  '',
  'districts = response.data.flatMap(division => {',
  '  const code = division.attributes.divisionCode',
  "  const area = division.relationships.hierarchy.data.find(item => item.meta?.subType === 'area')",
  "  const geometry = response.included.find(item => item.type === 'division-areas' && item.attributes.divisionId === division.id)!.attributes.geometry",
  '',
  '  return {',
  "    type: 'Feature' as const,",
  '    properties: { districtCode: code, districtName: division.attributes.i18n?.en?.name ?? code, area: area.meta.name, population: Number(populationByDistrict[code]), landAreaSqKm: Number(landAreaByDistrict[code]) },',
  '    geometry,',
  '  }',
  '})',
  '',
  '// Add the District records into their Area totals.',
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
  'if (!savedResult) {',
  '// We are about to replace the district-land comparison, so hide its labels first.',
  "document.querySelector('#urban-density-metrics').remove()",
  '',
  "await new Promise<void>(resolve => (map.loaded() ? resolve() : map.once('load', resolve)))",
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
  '',
  '}',
].join('\n')

export const urbanDensityMapDisplayCode = urbanDensityMapCode

export const urbanDensityTurfInstallCode = 'bun add @turf/turf @mapbox/vector-tile pbf'

export const urbanDensitySetupZ14TileFetcherCode = [
  "import { VectorTile } from '@mapbox/vector-tile'",
  "import { PbfReader } from 'pbf'",
  "import { area, bbox, bboxPolygon, booleanIntersects, booleanValid, cleanCoords, difference, featureCollection, flatten, intersect, union, unkinkPolygon } from '@turf/turf'",
  "import type { Feature, MultiPolygon, Polygon } from 'geojson'",
  '',
  'const analysisZoom = 14',
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
  'const boundsOverlap = (first: Bounds, second: Bounds) =>',
  '  first[0] <= second[2] && first[2] >= second[0]',
  '    && first[1] <= second[3] && first[3] >= second[1]',
  'const tilesCovering = (district: (typeof districts)[number]) => {',
  '  const [west, south, east, north] = bbox(district)',
  '  const minX = Math.floor(longitudeToTile(west))',
  '  const maxX = Math.floor(longitudeToTile(east))',
  '  const minY = Math.floor(latitudeToTile(north))',
  '  const maxY = Math.floor(latitudeToTile(south))',
  '  return Array.from({ length: (maxX - minX + 1) * (maxY - minY + 1) }, (_, index) => ({',
  '    x: minX + (index % (maxX - minX + 1)),',
  '    y: minY + Math.floor(index / (maxX - minX + 1)),',
  '  })).filter(tile => booleanIntersects(district, bboxPolygon(tileBounds(tile))))',
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
  "const tileOutlineSource = map.getSource('processing-tile') as GeoJSONSource",
  'let focusedDistrict: (typeof districts)[number] | undefined',
  'const showTileOutline = (tile: ProcessingTile) => {',
  '  tileOutlineSource.setData(bboxPolygon(tileBounds(tile)))',
  '  if (focusedDistrict !== tile.district) {',
  '    focusedDistrict = tile.district',
  '    const [west, south, east, north] = bbox(tile.district)',
  '    map.fitBounds([west, south, east, north], { padding: 48, duration: 500, maxZoom: 12 })',
  '  }',
  '}',
  'const clearTileOutline = () => tileOutlineSource.setData(featureCollection([]))',
  '',
  'const nonLiveableKinds = new Set(nonLiveableLandUse)',
  'const polygonParts = (feature: Feature<Polygon | MultiPolygon>) =>',
  '  flatten(cleanCoords(feature)).features.flatMap(polygon =>',
  '    booleanValid(polygon) ? [polygon] : unkinkPolygon(polygon).features,',
  '  )',
  "const tileTemplate = basemapUrl.replace('.json?', '/{z}/{x}/{y}.mvt?')",
  `const tileKey = ({ x, y }: { x: number; y: number }) => \`\${x}/\${y}\``,
  'const tileUrlFor = ({ x, y }: { x: number; y: number }) =>',
  '  tileTemplate',
  "    .replace('{z}', String(analysisZoom))",
  "    .replace('{x}', String(x))",
  "    .replace('{y}', String(y))",
  'const decodedTiles = new Map<string, unknown[]>()',
  'const fetchNonLiveableLand = async (tile: { x: number; y: number }) => {',
  '  const key = tileKey(tile)',
  '  const cached = decodedTiles.get(key)',
  '  if (cached) return cached',
  '  const response = await fetch(tileUrlFor(tile))',
  `  if (!response.ok && response.status !== 204) throw new Error(\`Tile request failed: \${response.status}\`)`,
  '  const landuse = response.status === 204',
  '    ? undefined',
  '    : new VectorTile(new PbfReader(await response.arrayBuffer())).layers.landuse',
  '  const features = landuse',
  '    ? Array.from({ length: landuse.length }, (_, featureIndex) => {',
  '      const feature = landuse.feature(featureIndex)',
  '      if (!nonLiveableKinds.has(feature.properties.kind)) return []',
  '',
  '      const geojson = feature.toGeoJSON(tile.x, tile.y, analysisZoom)',
  "      const isArea = geojson.geometry.type === 'Polygon'",
  "        || geojson.geometry.type === 'MultiPolygon'",
  '      return isArea ? polygonParts(geojson) : []',
  '    }).flatMap(features => features)',
  '    : []',
  '',
  '  // Reuse the decoded tile when it overlaps another District.',
  '  decodedTiles.set(key, features)',
  '  return features',
  '}',
  '',
  'const tilesByKey = new Map<string, ProcessingTile>()',
  'if (!savedResult) {',
  '  for (const district of districts) {',
  '    for (const tile of tilesCovering(district)) {',
  '      const key = tileKey(tile)',
  '      if (!tilesByKey.has(key)) tilesByKey.set(key, { ...tile, district })',
  '    }',
  '  }',
  '}',
  '',
  "const progressPanel = document.createElement('section')",
  "progressPanel.id = 'land-analysis-progress'",
  "progressPanel.setAttribute('aria-live', 'polite')",
  "progressPanel.dataset.mode = 'tiles'",
  "const progressPhase = document.createElement('p')",
  "progressPhase.className = 'land-analysis-progress-phase'",
  "const progressDistrict = document.createElement('h2')",
  "progressDistrict.className = 'land-analysis-progress-district'",
  "const progressCount = document.createElement('p')",
  "progressCount.className = 'land-analysis-progress-count'",
  "const districtCounts = document.createElement('dl')",
  "districtCounts.className = 'land-analysis-district-counts'",
  'districtCounts.innerHTML = \'<div><dt>PARTS</dt><dd data-parts></dd></div><div aria-hidden="true">for</div><div><dt>DISTRICTS</dt><dd data-districts></dd></div>\'',
  "const progress = document.createElement('progress')",
  "progress.className = 'land-analysis-progress-bar'",
  'progressPanel.append(progressPhase, progressDistrict, progressCount, districtCounts, progress)',
  'if (!savedResult) document.body.append(progressPanel)',
  'const progressNode = { phase: progressPhase, district: progressDistrict, count: progressCount, progress }',
  'const setProgress = (',
  '  node: { phase: HTMLParagraphElement; district: HTMLHeadingElement; count: HTMLParagraphElement; progress: HTMLProgressElement },',
  '  completed: number, total: number, district: (typeof districts)[number], phase: string,',
  `  countLabel = \`\${completed.toLocaleString()} / \${total.toLocaleString()}\`,`,
  ') => {',
  '  node.progress.max = total',
  '  node.progress.value = completed',
  '  node.phase.textContent = phase',
  '  node.district.textContent = district.properties.districtName',
  '  node.count.textContent = countLabel',
  '}',
  'const showTileProgress = (completed: number, tile: ProcessingTile) => {',
  "  progressPanel.dataset.mode = 'tiles'",
  "  setProgress(progressNode, completed, tilesByKey.size, tile.district, '[DOWNLOAD TILES & EXTRACT FEATURES]')",
  '}',
  'const showDistrictProgress = (completed: number, district: (typeof districts)[number], completedParts = 0, totalParts = 0) => {',
  '  if (focusedDistrict !== district) {',
  '    focusedDistrict = district',
  '    const [west, south, east, north] = bbox(district)',
  '    map.fitBounds([west, south, east, north], { padding: 48, duration: 500, maxZoom: 12 })',
  '  }',
  "  progressPanel.dataset.mode = 'districts'",
  `  districtCounts.querySelector('[data-parts]')!.textContent = \`\${completedParts.toLocaleString()} / \${totalParts.toLocaleString()}\``,
  `  districtCounts.querySelector('[data-districts]')!.textContent = \`\${completed.toLocaleString()} / \${districts.length.toLocaleString()}\``,
  "  setProgress(progressNode, completed, districts.length, district, '[CALCULATE DISTRICT INTERSECTION]')",
  '}',
].join('\n')

export const urbanDensitySetupZ14TileFetcherDisplayCode =
  urbanDensitySetupZ14TileFetcherCode

export const urbanDensitySetupZ14TileFetcherCss = [
  '#land-analysis-progress {',
  '  --land-analysis-progress-font: ui-monospace, monospace;',
  '  --land-analysis-progress-text: rgba(255, 255, 255, 0.85);',
  '  position: fixed; left: 50%; bottom: 1rem; z-index: 1;',
  '  width: min(calc(100% - 2rem), 24rem); transform: translateX(-50%);',
  '  border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(16, 21, 26, 0.95);',
  '  padding: 1rem 1.25rem; color: white; text-align: center; font-family: system-ui, sans-serif;',
  '}',
  '#land-analysis-progress :is(.land-analysis-progress-phase, .land-analysis-progress-district, .land-analysis-progress-count, .land-analysis-district-counts) {',
  '  font-family: var(--land-analysis-progress-font);',
  '}',
  '#land-analysis-progress :is(.land-analysis-progress-count, .land-analysis-district-counts) {',
  '  font-variant-numeric: tabular-nums;',
  '}',
  '#land-analysis-progress .land-analysis-progress-phase {',
  '  margin: 0; color: rgba(255, 255, 255, 0.7);',
  '  font-size: 0.68rem; font-weight: 700; letter-spacing: 0.12em;',
  '}',
  '#land-analysis-progress .land-analysis-progress-district {',
  '  margin: 0.375rem 0 0; color: #79e7d1;',
  '  font-size: 1.875rem; font-weight: 700; letter-spacing: -0.025em; line-height: 1;',
  '}',
  '#land-analysis-progress .land-analysis-progress-count {',
  '  margin: 0.75rem 0 0; color: var(--land-analysis-progress-text);',
  '  font-size: 1rem; font-weight: 600;',
  '}',
  '#land-analysis-progress .land-analysis-district-counts {',
  '  display: none; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 0.75rem;',
  '  margin: 0.75rem 0 0;',
  '}',
  '#land-analysis-progress[data-mode="districts"] .land-analysis-progress-count { display: none; }',
  '#land-analysis-progress[data-mode="districts"] .land-analysis-district-counts { display: grid; }',
  '#land-analysis-progress .land-analysis-district-counts dt {',
  '  color: rgba(255, 255, 255, 0.55); font-size: 0.68rem; font-weight: 700; letter-spacing: 0.12em;',
  '}',
  '#land-analysis-progress .land-analysis-district-counts dd {',
  '  margin: 0.125rem 0 0; color: var(--land-analysis-progress-text); font-size: 1rem; font-weight: 600;',
  '}',
  '#land-analysis-progress .land-analysis-district-counts [aria-hidden="true"] {',
  '  padding-bottom: 0.125rem; color: rgba(255, 255, 255, 0.45); font-size: 0.75rem; font-weight: 700;',
  '}',
  '#land-analysis-progress .land-analysis-progress-bar {',
  '  display: block; width: 100%; height: 0.5rem; margin-top: 1rem; accent-color: #43c6ad;',
  '}',
].join('\n')

export const urbanDensityCollectNonLiveableLandCode = [
  'const nonLiveableFeatures = []',
  'let exclusions = []',
  'if (!savedResult) {',
  '  try {',
  '    for (const [index, tile] of [...tilesByKey.values()].entries()) {',
  '      showTileOutline(tile)',
  '      showTileProgress(index, tile)',
  '      nonLiveableFeatures.push(...await fetchNonLiveableLand(tile))',
  '      showTileProgress(index + 1, tile)',
  '      await new Promise(requestAnimationFrame)',
  '    }',
  '  } finally {',
  '    clearTileOutline()',
  '  }',
  '  exclusions = nonLiveableFeatures.map(feature => ({ feature, bounds: bbox(feature) }))',
  '}',
].join('\n')

export const urbanDensityCollectNonLiveableLandDisplayCode =
  urbanDensityCollectNonLiveableLandCode

export const urbanDensityLiveableAreaCode = [
  'if (!savedResult) {',
  'const pauseForAir = () => new Promise<void>(resolve => window.setTimeout(resolve, 0))',
  'const districtLand = []',
  'const completedExclusions = []',
  "const completedExclusionSource = map.getSource('completed-exclusions') as GeoJSONSource",
  '',
  'map.addLayer({',
  "  id: 'completed-exclusions',",
  "  type: 'fill',",
  "  source: 'completed-exclusions',",
  "  paint: { 'fill-color': ['match', ['get', 'area'], 'Hong Kong Island', '#5b8ff9', 'Kowloon', '#f6bd16', 'New Territories', '#5ad8a6', '#e76f51'], 'fill-opacity': 0.72 },",
  '}, firstLabelLayerId)',
  '',
  'map.addLayer({',
  "  id: 'completed-exclusions-outline',",
  "  type: 'line',",
  "  source: 'completed-exclusions',",
  "  paint: { 'line-color': ['match', ['get', 'area'], 'Hong Kong Island', '#5b8ff9', 'Kowloon', '#f6bd16', 'New Territories', '#5ad8a6', '#e76f51'], 'line-width': 2 },",
  '}, firstLabelLayerId)',
  '',
  'for (const [index, district] of districts.entries()) {',
  '  await pauseForAir()',
  '  const districtPolygonParts = flatten(district).features.map(feature => ({ feature, bounds: bbox(feature) }))',
  '  showDistrictProgress(index + 1, district, 0, districtPolygonParts.length)',
  '  const clippedExclusions = []',
  '  let clippedCount = 0',
  '  for (const [partIndex, districtPart] of districtPolygonParts.entries()) {',
  '    for (const exclusion of exclusions) {',
  '      if (!boundsOverlap(districtPart.bounds, exclusion.bounds)) continue',
  '      const clipped = intersect(featureCollection([districtPart.feature, exclusion.feature]))',
  '      if (clipped) clippedExclusions.push(clipped)',
  '      clippedCount += 1',
  '      if (clippedCount % 8 === 0) {',
  '        await pauseForAir()',
  '      }',
  '    }',
  '    showDistrictProgress(index + 1, district, partIndex + 1, districtPolygonParts.length)',
  '    await pauseForAir()',
  '  }',
  '  const excluded = union(featureCollection(clippedExclusions))',
  '  const liveable = difference(featureCollection([district, excluded]))',
  '  districtLand.push({ district, excluded, liveable })',
  '  completedExclusions.push({ ...excluded, properties: { area: district.properties.area } })',
  '  completedExclusionSource.setData(featureCollection(completedExclusions))',
  '}',
  '',
  'const analysisResult = {',
  '  districts,',
  '  metrics,',
  "  liveableDistrictLand: { type: 'FeatureCollection', features: districtLand.map(({ district, liveable }) => ({ ...liveable, properties: district.properties })) },",
  "  excludedDistrictLand: { type: 'FeatureCollection', features: districtLand.map(({ district, excluded }) => ({ ...excluded, properties: district.properties })) },",
  '}',
  'savedResult = analysisResult',
  'const resultJson = JSON.stringify(analysisResult)',
  "const resultDialog = document.createElement('dialog')",
  "resultDialog.id = 'land-analysis-result'",
  "const resultTitle = document.createElement('h2')",
  "resultTitle.textContent = 'Calculation complete'",
  "resultTitle.className = 'land-analysis-result-title'",
  "const download = document.createElement('a')",
  "download.textContent = 'Download land-analysis.json'",
  "download.className = 'land-analysis-result-download'",
  "download.href = URL.createObjectURL(new Blob([resultJson], { type: 'application/json' }))",
  "download.download = 'land-analysis.json'",
  'resultDialog.append(resultTitle, download)',
  'document.body.append(resultDialog)',
  'resultDialog.showModal()',
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
  '',
  'if (!savedResult) {',
  "  map.setLayoutProperty('not-liveable', 'visibility', 'none')",
  "  map.setLayoutProperty('not-liveable-outline', 'visibility', 'none')",
  '}',
  "const liveableFirstLabelLayerId = map.getStyle().layers.find(layer => layer.type === 'symbol')?.id",
  '',
  'const { excludedDistrictLand } = savedResult',
  "map.addSource('excluded-districts', { type: 'geojson', data: excludedDistrictLand })",
  "map.addLayer({ id: 'excluded-districts', type: 'fill', source: 'excluded-districts',",
  "  paint: { 'fill-antialias': false, 'fill-color': '#e76f51', 'fill-opacity': 0, 'fill-opacity-transition': { duration: 700 } },",
  '}, liveableFirstLabelLayerId)',
  "map.addLayer({ id: 'excluded-districts-outline', type: 'line', source: 'excluded-districts',",
  "  paint: { 'line-color': '#8c3427', 'line-opacity': 0, 'line-opacity-transition': { duration: 700 }, 'line-width': 1 },",
  '}, liveableFirstLabelLayerId)',
  '',
  "map.addSource('liveable-districts', { type: 'geojson', data: savedResult.liveableDistrictLand })",
  'map.addLayer({',
  "  id: 'liveable-districts', type: 'fill', source: 'liveable-districts',",
  "  paint: { 'fill-antialias': false, 'fill-color': '#36a269', 'fill-opacity': 0, 'fill-opacity-transition': { duration: 700 } },",
  '}, liveableFirstLabelLayerId)',
  '',
  '// Let the map render the transparent result once, then reveal the completed analysis.',
  "requestAnimationFrame(() => { map.setPaintProperty('excluded-districts', 'fill-opacity', 0.62); map.setPaintProperty('liveable-districts', 'fill-opacity', 0.48); map.setPaintProperty('excluded-districts-outline', 'line-opacity', 1) })",
].join('\n')

export const urbanDensityLiveableAreaMapDisplayCode = urbanDensityLiveableAreaMapCode

export const urbanDensityLiveableMetricsCode = [
  'const liveableDistrictLand = savedResult.liveableDistrictLand.features',
  'const liveableTotalsByArea = liveableDistrictLand.reduce((totals, district) => {',
  '  const { area: areaName, population, landAreaSqKm } = district.properties',
  '  const total = totals.get(areaName) ?? { name: areaName, population: 0, landAreaSqKm: 0, liveableLandAreaSqKm: 0 }',
  '  total.population += population',
  '  total.landAreaSqKm += landAreaSqKm',
  '  total.liveableLandAreaSqKm += area(district) / 1_000_000',
  '  totals.set(areaName, total)',
  '  return totals',
  '}, new Map<string, { name: string; population: number; landAreaSqKm: number; liveableLandAreaSqKm: number }>())',
  '',
  'const liveableMetrics = [...liveableTotalsByArea.values()]',
  '  .map(total => ({',
  '    ...total,',
  '    peoplePerSqKm: total.population / total.liveableLandAreaSqKm,',
  '    liveablePercentage: (total.liveableLandAreaSqKm / total.landAreaSqKm) * 100,',
  '  }))',
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
    '  position: fixed; inset: auto 2rem 3.25rem; z-index: 10;',
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
    '  #urban-density-metrics { inset: auto .75rem 2.5rem; grid-template-columns: 1fr; gap: .5rem; }',
    '  #urban-density-metrics article { padding: .75rem 1rem; }',
    '  #urban-density-metrics p { font-size: .75rem; }',
    '  #urban-density-metrics article > strong { margin: .2rem 0; font-size: 1.35rem; }',
    '  #urban-density-metrics .density-detail { font-size: .68rem; line-height: 1.25; }',
    '}',
  ].join('\n')
}
