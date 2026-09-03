import { describe, expect, test } from 'bun:test'
import { getCreateAMapOpeningPosition } from '#lib/guides/createAMapSelections.js'

import {
  createAMapLlmInstructions,
  createAMapPrerequisitesInstructions,
} from './createAMapLlmInstructions'
import {
  createAMapAgenticHandoverPrompt,
  createAMapGuideHandbackUrl,
  createAMapAgenticDataStepPrompt,
  createAMapAgenticSectionPrompt,
  createAMapChatHandoverPrompt,
  createAMapChatDataStepPrompt,
  createAMapCustomDataPrompt,
  createAMapExistingDataPrompt,
  createAMapBasemapPromptFragments,
  createAMapChatSectionPrompt,
  createAMapRenderPromptFragments,
  createAMapProjectSetupPromptFragments,
  isCreateAMapAgentCapableEditor,
  shouldShowCreateAMapEditorSetup,
  type CreateAMapDataPromptReferences,
} from './createAMapLlmPrompt'
import {
  createAMapRendererBasemapCode,
  createAMapRendererStyleCode,
  createUrbanDensityMapReadyCode,
  createUrbanDensitySetupZ14TileFetcherCode,
  createUrbanDensityStatsCode,
  getCreateAMapRendererReference,
  urbanDensityCalculationCode,
  urbanDensityCollectNonLiveableLandCode,
  urbanDensityGeometryWorkerCode,
  urbanDensityLiveableAreaCode,
  urbanDensityLiveableAreaMapCode,
  urbanDensityLiveableMetricsCode,
  urbanDensityMapCode,
  urbanDensityMetricsCode,
  urbanDensitySetupZ14TileFetcherCode,
  urbanDensityTurfInstallCode,
  urbanDensityTurfInstallOutput,
} from './snippets'

