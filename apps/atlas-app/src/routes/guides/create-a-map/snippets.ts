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
  'html,',
  'body,',
  '#app,',
  '#map {',
  '  width: 100%;',
  '  height: 100%;',
  '  margin: 0;',
  '}',
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
      '  zoom: 11,',
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
  styleUrl: string,
  tilejsonUrl: string,
) =>
  renderer === 'leaflet'
    ? [
        "import L from 'leaflet'",
        "import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'",
        "import 'maplibre-gl/dist/maplibre-gl.css'",
        '',
        'const accessToken = import.meta.env.VITE_SAANSEOI_API_KEY',
        "if (!accessToken?.startsWith('pk.')) throw new Error('Set VITE_SAANSEOI_API_KEY.')",
        '',
        `const style = await fetch('${styleUrl}').then(response => response.json())`,
        'style.sources = {',
        `  basemap: { type: 'vector', url: '${tilejsonUrl}?access_token=' + encodeURIComponent(accessToken) },`,
        '}',
        '',
        "const map = L.map('map').setView([22.3193, 114.1694], 11)",
        'maplibreGL({',
        '  style,',
        '}).addTo(map)',
      ].join('\n')
    : [
        `import ${renderer === 'mapbox' ? "mapboxgl from 'mapbox-gl'" : "maplibregl from 'maplibre-gl'"}`,
        '',
        'const accessToken = import.meta.env.VITE_SAANSEOI_API_KEY',
        "if (!accessToken?.startsWith('pk.')) throw new Error('Set VITE_SAANSEOI_API_KEY.')",
        '',
        `const style = await fetch('${styleUrl}').then(response => response.json())`,
        'style.sources = {',
        `  basemap: { type: 'vector', url: '${tilejsonUrl}?access_token=' + encodeURIComponent(accessToken) },`,
        '}',
        '',
        `new ${renderer === 'mapbox' ? 'mapboxgl' : 'maplibregl'}.Map({`,
        "  container: 'map',",
        '  style,',
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

export const createProjectSetupCode = (operatingSystem?: string) =>
  ['mkdir saanseoi-project', 'cd saanseoi-project']
    .concat([
      '# If prompted that the directory is not empty, choose “Ignore files and continue”.',
      ...(operatingSystem === 'windows'
        ? ['bun create vite . --template vanilla-ts --no-immediate']
        : [
            '# This selects “Ignore files and continue” if Vite shows that prompt.',
            String.raw`printf '\033[B\033[B\r' | bun create vite . --template vanilla-ts --no-immediate --interactive`,
          ]),
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
        'map_view = Map(MapOptions(center=(114.1694, 22.3193), zoom=11))',
        "map_view.save('map.html', preview=True)",
      ].join('\n')
    : [
        'import folium',
        '',
        'map_view = folium.Map(location=[22.3193, 114.1694], zoom_start=11)',
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
    "import { Map } from 'maplibre-gl'",
    "import 'maplibre-gl/dist/maplibre-gl.css'",
    "import './style.css'",
    '',
    'const accessToken = import.meta.env.VITE_SAANSEOI_API_KEY',
    "if (!accessToken?.startsWith('pk.')) throw new Error('Set VITE_SAANSEOI_API_KEY.')",
    '',
    `const style = await fetch('${styleUrl}').then(response => response.json())`,
    'style.sources = {',
    "  basemap: { type: 'vector', url: 'https://tiles.saanseoi.hk/hongkong-latest.json?access_token=' + encodeURIComponent(accessToken) },",
    '}',
    '',
    "document.querySelector<HTMLDivElement>('#app')!.innerHTML = '<div id=\"map\"></div>'",
    '',
    'const map = new Map({',
    "  container: 'map',",
    '  style,',
    '  center: [114.165, 22.34],',
    '  zoom: 10.25,',
    '})',
  ].join('\n')

export const urbanDensityStatsCode = [
  'const apiKey = import.meta.env.VITE_SAANSEOI_API_KEY',
  "const dataset = 'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district'",
  '',
  'async function getDistrictField(field: string) {',
  "  const url = new URL('/stats/v0.1/geographies', 'https://api.saanseoi.hk')",
  "  url.searchParams.set('releaseSet', 'data-hk-stats-2024-r1')",
  "  url.searchParams.set('cohort', '2024')",
  "  url.searchParams.set('filter[dataset]', dataset)",
  "  url.searchParams.set('filter[field]', field)",
  "  url.searchParams.set('filter[referencePeriod]', '2024')",
  "  url.searchParams.set('filter[geographyKind]', 'division')",
  '',
  "  const response = await fetch(url, { headers: { 'x-api-key': apiKey } })",
  '  if (!response.ok) throw new Error(`Statistics request failed: ${response.status}`)',
  '  return (await response.json()).values as Record<string, string>',
  '}',
  '',
  'const [populationByDistrict, landAreaByDistrict] = await Promise.all([',
  "  getDistrictField('populationMidYear'),",
  "  getDistrictField('landArea'),",
  '])',
  '',
  'const regions = {',
  "  'Hong Kong Island': ['CW', 'EST', 'ILD', 'STH', 'WC'],",
  "  Kowloon: ['KLC', 'KC', 'KT', 'SSP', 'WTS', 'YTM'],",
  "  'New Territories': ['NTH', 'SK', 'ST', 'TP', 'TW', 'TM', 'YL'],",
  '} as const',
  '',
  'const metrics = Object.entries(regions).map(([name, districtCodes]) => {',
  '  const population = districtCodes.reduce(',
  '    (total, code) => total + Number(populationByDistrict[code] ?? 0),',
  '    0,',
  '  )',
  '  const landAreaSqKm = districtCodes.reduce(',
  '    (total, code) => total + Number(landAreaByDistrict[code] ?? 0),',
  '    0,',
  '  )',
  '  return { name, population, landAreaSqKm, peoplePerSqKm: population / landAreaSqKm }',
  '})',
].join('\n')

export const urbanDensityMapCode = [
  "await new Promise<void>(resolve => (map.loaded() ? resolve() : map.once('load', resolve)))",
  '',
  "const greenLandUse = ['national_park', 'park', 'protected_area', 'nature_reserve', 'forest', 'wood', 'scrub', 'grassland', 'grass', 'golf_course', 'allotments', 'village_green', 'playground']",
  'map.addLayer({',
  "  id: 'green-context',",
  "  type: 'fill',",
  "  source: 'basemap',",
  "  'source-layer': 'landuse',",
  "  filter: ['in', 'kind', ...greenLandUse],",
  "  paint: { 'fill-color': '#0b2b32', 'fill-opacity': 0.72 },",
  "}, 'roads_runway')",
].join('\n')

export const urbanDensityMetricsCode = [
  "const metricBar = document.createElement('section')",
  "metricBar.id = 'urban-density-metrics'",
  "metricBar.setAttribute('aria-label', 'Urban population density')",
  'metricBar.innerHTML = metrics.map(metric => `',
  '  <article>',
  `    <p>\${metric.name}</p>`,
  `    <strong>\${Math.round(metric.peoplePerSqKm).toLocaleString()}</strong>`,
  `    <span>people per km² · \${metric.landAreaSqKm.toFixed(1)} km² district land</span>`,
  '  </article>',
  "`).join('')",
  'document.body.append(metricBar)',
].join('\n')

export const urbanDensityMetricsCss = [
  '#urban-density-metrics {',
  '  position: fixed; inset: auto 1.5rem 1.5rem; z-index: 1;',
  '  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px;',
  '  background: #26433d; box-shadow: 0 12px 32px rgb(0 0 0 / 24%);',
  '}',
  '#urban-density-metrics article { padding: 1rem 1.25rem; background: #fff9ed; }',
  '#urban-density-metrics p, #urban-density-metrics span { margin: 0; display: block; }',
  '#urban-density-metrics strong { display: block; margin: .25rem 0; font-size: 2rem; }',
  '@media (max-width: 640px) {',
  '  #urban-density-metrics { grid-template-columns: 1fr; inset: auto 1rem 1rem; }',
  '}',
].join('\n')
