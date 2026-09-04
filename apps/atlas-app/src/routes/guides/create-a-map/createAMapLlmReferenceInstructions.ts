import {
  createAMapRendererBasemapCode,
  createAMapRendererStyleCode,
  createGeoJsonImportCode,
  createDeploymentCode,
  createUrbanDensitySetupZ14TileFetcherCode,
  createUrbanDensityStatsCode,
  getCreateAMapRendererReference,
  getHostingInstallCode,
  urbanDensityCalculationCode,
  urbanDensityCollectNonLiveableLandCode,
  urbanDensityGeometryWorkerCode,
  urbanDensityLiveableAreaCode,
  urbanDensityLiveableAreaCss,
  urbanDensityLiveableAreaMapCode,
  urbanDensityLiveableMetricsCode,
  urbanDensityMapCode,
  urbanDensityMetricsCode,
  urbanDensitySetupZ14TileFetcherCss,
  urbanDensityTurfInstallCode,
  urbanDensityTurfInstallOutput,
  createUrbanDensityMetricsCss,
} from './snippets'
import { createMapIframeCode } from './createAMapEmbed'

const tilejsonUrl = 'https://tiles.saanseoi.hk/hongkong-latest.json'
const styleUrl = 'https://api.saanseoi.hk/v0/styles/midnight/1.0.0.json'
const apiBaseUrl = 'https://api.saanseoi.hk'
const iframeReferenceCode = createMapIframeCode({
  height: { mode: 'fixed', pixels: 600 },
  title: 'My SaanSeoi map',
  url: 'https://your-map.example',
})

const codeBlock = (language: string, code: string) =>
  [`\`\`\`${language}`, code, '```'].join('\n')

const reference = (title: string, target: string, language: string, code: string) =>
  [`#### ${title}`, '', `Target: \`${target}\``, '', codeBlock(language, code)].join(
    '\n',
  )

const rendererReferences = (['maplibre', 'mapbox', 'leaflet'] as const).map(
  renderer => {
    const rendererReference = getCreateAMapRendererReference(renderer)
    return [
      `### ${rendererReference.label}`,
      '',
      reference(
        'Install the renderer',
        'saanseoi-project',
        'bash',
        rendererReference.installCommand,
      ),
      '',
      reference('Create the blank map', 'src/main.ts', 'ts', rendererReference.code),
      '',
      reference(
        'Reset the map styles',
        'src/style.css',
        'css',
        rendererReference.stylesheetCode,
      ),
    ].join('\n')
  },
)

const basemapReferences = (['maplibre', 'mapbox', 'leaflet'] as const).map(renderer => [
  `### ${getCreateAMapRendererReference(renderer).label}`,
  '',
  reference(
    'Add the SaanSeoi basemap',
    'src/main.ts',
    'ts',
    createAMapRendererBasemapCode(renderer, styleUrl, tilejsonUrl),
  ),
  '',
  reference(
    'Apply a SaanSeoi style',
    'src/main.ts',
    'ts',
    createAMapRendererStyleCode(renderer, styleUrl, tilejsonUrl),
  ),
])

const geoJsonReferences = (['maplibre', 'mapbox', 'leaflet'] as const).map(renderer =>
  reference(
    `Add GeoJSON with ${getCreateAMapRendererReference(renderer).label}`,
    'src/main.ts',
    'ts',
    createGeoJsonImportCode(renderer),
  ),
)

const urbanDensityReferences = [
  reference(
    'Fetch District statistics',
    'src/main.ts',
    'ts',
    createUrbanDensityStatsCode(
      apiBaseUrl,
      'The cached land-analysis result is loaded when available; otherwise fetch the source statistics.',
    ),
  ),
  reference('Calculate Area density', 'src/main.ts', 'ts', urbanDensityCalculationCode),
  reference('Add the exclusion highlighter', 'src/main.ts', 'ts', urbanDensityMapCode),
  reference(
    'Add Area metrics',
    'src/style.css',
    'css',
    createUrbanDensityMetricsCss('dark'),
  ),
  reference('Add Area metrics', 'src/main.ts', 'ts', urbanDensityMetricsCode),
  reference(
    'Install geometry dependencies',
    'saanseoi-project',
    'bash',
    urbanDensityTurfInstallCode,
  ),
  reference(
    'Expected dependency output',
    'saanseoi-project',
    'text',
    urbanDensityTurfInstallOutput,
  ),
  reference(
    'Create the geometry Worker',
    'src/land-analysis.worker.ts',
    'ts',
    urbanDensityGeometryWorkerCode,
  ),
  reference(
    'Add the z14 tile fetcher and liveable-area analysis styles',
    'src/style.css',
    'css',
    [urbanDensitySetupZ14TileFetcherCss, urbanDensityLiveableAreaCss].join('\n\n'),
  ),
  reference(
    'Add the z14 tile fetcher and liveable-area analysis',
    'src/main.ts',
    'ts',
    [
      createUrbanDensitySetupZ14TileFetcherCode('maplibre'),
      urbanDensityCollectNonLiveableLandCode,
      urbanDensityLiveableAreaCode,
    ].join('\n\n'),
  ),
  reference(
    'Finalise liveable-density metrics and map layers',
    'src/main.ts',
    'ts',
    [urbanDensityLiveableMetricsCode, urbanDensityLiveableAreaMapCode].join('\n\n'),
  ),
]