describe('Create a Map LLM instructions', () => {
  test('opens each regional basemap within its coverage', () => {
    expect(getCreateAMapOpeningPosition('hk').center).toEqual([114.1694, 22.3193])
    expect(getCreateAMapOpeningPosition('mo').center).toEqual([113.552, 22.165])
    expect(getCreateAMapOpeningPosition('gba').center).toEqual([113.75, 22.65])

    const macaoPosition = getCreateAMapOpeningPosition('mo')
    expect(
      createAMapRendererBasemapCode(
        'maplibre',
        'https://styles.example/light.json',
        'https://tiles.example/macau.json',
        macaoPosition,
      ),
    ).toContain('center: [113.552, 22.165]')
    expect(
      createAMapRendererStyleCode(
        'leaflet',
        'https://styles.example/light.json',
        'https://tiles.example/macau.json',
        macaoPosition,
      ),
    ).toContain('}).setView([22.165, 113.552], 12.2)')
    expect(getCreateAMapRendererReference('leaflet', macaoPosition).code).toContain(
      "L.map('map').setView([22.165, 113.552], 12.2)",
    )
  })

  test('starts MapLibre attribution controls in compact mode', () => {
    const styleUrl = 'https://styles.saanseoi.hk/midnight.json'
    const tilejsonUrl = 'https://tiles.saanseoi.hk/hongkong-latest.json'

    for (const code of [
      getCreateAMapRendererReference('maplibre').code,
      createAMapRendererBasemapCode('maplibre', styleUrl, tilejsonUrl),
      createAMapRendererStyleCode('maplibre', styleUrl, tilejsonUrl),
      createUrbanDensityMapReadyCode(styleUrl),
    ]) {
      expect(code).toContain('attributionControl: { compact: true }')
      expect(code).toContain(
        "import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'",
      )
      expect(code).toContain('maplibregl.setWorkerUrl(workerUrl)')
    }
  })

  test('emits the selected renderer for urban-density setup and tile analysis', () => {
    const styleUrl = 'https://styles.example/light.json'

    expect(createUrbanDensityMapReadyCode(styleUrl, 'maplibre')).toContain(
      'new maplibregl.Map({',
    )
    expect(createUrbanDensitySetupZ14TileFetcherCode('maplibre')).toStartWith(
      "import type { GeoJSONSource } from 'maplibre-gl'",
    )

    expect(createUrbanDensityMapReadyCode(styleUrl, 'mapbox')).toContain(
      'new mapboxgl.Map({',
    )
    expect(createUrbanDensitySetupZ14TileFetcherCode('mapbox')).toStartWith(
      "import type { GeoJSONSource } from 'mapbox-gl'",
    )

    expect(createUrbanDensityMapReadyCode(styleUrl, 'leaflet')).toContain(
      "const leafletMap = L.map('map', {",
    )
    expect(createUrbanDensityMapReadyCode(styleUrl, 'leaflet')).toContain(
      'markerZoomAnimation: false',
    )
    expect(createUrbanDensityMapReadyCode(styleUrl, 'leaflet')).toContain(
      'const map = basemapLayer.getMaplibreMap()',
    )
    expect(createUrbanDensitySetupZ14TileFetcherCode('leaflet')).toStartWith(
      "import type { GeoJSONSource } from 'maplibre-gl'",
    )
  })

  test('emits the MapLibre production worker for Leaflet bridge snippets', () => {
    for (const code of [
      createAMapRendererBasemapCode(
        'leaflet',
        'https://styles.example/light.json',
        'https://tiles.example/hongkong.json',
      ),
      createAMapRendererStyleCode(
        'leaflet',
        'https://styles.example/light.json',
        'https://tiles.example/hongkong.json',
      ),
    ]) {
      expect(code).toContain(
        "import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'",
      )
      expect(code).toContain('maplibregl.setWorkerUrl(workerUrl)')
      expect(code).toContain('zoomAnimation: false')
      expect(code).toContain('fadeAnimation: false')
      expect(code).toContain('markerZoomAnimation: false')
    }
  })

  test('loads a completed land analysis with the statistics step', () => {
    const mapSetup = createUrbanDensityMapReadyCode('https://styles.example/light.json')
    const stats = createUrbanDensityStatsCode(
      'https://api.example',
      'Analyse the map in several steps, then save the result.\nLoad it directly next time.\nSkip the calculation.',
    )

    expect(mapSetup).not.toContain('savedResultUrl')
    expect(mapSetup).not.toContain('type DistrictProperties')
    expect(stats).toContain('type DistrictProperties')
    expect(stats).toContain(
      "const savedResultUrl = new URL('./land-analysis.json.gz', import.meta.url)",
    )
    expect(stats).toContain('const savedResultResponse = await fetch(savedResultUrl)')
    expect(stats).toContain(
      "savedResultResponse.body.pipeThrough(new DecompressionStream('gzip'))",
    )
    expect(stats).not.toContain('await import(savedResultPath)')
    expect(stats.indexOf('savedResultUrl')).toBeLessThan(stats.indexOf('apiBaseUrl'))
    expect(stats).toContain("const apiBaseUrl = 'https://api.example'")
    expect(stats).toContain('let populationByDistrict: Record<string, string> = {}')
    expect(stats).toContain('let landAreaByDistrict: Record<string, string> = {}')
    expect(stats).toContain(
      '[populationByDistrict, landAreaByDistrict] = await Promise.all([',
    )
    expect(stats).toContain('if (!response.ok || !result.values)')
    expect(stats).toContain('Statistics request failed:')
    expect(urbanDensitySetupZ14TileFetcherCode).toContain(
      "if (typeof kind !== 'string' || !nonLiveableKinds.has(kind)) return []",
    )
    expect(stats).toContain(
      "if (!savedResult) {\nconst statsEndpoint = '/stats/v0.1/geographies'",
    )
    expect(urbanDensityCalculationCode).not.toContain(
      "divisionsUrl.searchParams.set('transform', 'simplified')",
    )
  })

  test('dissolves fixed-precision tile coverage before measuring districts', () => {
    expect(urbanDensitySetupZ14TileFetcherCode).toContain('const precisionGrid = 4')
    expect(urbanDensityGeometryWorkerCode).toContain(
      'geos.GEOSUnaryUnionPrec(collection, precisionGrid)',
    )
    expect(urbanDensityGeometryWorkerCode).toContain(
      'geos.GEOSIntersectionPrec(first, second, precisionGrid)',
    )
    expect(urbanDensitySetupZ14TileFetcherCode).toContain(
      "new Worker(new URL('./land-analysis.worker.ts', import.meta.url), { type: 'module' })",
    )
    expect(urbanDensitySetupZ14TileFetcherCode).not.toContain('geos.GEOS')
    expect(urbanDensitySetupZ14TileFetcherCode).toContain(
      'intersectAnalysisGeometries(merged, tileCoreGeometry(tile))',
    )
    expect(urbanDensitySetupZ14TileFetcherCode).toContain(
      "map.setFeatureState({ source: 'analysis-tiles', id: tileKey(tile) }, { status })",
    )
    expect(urbanDensityCollectNonLiveableLandCode).toContain(
      "setTileStatus(tile, 'complete')",
    )
    expect(urbanDensityCollectNonLiveableLandCode).toContain(
      'for (let index = 0; index < Math.min(2, tiles.length); index += 1) queueCoverage(index)',
    )
    expect(urbanDensityCollectNonLiveableLandCode).toContain(
      'const excludedGeometry = await unionAnalysisGeometries(clippedExclusions)',
    )
    expect(urbanDensitySetupZ14TileFetcherCode).toContain(
      'const tileRequests = new Map<string, Promise<Feature<Polygon | MultiPolygon>[]>>()',
    )
    expect(urbanDensitySetupZ14TileFetcherCode).toContain(
      'const tileCoverageRequests = new Map<string, Promise<Polygon | MultiPolygon | undefined>>()',
    )
    expect(urbanDensitySetupZ14TileFetcherCode).toContain('booleanIntersects')
    expect(urbanDensitySetupZ14TileFetcherCode).toContain(
      'candidateTiles.filter(tile => booleanIntersects(bboxPolygon(tileBounds(tile)), district))',
    )
    expect(urbanDensityCollectNonLiveableLandCode).toContain(
      'for (const [districtIndex, district] of districts.entries()) {',
    )
    expect(urbanDensityLiveableAreaCode).toContain(
      'excludedDistrictLand: featureCollection(excludedDistrictLand)',
    )
    expect(urbanDensityLiveableAreaCode).not.toContain('intersect(featureCollection')
    expect(urbanDensitySetupZ14TileFetcherCode).not.toContain('GEOSDifferencePrec')
    expect(urbanDensityLiveableAreaCode).not.toContain('liveableDistrictLand')
    expect(urbanDensityLiveableAreaCode).toContain('savedResult = analysisResult')
    expect(urbanDensityLiveableMetricsCode).toStartWith('if (savedResult) {')
    expect(urbanDensityLiveableAreaMapCode).toStartWith('if (savedResult) {')
  })

  test('renders simple District land beneath the excluded geometry', () => {
    expect(urbanDensityLiveableAreaMapCode).toContain(
      'data: featureCollection(savedResult.districts)',
    )
    expect(urbanDensityLiveableAreaMapCode).not.toContain(
      'data: savedResult.liveableDistrictLand',
    )
    expect(
      urbanDensityLiveableAreaMapCode.indexOf("id: 'liveable-districts'"),
    ).toBeLessThan(urbanDensityLiveableAreaMapCode.indexOf("id: 'excluded-districts'"))
    expect(urbanDensityLiveableAreaMapCode).toContain(
      "landUseLegend.id = 'land-use-legend'",
    )
    expect(urbanDensityLiveableAreaMapCode).toContain(
      "landUseTitle.textContent = 'Population Density of Liveable Land Area'",
    )
  })

  test('renders the complete guide', () => {
    const instructions = createAMapLlmInstructions()

    expect(instructions).toContain('# SaanSeoi:')
    expect(instructions).toContain('## Prerequisites')
    expect(instructions).toContain('```bash')
    expect(instructions).toContain('## Render the map')
    expect(instructions).toContain('### Library-specific starter references')
    expect(instructions).toContain('#### Setup')
    expect(instructions).toContain('bun add maplibre-gl')
    expect(instructions).toContain('bun add mapbox-gl')
    expect(instructions).toContain('bun add leaflet')
    expect(instructions).toContain('## Publish')
    expect(instructions).toContain(
      'Do not ask the user to identify their operating system.',
    )
    expect(instructions).not.toContain('What operating system are you using')
    expect(instructions).toContain('current workspace root only if it is not the')
    expect(instructions).toContain(
      'An HTTP 200 response does not visually verify the app',
    )
    expect(instructions).toContain('## Decision matrix and order')
    expect(instructions).toContain('If you are an agentic LLM')
    expect(instructions).toContain('If you are a non-agentic LLM')
    expect(instructions).toContain('https://saanseoi.hk/sign-up')
    expect(instructions).toContain('https://saanseoi.hk/api-keys')
    expect(instructions).toContain('do not rely on the guide UI to compose the iframe')
  })

  test('creates a handback URL from the known guide decisions', () => {
    const url = createAMapGuideHandbackUrl(
      {
        preferredLocale: 'en',
        selectionQuery: {
          objective: 'web-embed',
          aiAccess: 'web',
          llm: 'chatgpt',
          websitePlatform: 'wordpress',
          hosting: 'cloudflare',
          renderer: 'maplibre',
          region: 'hk',
          style: 'midnight',
          dataSource: 'existing',
          dataFormat: 'geojson',
        },
      },
      'https://saanseoi.hk/guides/create-a-map',
    )

    expect(url).toContain('objective=web-embed')
    expect(url).toContain('llm-mode=assisted')
    expect(url).toContain('website=wordpress')
    expect(url).toContain('data-format=geojson')
    expect(url).not.toContain('agent-tool=')
  })

  test('makes full handover prompts mode-specific and multilingual', () => {
    const agentPrompt = createAMapAgenticHandoverPrompt(
      { preferredLocale: 'en' },
      'https://saanseoi.hk/guides/create-a-map',
      'https://saanseoi.hk/guides/create-a-map/llms.txt',
    )
    const chatPrompt = createAMapChatHandoverPrompt(
      { preferredLocale: 'en' },
      'https://saanseoi.hk/guides/create-a-map',
      'https://saanseoi.hk/guides/create-a-map/llms.txt',
    )

    expect(agentPrompt).toContain('If you are an agentic LLM')
    expect(agentPrompt).toContain('AI route: agentic')
    expect(agentPrompt).toContain('ai-access=agentic')
    expect(agentPrompt).not.toContain('If you are a non-agentic LLM')
    expect(chatPrompt).toContain('If you are a non-agentic LLM')
    expect(chatPrompt).toContain('AI route: web')
    expect(chatPrompt).toContain('llm-mode=assisted')
    expect(chatPrompt).not.toContain('If you are an agentic LLM, inspect')
    for (const languageQuestion of [
      'Which language would you prefer',
      '你希望我們',
      '你希望我们',
    ]) {
      expect(chatPrompt).toContain(languageQuestion)
    }
    expect(chatPrompt).toContain('https://saanseoi.hk/sign-up')
    expect(chatPrompt).toContain('https://saanseoi.hk/api-keys')
  })

  test('provides the working agreement and setup instructions for assistance', () => {
    const instructions = createAMapPrerequisitesInstructions()

    expect(instructions).toContain('## Working agreement')
    expect(instructions).toContain('## Prerequisites')
    expect(instructions).toContain(
      'bun create vite . --template vanilla-ts --no-immediate',
    )
    expect(instructions).toContain('BUN_TMPDIR="$PWD/.bun-tmp"')
    expect(instructions).toContain('BUN_INSTALL="$PWD/.bun-install"')
    expect(instructions).toContain('rm -rf .bun-tmp .bun-install')
    expect(instructions).toContain('Visibly open that reported URL in a')
    expect(instructions).toContain(
      'ask the user to open the reported URL and describe what they see',
    )
    expect(instructions).toContain(
      'Managed hidden folders such as `.agents`, `.codex`, and `.git`',
    )
    expect(instructions).toContain('“Ignore files and continue”')
    expect(instructions).toContain('never “Remove existing files.”')
    expect(instructions).toContain(
      'Create the project only as `/path/to/saanseoi-project`',
    )
    expect(instructions).not.toContain('### Ask these questions first')
    expect(instructions).not.toContain('## Render the map')
    expect(instructions).not.toContain('Inspect the existing workspace')
  })

  test('gives agents Linux commands to adapt after inspecting the environment', () => {
    const prompt = createAMapAgenticSectionPrompt(
      { objective: 'local', preferredLocale: 'en' },
      'prerequisites',
    )

    expect(prompt).toContain(
      'Before creating anything, inspect the operating system and shell',
    )
    expect(prompt).toContain('If Bun is installed, do not run its installation command')
    expect(prompt).toContain('never overwrite it')
    expect(prompt).toContain('#### Linux')
    expect(prompt).toContain('#### macOS')
    expect(prompt).toContain('#### Windows PowerShell')
    expect(prompt).toContain('curl -fsSL https://bun.sh/install | bash')
    expect(prompt).toContain('irm bun.sh/install.ps1 | iex')
    expect(prompt).toContain('#### Linux or macOS')
    expect(prompt).toContain(
      'New-Item -ItemType Directory -Force .bun-tmp, .bun-install',
    )
    expect(prompt.indexOf('#### Linux')).toBeLessThan(prompt.indexOf('#### macOS'))
    expect(prompt.indexOf('#### macOS')).toBeLessThan(
      prompt.indexOf('#### Windows PowerShell'),
    )
  })

  test('composes the project setup prompt for agents and web chat', () => {
    const state = {
      objective: 'web',
      hostingValue: 'cloudflare',
      operatingSystem: 'Linux',
      operatingSystemValue: 'linux',
      terminalExperienceValue: 'none',
      preferredLocale: 'en',
    }
    const agentPrompt = createAMapAgenticSectionPrompt(state, 'prerequisites')
    const chatPrompt = createAMapChatSectionPrompt(state, 'prerequisites')

    for (const prompt of [agentPrompt, chatPrompt]) {
      expect(prompt).toStartWith('## Overall project')
      expect(prompt).toContain(
        'I am following an online guide (https://saanseoi.hk/guides/create-a-map) to build a web-based map that people can visit online with a link.',
      )
      expect(prompt).toContain(
        'In this first session, help me establish the project foundation only',
      )
      expect(prompt).toEndWith(
        'Once the user confirms that the default Vite page is visibly displayed, summarise the setup and stop. Do not make further changes or begin the “Render your map” section.',
      )
      expect(prompt).toContain('collaborative assistance session, not a full hand-over')
      expect(prompt).toContain('### Project decisions')
      expect(prompt).toContain('- Operating system: Linux')
      expect(prompt).toContain('### Working agreement')
      expect(prompt).toContain('## Project setup')
      expect(prompt).toContain('### Verification')
      expect(prompt).not.toContain('### Ask these questions first')
      expect(prompt).not.toContain('preferred locale')
      expect(prompt).not.toContain('will take full ownership')
    }

    expect(agentPrompt).toContain('#### Linux')
    expect(agentPrompt).toContain('curl -fsSL https://bun.sh/install | bash')
    expect(agentPrompt).toContain('bun add -d wrangler')
    expect(agentPrompt).toContain('BUN_TMPDIR="$PWD/.bun-tmp"')
    expect(agentPrompt).toContain('BUN_INSTALL="$PWD/.bun-install"')
    expect(agentPrompt).toContain('bun dev')
    expect(agentPrompt).not.toContain('open another terminal tab or window')
    expect(agentPrompt).toContain(
      'As an agent, you will implement the requests locally',
    )
    expect(agentPrompt).toContain('Create only `/path/to/saanseoi-project`')

    expect(chatPrompt).toContain('#### Linux')
    expect(chatPrompt).not.toContain('#### macOS')
    expect(chatPrompt).not.toContain('#### Windows PowerShell')
    expect(chatPrompt).toContain(
      'For this stand-alone web app, use Bun and TypeScript in `/path/to/saanseoi-project`.',
    )
    expect(chatPrompt).toContain('bun add -d wrangler')
    expect(chatPrompt).toContain('bun dev -- --host 0.0.0.0')
    expect(chatPrompt).toContain('`/path/to/saanseoi-project`')
    expect(chatPrompt).toContain(
      'It uses workspace-local temporary directories for `bun install`',
    )
    expect(chatPrompt).toContain(
      'Managed hidden folders such as `.agents`, `.codex`, and `.git`',
    )
    expect(chatPrompt).toContain('“Ignore files and continue”')
    expect(chatPrompt).toContain(
      'As a non-agentic LLM, you will provide me with explicit steps',
    )
    expect(chatPrompt).toContain(
      'IMPORTANT: This is a collaborative assistance session, not a full hand-over.',
    )
    expect(chatPrompt).toContain(
      'State whether I should create, replace, or append the content.',
    )
    expect(chatPrompt).toContain('Give me one command at a time')
    expect(chatPrompt).toContain('### Starting with the terminal')
    expect(chatPrompt).toContain('`Ctrl` + `Alt` + `T`')
    expect(agentPrompt).not.toContain('### Starting with the terminal')
    expect(agentPrompt).toContain('Stop for confirmation before any paid action')
    expect(agentPrompt).toContain(
      'Browser verification succeeds only when a browser visibly displays',
    )
    expect(agentPrompt).toContain('If browser access is unavailable,')
    expect(chatPrompt).toContain('/path/to/saanseoi-project')
    expect(chatPrompt).toContain('Editor window in `src/main.ts`')
    expect(chatPrompt).not.toContain('Stop for confirmation before any paid action')

    expect(agentPrompt).not.toContain('\n\n\n')
  })

  test('filters project setup fragments by LLM type and workspace choices', () => {
    const fragments = createAMapProjectSetupPromptFragments(
      {
        codeEditorValue: 'cursor',
        operatingSystemValue: 'macos',
        preferredLocale: 'en',
        terminalExperienceValue: 'basic',
      },
      'chat',
    )

    expect(fragments.some(fragment => fragment.llmType === 'agent')).toBe(false)
    expect(fragments.some(fragment => fragment.llmType === 'chat')).toBe(true)
    expect(
      fragments.some(
        fragment =>
          fragment.os === 'macos' &&
          fragment.editor === 'cursor' &&
          fragment.terminalExperience === 'basic',
      ),
    ).toBe(true)
    expect(
      fragments.every(
        fragment => fragment.llmType === 'all' || fragment.llmType === 'chat',
      ),
    ).toBe(true)
    expect(
      fragments.some(fragment =>
        fragment.text.startsWith('### Project decisions\n\n- AI tool: TBD'),
      ),
    ).toBe(true)
  })

  test('shows editor setup for chat and agent-capable editors only', () => {
    expect(isCreateAMapAgentCapableEditor('zed')).toBe(true)
    expect(isCreateAMapAgentCapableEditor('cursor')).toBe(true)
    expect(isCreateAMapAgentCapableEditor('vscode')).toBe(false)
    expect(shouldShowCreateAMapEditorSetup({ llmType: 'chat' })).toBe(true)
    expect(
      shouldShowCreateAMapEditorSetup({ llmType: 'agent', editorValue: 'zed' }),
    ).toBe(true)
    expect(
      shouldShowCreateAMapEditorSetup({ llmType: 'agent', editorValue: 'cursor' }),
    ).toBe(true)
    expect(
      shouldShowCreateAMapEditorSetup({ llmType: 'agent', editorValue: 'vscode' }),
    ).toBe(false)
  })

  test('summarises each primary map objective in a complete sentence', () => {
    expect(
      createAMapAgenticSectionPrompt(
        { objective: 'local', preferredLocale: 'en' },
        'prerequisites',
      ),
    ).toContain('map that I can use on my computer.')
    expect(
      createAMapAgenticSectionPrompt(
        { objective: 'web', preferredLocale: 'en' },
        'prerequisites',
      ),
    ).toContain('map that people can visit online with a link.')
    expect(
      createAMapAgenticSectionPrompt(
        { objective: 'web-embed', preferredLocale: 'en' },
        'prerequisites',
      ),
    ).toContain('map that I can embed in an existing site.')
  })

  test('uses the selected objective in the collaborative project setup', () => {
    expect(
      createAMapAgenticSectionPrompt(
        { objective: 'local', operatingSystem: 'Linux', preferredLocale: 'en' },
        'prerequisites',
      ),
    ).toContain(
      'For this local map on my computer, use Bun and TypeScript in `/path/to/saanseoi-project`.',
    )
    expect(
      createAMapAgenticSectionPrompt(
        { objective: 'web-embed', operatingSystem: 'Linux', preferredLocale: 'en' },
        'prerequisites',
      ),
    ).toContain(
      'For this map embedded in an existing site, first create a standalone web map',
    )
  })

  test('installs Wrangler but no other hosting dependency during project setup', () => {
    expect(
      createAMapAgenticSectionPrompt(
        {
          hostingValue: 'github-pages',
          objective: 'web-embed',
          operatingSystem: 'Linux',
          preferredLocale: 'en',
        },
        'prerequisites',
      ),
    ).toContain('bun add -d wrangler')
    expect(
      createAMapAgenticSectionPrompt(
        { objective: 'local', operatingSystem: 'Linux', preferredLocale: 'en' },
        'prerequisites',
      ),
    ).not.toContain('bun add -d gh-pages')
  })

  test('provides a project-local Bun installation fallback', () => {
    const unixPrompt = createAMapChatSectionPrompt(
      {
        objective: 'web',
        hostingValue: 'cloudflare',
        operatingSystem: 'Linux',
        preferredLocale: 'en',
      },
      'prerequisites',
    )
    const windowsPrompt = createAMapChatSectionPrompt(
      {
        objective: 'web',
        hostingValue: 'cloudflare',
        operatingSystem: 'Windows',
        preferredLocale: 'en',
      },
      'prerequisites',
    )
    const macosPrompt = createAMapChatSectionPrompt(
      {
        objective: 'web',
        hostingValue: 'cloudflare',
        operatingSystem: 'macOS',
        preferredLocale: 'en',
      },
      'prerequisites',
    )

    expect(unixPrompt).toContain('mkdir -p .bun-tmp .bun-install')
    expect(unixPrompt).toContain('BUN_TMPDIR="$PWD/.bun-tmp"')
    expect(unixPrompt).toContain('BUN_INSTALL="$PWD/.bun-install"')
    expect(unixPrompt).toContain('rm -rf .bun-tmp .bun-install')
    expect(windowsPrompt).toContain(
      'New-Item -ItemType Directory -Force .bun-tmp, .bun-install',
    )
    expect(windowsPrompt).toContain('$env:BUN_TMPDIR = "$PWD\\.bun-tmp"')
    expect(windowsPrompt).toContain('$env:BUN_INSTALL = "$PWD\\.bun-install"')
    expect(windowsPrompt).toContain(
      'Remove-Item -Recurse -Force .bun-tmp, .bun-install',
    )
    expect(macosPrompt).toContain('#### macOS')
    expect(macosPrompt).toContain('bun --version')
    expect(macosPrompt).toContain(
      'Run this only when the command above reports that Bun is unavailable',
    )
    expect(macosPrompt).toContain('open a new Terminal\nwindow before continuing')
    expect(macosPrompt).not.toContain(
      'Use the Linux command sequence after inspecting the shell.',
    )
  })

  test('uses explicit setup commands and stops at visual Vite verification', () => {
    const prompt = createAMapAgenticSectionPrompt(
      {
        objective: 'web',
        hostingValue: 'cloudflare',
        operatingSystem: 'Linux',
        preferredLocale: 'en',
      },
      'prerequisites',
    )

    const scaffold = prompt.indexOf(
      'bun create vite . --template vanilla-ts --no-immediate',
    )
    const install = prompt.indexOf('bun install')
    const hostingDependency = prompt.indexOf('bun add -d wrangler')
    const server = prompt.indexOf('bun dev')

    expect(scaffold).toBeGreaterThan(-1)
    expect(scaffold).toBeLessThan(install)
    expect(install).toBeLessThan(hostingDependency)
    expect(hostingDependency).toBeLessThan(server)
    expect(prompt).not.toContain('echo "" | bun create vite')
    expect(prompt).toContain(
      'bun create vite . --template vanilla-ts --no-immediate --interactive',
    )
    expect(prompt).toContain('bun dev -- --host 0.0.0.0')
    expect(prompt).toContain('http://localhost:5174/')
    expect(prompt).toContain('do not stop or restart another process using it')
    expect(prompt).toContain('build, or HTTP response is not visual verification')
    expect(prompt).toContain(
      'Do not install map libraries or add basemap, style, data, Cloudflare configuration,',
    )
    expect(prompt).toContain('Vite page is visible, summarise the setup and stop')
  })

  test('keeps model selection in the user-only preflight note', () => {
    const codexState = {
      agentTool: 'Codex CLI',
      agentToolValue: 'codex-cli',
      preferredLocale: 'en',
    }
    const claudeState = {
      agentTool: 'Claude Code',
      agentToolValue: 'claude-code',
      preferredLocale: 'en',
    }
    const qwenState = {
      agentTool: 'Qwen Code',
      agentToolValue: 'qwen-code',
      preferredLocale: 'en',
    }

    expect(createAMapAgenticSectionPrompt(codexState, 'prerequisites')).not.toContain(
      '/model',
    )
    expect(createAMapAgenticSectionPrompt(claudeState, 'render')).not.toContain(
      'Option+T',
    )
    expect(createAMapAgenticSectionPrompt(qwenState, 'render')).not.toContain('/model')
    expect(
      createAMapAgenticHandoverPrompt(
        codexState,
        'https://example.test/guide',
        'https://example.test/llms.txt',
      ),
    ).not.toContain('/model')
  })

  test('includes terminal onboarding only for users with no terminal experience', () => {
    const beginnerPrompt = createAMapChatSectionPrompt(
      {
        objective: 'local',
        operatingSystem: 'Windows',
        preferredLocale: 'en',
        terminalExperienceValue: 'none',
      },
      'prerequisites',
    )
    const experiencedPrompt = createAMapChatSectionPrompt(
      {
        objective: 'local',
        operatingSystem: 'Windows',
        preferredLocale: 'en',
        terminalExperienceValue: 'basic',
      },
      'prerequisites',
    )

    expect(beginnerPrompt).toContain('### Starting with the terminal')
    expect(beginnerPrompt).toContain('Open Windows PowerShell')
    expect(experiencedPrompt).not.toContain('### Starting with the terminal')
    expect(
      createAMapAgenticSectionPrompt(
        {
          objective: 'local',
          operatingSystem: 'Windows',
          preferredLocale: 'en',
          terminalExperienceValue: 'none',
        },
        'prerequisites',
      ),
    ).not.toContain('### Starting with the terminal')
  })

  test('omits the locale instruction for English', () => {
    const prompt = createAMapAgenticSectionPrompt(
      { preferredLocale: 'en' },
      'prerequisites',
    )

    expect(prompt).not.toContain('Respond in my preferred locale')
  })

  test('stops the render hand-off without the existing SaanSeoi project context', () => {
    const state = {
      preferredLocale: 'en',
      renderer: 'maplibre',
      rendererLabel: 'MapLibre',
    }

    for (const prompt of [
      createAMapAgenticSectionPrompt(state, 'render'),
      createAMapChatSectionPrompt(state, 'render'),
    ]) {
      expect(prompt).toStartWith('## Render Section')
      expect(prompt).toContain(
        'If you have no context for the SaanSeoi project, stop immediately',
      )
      expect(prompt).toContain(
        'Continue the “Render the map” section of my SaanSeoi map project.\n\nIf you have no context',
      )
    }
  })

  test('composes renderer instructions for agent and chat workspaces', () => {
    const state = {
      codeEditorValue: 'cursor',
      operatingSystemValue: 'windows',
      preferredLocale: 'en',
      region: 'mo',
      renderer: 'maplibre',
      rendererLabel: 'MapLibre',
      terminalExperienceValue: 'basic',
    }
    const agentPrompt = createAMapAgenticSectionPrompt(state, 'render')
    const chatPrompt = createAMapChatSectionPrompt(state, 'render')

    for (const prompt of [agentPrompt, chatPrompt]) {
      expect(prompt).toStartWith('## Render Section')
      expect(prompt).toContain('bun add maplibre-gl')
      expect(prompt).toContain('Terminal in `saanseoi-project`')
      expect(prompt).toContain('src\\main.ts')
      expect(prompt).toContain('src\\style.css')
      expect(prompt).toContain('center: [113.552, 22.165]')
      expect(prompt).toContain('### Verify')
      expect(prompt).toContain('browser visibly shows')
    }

    expect(agentPrompt).not.toContain(
      'As an agent, you will implement the requests locally',
    )
    expect(agentPrompt).not.toContain(
      'Implement the requested renderer changes locally',
    )
    expect(agentPrompt).not.toContain('Stop for confirmation before any paid action')
    expect(agentPrompt).not.toContain('collaborative assistance session')
    expect(agentPrompt).not.toContain('create a new `saanseoi-project` subdirectory')
    expect(agentPrompt).not.toContain('For every action, name the exact paste target')
    expect(chatPrompt).toContain(
      'As a non-agentic LLM, you will provide me with explicit steps',
    )
    expect(chatPrompt).toContain('For every action, name the exact paste target')
    expect(chatPrompt).not.toContain('Stop for confirmation before any paid action')

    const fragments = createAMapRenderPromptFragments(state, 'chat')
    expect(fragments.every(fragment => fragment.llmType !== 'agent')).toBe(true)
    expect(fragments.some(fragment => fragment.os === 'windows')).toBe(true)
    expect(fragments.some(fragment => fragment.editor === 'cursor')).toBe(true)
    expect(fragments.some(fragment => fragment.terminalExperience === 'basic')).toBe(
      true,
    )
  })

  test('composes basemap instructions for agent and chat workspaces', () => {
    const state = {
      basemapApiKey: 'pk.guide-test',
      codeEditorValue: 'vscode',
      operatingSystemValue: 'windows',
      preferredLocale: 'en',
      region: 'hk',
      regionLabel: 'Hong Kong',
      renderer: 'maplibre',
      rendererLabel: 'MapLibre',
      styleUrl: 'https://styles.saanseoi.hk/light.json',
      tilejsonUrl: 'https://tiles.saanseoi.hk/hongkong-latest.json',
    }
    const agentPrompt = createAMapAgenticSectionPrompt(state, 'basemap')
    const chatPrompt = createAMapChatSectionPrompt(state, 'basemap')

    for (const prompt of [agentPrompt, chatPrompt]) {
      expect(prompt).toStartWith('## Basemap')
      expect(prompt).toContain('existing MapLibre map')
      expect(prompt).toContain('Hong Kong TileJSON endpoint')
      expect(prompt).toContain('https://tiles.saanseoi.hk/hongkong-latest.json')
      expect(prompt).toContain('`VITE_SAANSEOI_API_KEY`')
      expect(prompt).toContain('`access_token`')
      expect(prompt).toContain('`pk.guide-test`')
      expect(prompt).toContain('do not use an existing key')
      expect(prompt).toContain('src\\main.ts')
      expect(prompt).toContain('A blank map is expected')
      expect(prompt).not.toContain('https://styles.saanseoi.hk/light.json')
      expect(prompt).toContain(
        'The single next action is for you to continue with the “Style” section',
      )
    }

    expect(agentPrompt).toBe(chatPrompt)
    expect(agentPrompt).not.toContain('collaborative assistance session')
    expect(agentPrompt).not.toContain('Give one safe action at a time')

    const agentFragments = createAMapBasemapPromptFragments(state, 'agentic')
    const chatFragments = createAMapBasemapPromptFragments(state, 'chat')
    expect(agentFragments.every(fragment => fragment.llmType === 'all')).toBe(true)
    expect(chatFragments.every(fragment => fragment.llmType === 'all')).toBe(true)
    expect(agentFragments.some(fragment => fragment.os === 'windows')).toBe(true)
  })

  test('adds headings to the later progressive prompts', () => {
    for (const section of ['style', 'data', 'publish'] as const) {
      expect(
        createAMapAgenticSectionPrompt({ preferredLocale: 'en' }, section),
      ).toStartWith(`## ${section.charAt(0).toUpperCase() + section.slice(1)} Section`)
    }

    expect(
      createAMapAgenticSectionPrompt({ preferredLocale: 'en' }, 'basemap'),
    ).toStartWith('## Basemap')
  })

  test('guides chat and agents through adding custom GeoJSON data', () => {
    const state = {
      hosting: 'Cloudflare Pages',
      preferredLocale: 'en',
      regionLabel: 'Hong Kong',
    }
    const chatPrompt = createAMapCustomDataPrompt(state, 'chat')
    const agentPrompt = createAMapCustomDataPrompt(state, 'agentic')

    for (const prompt of [chatPrompt, agentPrompt]) {
      expect(prompt).toContain('Continue the “Craft a custom map” section')
      expect(prompt).toContain(
        'If you have no context for the SaanSeoi project, stop immediately',
      )
      expect(prompt).toContain('Hong Kong basemap')
      expect(prompt).toContain('valid GeoJSON')
      expect(prompt).toContain('attributes, data source, and desired interaction')
      expect(prompt).toContain('clarify the rest as we go along')
      expect(prompt).toContain('I selected Cloudflare Pages for hosting')
      expect(prompt).toContain('current static-asset size limits')
      expect(prompt).toContain('simplification, splitting, tiling, or hosted data')
      expect(prompt).toContain(
        'build, smoke-test, and prepare the map for Cloudflare Pages',
      )
      expect(prompt).toContain('ready to publish to Cloudflare Pages')
    }

    expect(chatPrompt).toContain('Ask me for the GeoJSON asset’s actual size')
    expect(agentPrompt).toContain('inspect its actual size yourself')
    expect(agentPrompt).not.toContain('Ask me for the GeoJSON asset’s actual size')
    expect(chatPrompt).toContain('Guide me one small action at a time')
    expect(chatPrompt).toContain('exactly which file or terminal command')
    expect(agentPrompt).toContain('Inspect the project first')
    expect(agentPrompt).not.toContain('Guide me one small action at a time')

    const localPrompt = createAMapCustomDataPrompt(
      { preferredLocale: 'en', regionLabel: 'Macau' },
      'chat',
    )
    expect(localPrompt).toContain('Macau basemap')
    expect(localPrompt).not.toContain('Prepare for selected hosting')
    expect(localPrompt).not.toContain('static-asset size limits')
    expect(localPrompt).not.toContain('ready to publish')
  })

  test('guides chat and agents through adding an existing GeoJSON file', () => {
    const state = {
      objective: 'web',
      operatingSystem: 'Windows',
      operatingSystemValue: 'windows',
      preferredLocale: 'en',
    }
    const references = [
      {
        code: "const places = await fetch('/features.geojson').then(response => response.json())",
        language: 'typescript' as const,
        path: 'src\\main.ts',
        title: 'src/main.ts - add your GeoJSON',
        type: 'TS' as const,
      },
    ]
    const agentPrompt = createAMapExistingDataPrompt(state, 'agentic', references)
    const chatPrompt = createAMapExistingDataPrompt(state, 'chat', references)

    for (const prompt of [agentPrompt, chatPrompt]) {
      expect(prompt).toStartWith('## Add GeoJSON to your map')
      expect(prompt).toContain('Continue the “Add your data” section')
      expect(prompt).toContain(
        'If you have no context for the SaanSeoi project, stop immediately',
      )
      expect(prompt).toContain('features.geojson')
      expect(prompt).toContain('C:\\Users\\YourName\\saanseoi-project\\public')
      expect(prompt).toContain('Target: `src\\main.ts`')
      expect(prompt).toContain(references[0].code)
      expect(prompt).toContain('verify that the features appear in the right places')
      expect(prompt).toContain(
        'The single next action is for you to continue with the “Publish the map” section',
      )
    }

    expect(agentPrompt).toContain('Inspect the existing project before changing it.')
    expect(agentPrompt).toContain('move or copy it to')
    expect(agentPrompt).not.toContain('Guide me through one safe action at a time')
    expect(chatPrompt).toContain('Guide me through one safe action at a time')
    expect(chatPrompt).toContain(
      'go to the end of the existing map setup, append the GeoJSON loading code below',
    )
    expect(chatPrompt).not.toContain('Inspect the existing project before changing it.')
  })

  test('keeps urban-density data hand-offs self-contained and scoped', () => {
    const state = {
      dataSource: 'api',
      dataSourceLabel: 'No, use SaanSeoi',
      preferredLocale: 'en',
    }
    const references = {
      fetchStats: [
        {
          code: createUrbanDensityStatsCode('https://api.example', 'saved result'),
          language: 'typescript',
          path: 'src/main.ts',
          title: 'Fetch District statistics',
          type: 'TS',
        },
      ],
      calculateDensity: [
        {
          code: urbanDensityCalculationCode,
          language: 'typescript',
          path: 'src/main.ts',
          title: 'Calculate Area density',
          type: 'TS',
        },
      ],
      addStatsToMap: [
        {
          code: urbanDensityMetricsCode,
          language: 'typescript',
          path: 'src/main.ts',
          title: 'Show Area metrics',
          type: 'TS',
        },
      ],
      findUnliveableLand: [
        {
          code: urbanDensityMapCode,
          language: 'typescript',
          path: 'src/main.ts',
          title: 'Highlight excluded land',
          type: 'TS',
        },
      ],
      calculateLiveableArea: [
        {
          code: urbanDensityTurfInstallCode,
          language: 'bash',
          path: 'saanseoi-project',
          title: 'Install geospatial tools',
          type: 'CLI',
        },
        {
          code: urbanDensityTurfInstallOutput,
          language: 'text',
          path: 'saanseoi-project',
          title: 'Expected installation output',
          type: 'CLI',
        },
        {
          code: urbanDensityGeometryWorkerCode,
          language: 'typescript',
          path: 'src/land-analysis.worker.ts',
          title: 'Analyse land geometry',
          type: 'TS',
        },
      ],
      finaliseMap: [
        {
          code: urbanDensityLiveableMetricsCode,
          language: 'typescript',
          path: 'src/main.ts',
          title: 'Show revised Area metrics',
          type: 'TS',
        },
      ],
    } satisfies CreateAMapDataPromptReferences
    const steps = [
      ['fetchStats', 'Calculate population density'],
      ['calculateDensity', 'Put the stats on the map'],
      ['addStatsToMap', 'Identifying land without human habitats'],
      ['findUnliveableLand', 'Calculate liveable area'],
    ] as const

    for (const [step, next] of steps) {
      const chatPrompt = createAMapChatDataStepPrompt(state, step, references[step])
      const agentPrompt = createAMapAgenticDataStepPrompt(state, step, references[step])

      expect(chatPrompt).toContain(
        `Continue the “${step === 'fetchStats' ? 'Data Section' : step === 'calculateDensity' ? 'Calculate population density' : step === 'addStatsToMap' ? 'Put the stats on the map' : 'Identifying land without human habitats'}” section`,
      )
      expect(chatPrompt).toContain(
        'If you have no context for the SaanSeoi project, stop immediately',
      )
      expect(chatPrompt).not.toContain('As a web chat')
      const workedExampleDecision =
        '- Data source: User has opted to follow a worked example where we will be building a population density map for Hong Kong.'
      if (step === 'fetchStats') {
        expect(chatPrompt).toContain('### Project decisions')
        expect(chatPrompt).toContain(workedExampleDecision)
      } else {
        expect(chatPrompt).not.toContain('### Project decisions')
        expect(chatPrompt).not.toContain(workedExampleDecision)
      }
      expect(chatPrompt).toContain('### Implementation references')
      expect(chatPrompt).toContain(`Target: \`${references[step]?.[0]?.path}\``)
      expect(chatPrompt).toContain(
        `Open \`${references[step]?.[0]?.path}\`, go to the end of its existing code, append this code, then save the file before continuing.`,
      )
      expect(chatPrompt).toContain(references[step]?.[0]?.code ?? '')
      expect(chatPrompt).toContain(`“${next}” section of the guide`)
      expect(agentPrompt).toContain(
        'Apply the following references to their named targets in the displayed order.',
      )
      expect(agentPrompt).not.toContain('go to the end of its existing code')
      expect(agentPrompt).not.toContain('As a coding agent')
      expect(agentPrompt).not.toContain('As a web chat')
    }

    const fetchPrompt = createAMapChatDataStepPrompt(
      state,
      'fetchStats',
      references.fetchStats,
    )
    expect(fetchPrompt).toContain("url.searchParams.set('cohort', '2024')")
    expect(fetchPrompt).toContain(
      "url.searchParams.set('filter[referencePeriod]', '2024')",
    )
    expect(fetchPrompt).toContain('x-api-key')

    const dataSectionPrompt = createAMapChatSectionPrompt(state, 'data', references)
    expect(dataSectionPrompt).not.toContain('### Project decisions')
    expect(dataSectionPrompt).not.toContain('Data source: User has opted')

    for (const step of ['calculateLiveableArea', 'finaliseMap'] as const) {
      const prompt = createAMapChatDataStepPrompt(state, step, references[step])
      expect(prompt).not.toContain('### Project decisions')
      expect(prompt).not.toContain('Data source: User has opted')
      expect(prompt).toContain(`Target: \`${references[step]?.[0]?.path}\``)
      expect(prompt).toContain(
        step === 'calculateLiveableArea'
          ? 'In the terminal at `saanseoi-project`, run this command and wait for it to finish before continuing.'
          : 'Open `src/main.ts`, go to the end of its existing code, append this code, then save the file before continuing.',
      )
      if (step === 'calculateLiveableArea') {
        expect(prompt).toContain(
          'In the terminal at `saanseoi-project`, compare the result with this expected output before continuing.',
        )
        expect(prompt).toContain(
          'Create `src/land-analysis.worker.ts` with this code, then save the file before continuing.',
        )
      }
      expect(prompt).toContain(references[step]?.[0]?.code ?? '')
    }
  })

  test('guides both LLM modes through local Mapbox token setup without exposing it', () => {
    const state = {
      preferredLocale: 'en',
      renderer: 'mapbox',
      rendererLabel: 'Mapbox GL JS',
    }
    const prompts = [
      createAMapAgenticSectionPrompt(state, 'render'),
      createAMapChatSectionPrompt(state, 'render'),
    ]

    for (const prompt of prompts) {
      expect(prompt).toContain(
        'If you have no context for the SaanSeoi project, stop immediately',
      )
      expect(prompt).toContain('### Setup')
      expect(prompt).toContain('bun add mapbox-gl')
      expect(prompt).toContain('Replace the existing `src/main.ts` with:')
      expect(prompt).toContain('Replace the existing styles in `src/style.css` with:')
      expect(prompt).toContain('### Verify')
      expect(prompt).toContain('### Mapbox access token')
      expect(prompt).toContain('Access Tokens dashboard')
      expect(prompt).toContain('VITE_MAPBOX_TOKEN=...')
      expect(prompt).toContain('Do not ask me to paste or reveal the token in chat')
      expect(prompt.indexOf('### Mapbox access token')).toBeLessThan(
        prompt.indexOf('### Setup'),
      )
      expect(prompt).not.toContain('### This section')
      expect(prompt).not.toContain('### Project decisions')
      expect(prompt).toContain('access_token')
      expect(prompt).not.toContain('VITE_SAANSEOI_API_KEY')
    }
  })

  test('keeps agent and chat style hand-offs limited to the style section', () => {
    const renderers = [
      ['maplibre', 'MapLibre', "import * as maplibregl from 'maplibre-gl'"],
      ['mapbox', 'Mapbox GL JS', "import mapboxgl from 'mapbox-gl'"],
      ['leaflet', 'Leaflet', "import L from 'leaflet'"],
    ] as const

    for (const [renderer, rendererLabel, importLine] of renderers) {
      const state = {
        preferredLocale: 'en',
        renderer,
        rendererLabel,
        style: 'light',
        styleUrl: 'https://api.saanseoi.hk/v0/styles/light/1.0.0.json',
        tilejsonUrl: 'https://tiles.saanseoi.hk/hongkong-latest.json',
      }
      const expectedCode = createAMapRendererStyleCode(
        renderer,
        state.styleUrl,
        state.tilejsonUrl,
      )

      const agentPrompt = createAMapAgenticSectionPrompt(state, 'style')
      const chatPrompt = createAMapChatSectionPrompt(state, 'style')

      expect(agentPrompt).toBe(chatPrompt)

      for (const prompt of [agentPrompt, chatPrompt]) {
        expect(prompt).toContain(`The selected renderer is ${rendererLabel}.`)
        expect(prompt).toContain(importLine)
        expect(prompt).toContain(expectedCode)
        expect(prompt).toContain('Make only the style-related changes')
        expect(prompt).toContain('\n```ts\n')
        expect(prompt).not.toContain('- ```ts')
        expect(prompt).not.toContain(`- ${importLine}`)
        expect(prompt).not.toContain('### Project decisions')
        expect(prompt).not.toContain('collaborative assistance session')
        expect(prompt).toContain(
          'The single next action is for you to continue with the “Data” section',
        )
        expect(prompt).toContain('“Data” section of the guide')
      }
    }
  })

  test('names the next section or confirms guide completion', () => {
    expect(createAMapAgenticSectionPrompt({ preferredLocale: 'en' }, 'data')).toContain(
      'The single next action is for you to continue with the “Calculate population density” section of the guide. Read it until it provides you with a prompt to share with me again.”',
    )
    expect(
      createAMapAgenticSectionPrompt({ preferredLocale: 'en' }, 'publish'),
    ).toContain('this is the final section of the guide')
  })
})