const hostingReferences = (
  ['cloudflare', 'github-pages', 'vercel', 'netlify', 'other'] as const
).map(hosting =>
  [
    `### ${hosting}`,
    '',
    reference(
      'Install the host tool',
      'saanseoi-project',
      'bash',
      getHostingInstallCode(hosting) || 'bun run build',
    ),
    '',
    reference(
      'Build and publish',
      'saanseoi-project',
      'bash',
      createDeploymentCode(hosting),
    ),
  ].join('\n'),
)

const instructions = `
## Code and command references

The following are the same implementation references exposed by the guide’s progressive
prompt cards. They are canonical examples for a Hong Kong, MapLibre and Midnight setup.
Use the decision ledger to substitute the selected region, renderer, style, host and
operating-system-specific paths. Adapt them to the actual project rather than blindly
replacing unrelated code.

### Project setup references

${[
  reference('Create the project directory', '~', 'bash', 'mkdir saanseoi-project'),
  reference('Enter the project directory', '~', 'bash', 'cd saanseoi-project'),
  reference(
    'Create the Vite project',
    '~/saanseoi-project',
    'bash',
    'bun create vite . --template vanilla-ts --no-immediate --interactive',
  ),
  reference('Install project packages', '~/saanseoi-project', 'bash', 'bun install'),
].join('\n\n')}

## Renderer references

${rendererReferences.join('\n\n')}

## Basemap and style references

${basemapReferences.join('\n\n')}

Every basemap and style reference reads the public key from
\`import.meta.env.VITE_SAANSEOI_API_KEY\`, URL-encodes it and sends it as
\`access_token\`. Ask the user to create or retrieve that key at
https://saanseoi.hk/api-keys, then ask them to provide the resulting \`pk.\` key so you
can configure the local environment. Never log or commit it.

## Existing-data references

${geoJsonReferences.join('\n\n')}

For non-GeoJSON input, first convert it to valid \`features.geojson\` while preserving
the source, licence, schema and coordinates. Do not invent missing values.

## Urban-density references

${urbanDensityReferences.join('\n\n')}

Apply the urban-density references in this order: fetch and inspect source statistics;
calculate Area metrics; add the metrics and District overlays; add the exclusion
highlighter; install and run the one-time z14 geometry analysis; then use the saved
\`src/land-analysis.json.gz\` result to finalise the map. A chat LLM should present one
reference at a time and wait for the user’s report. An agentic LLM may apply adjacent
references in one change when no user decision is needed, but must verify the visible
result.

## Publishing references

${hostingReferences.join('\n\n')}

Use the selected host’s current official documentation for authentication and project
configuration. Configure \`VITE_SAANSEOI_API_KEY\` in the host’s public build settings,
build and smoke-test locally, ask for confirmation, then authenticate and deploy.

## Notebook and embed references

${reference(
  'MapLibre Jupyter starter',
  'notebook cell',
  'python',
  [
    'from maplibre import Map, MapOptions',
    '',
    'map_view = Map(MapOptions(center=(114.1694, 22.3193), zoom=11.5))',
    "map_view.save('map.html', preview=True)",
  ].join('\n'),
)}

${reference(
  'Folium starter',
  'notebook cell',
  'python',
  [
    'import folium',
    '',
    'map_view = folium.Map(location=[22.3193, 114.1694], zoom_start=11.5)',
    'map_view',
  ].join('\n'),
)}

${reference('Iframe template', 'website page editor', 'html', iframeReferenceCode)}

The iframe template is only a starting point. Ask for the real public HTTPS map URL,
accessible title and fixed or parent-fill height, return the complete generated iframe,
then ask the user to place it in the selected platform, preview it, report the result,
and publish or update the page. Use the platform-specific element described in the
section goals.
`

export const createAMapLlmReferenceInstructions = () => instructions
