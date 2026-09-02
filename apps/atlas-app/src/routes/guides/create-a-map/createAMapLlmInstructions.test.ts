import { describe, expect, test } from 'bun:test'
import { getCreateAMapOpeningPosition } from '#lib/guides/createAMapSelections.js'

import {
  createAMapLlmInstructions,
  createAMapPrerequisitesInstructions,
} from './createAMapLlmInstructions'
import {
  createAMapAgenticHandoverPrompt,
  createAMapAgenticSectionPrompt,
  createAMapChatSectionPrompt,
  createAMapRenderPromptFragments,
  createAMapProjectSetupPromptFragments,
  isCreateAMapAgentCapableEditor,
  shouldShowCreateAMapEditorSetup,
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
  urbanDensitySetupZ14TileFetcherCode,
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
      "const savedResultUrl = new URL(/* @vite-ignore */ './land-analysis.json.gz', import.meta.url)",
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
    expect(instructions).toContain('current workspace root only if it is not the')
    expect(instructions).toContain(
      'An HTTP 200 response does not visually verify the app',
    )
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
    expect(instructions).toMatch(/check it yourself when you\s+have browser access/)
    expect(instructions).toMatch(
      /otherwise ask the user to open it and report the result/,
    )
    expect(instructions).toContain(
      'Managed hidden folders such as `.agents`, `.codex`, and `.git`',
    )
    expect(instructions).toContain('“Ignore files and continue”')
    expect(instructions).toContain('never “Remove existing files.”')
    expect(instructions).toContain('default only when a new subdirectory is required')
    expect(instructions).not.toContain('### Ask these questions first')
    expect(instructions).not.toContain('## Render the map')
    expect(instructions).not.toContain('Inspect the existing workspace')
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
        'The single next action is for you to continue with the “Render” section of the guide. Read it until it provides you with a prompt to share with me again.”',
      )
      expect(prompt).toContain('collaborative assistance session, not a full hand-over')
      expect(prompt).toContain('### Project decisions')
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
    expect(agentPrompt).toContain('create a new `saanseoi-project` subdirectory')

    expect(chatPrompt).toContain('#### Linux')
    expect(chatPrompt).not.toContain('#### macOS')
    expect(chatPrompt).not.toContain('#### Windows PowerShell')
    expect(chatPrompt).toContain(
      'For this stand-alone web app, use Bun and TypeScript.',
    )
    expect(chatPrompt).toContain('### Install the Wrangler dependency')
    expect(chatPrompt).toContain('bun add -d wrangler')
    expect(chatPrompt).toContain('open another terminal tab or window')
    expect(chatPrompt).toContain('navigate to the same project directory')
    expect(chatPrompt).toContain('such as `cd saanseoi-project`')
    expect(chatPrompt).toContain(
      'It uses workspace-local temporary directories for `bun install`',
    )
    expect(chatPrompt).toContain('does not sign in, configure an account, or deploy')
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
      'State whether I should create, replace, or append the content.\n\nIMPORTANT: This is a collaborative assistance session',
    )
    expect(chatPrompt).toContain('Give me one command at a time')
    expect(chatPrompt).toContain('### Starting with the terminal')
    expect(chatPrompt).toContain('`Ctrl` + `Alt` + `T`')
    expect(agentPrompt).not.toContain('### Starting with the terminal')
    expect(agentPrompt).toContain('Stop for confirmation before any paid action')
    expect(agentPrompt).toContain(
      'An HTTP 200 response does not visually verify the app',
    )
    expect(agentPrompt).toContain('If browser access is unavailable,')
    expect(chatPrompt).toContain('Terminal in `saanseoi-project`')
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
    ).toContain('For this local map on my computer, use Bun and TypeScript.')
    expect(
      createAMapAgenticSectionPrompt(
        { objective: 'web-embed', operatingSystem: 'Linux', preferredLocale: 'en' },
        'prerequisites',
      ),
    ).toContain(
      'For this map embedded in an existing site, first create a standalone web map',
    )
  })

  test('installs the selected hosting dependency for hosted web projects', () => {
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
    ).toContain('bun add -d gh-pages')
    expect(
      createAMapAgenticSectionPrompt(
        { objective: 'local', operatingSystem: 'Linux', preferredLocale: 'en' },
        'prerequisites',
      ),
    ).not.toContain('### Install the')
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
      String.raw`printf '\033[B\033[B\r' | bun create vite . --template vanilla-ts --no-immediate --interactive`,
    )
    expect(prompt).toContain(
      'successful Bun command, build, or HTTP response is not visual verification',
    )
    expect(prompt).toContain(
      'do not add map libraries, basemaps, hosting configuration, or',
    )
    expect(prompt).toContain('deployment settings in this section')
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
        'Continue the “Render” section of my SaanSeoi map project.\n\nIf you have no context',
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

    expect(agentPrompt).toContain(
      'As an agent, you will implement the requests locally',
    )
    expect(agentPrompt).toContain('Stop for confirmation before any paid action')
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

  test('adds headings to the later progressive prompts', () => {
    for (const section of ['basemap', 'style', 'data', 'publish'] as const) {
      expect(
        createAMapAgenticSectionPrompt({ preferredLocale: 'en' }, section),
      ).toStartWith(`## ${section.charAt(0).toUpperCase() + section.slice(1)} Section`)
    }
  })

  test('provides the selected renderer reference without exposing a Mapbox token', () => {
    const prompt = createAMapAgenticSectionPrompt(
      {
        preferredLocale: 'en',
        renderer: 'mapbox',
        rendererLabel: 'Mapbox GL JS',
      },
      'render',
    )

    expect(prompt).toContain(
      'If you have no context for the SaanSeoi project, stop immediately',
    )
    expect(prompt).toContain('### Setup')
    expect(prompt).toContain('bun add mapbox-gl')
    expect(prompt).toContain('Replace the existing `src/main.ts` with:')
    expect(prompt).toContain('Replace the existing styles in `src/style.css` with:')
    expect(prompt).toContain('### Verify')
    expect(prompt).toContain(
      'Use the Mapbox access token already stored in local `.env` as `VITE_MAPBOX_TOKEN`.',
    )
    expect(prompt).not.toContain('### This section')
    expect(prompt).not.toContain('### Project decisions')
    expect(prompt).toContain('access_token')
    expect(prompt).not.toContain('VITE_SAANSEOI_API_KEY')
  })

  test('includes renderer-specific style code in agent and chat hand-offs', () => {
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
      const expectedCode = createAMapRendererBasemapCode(
        renderer,
        state.styleUrl,
        state.tilejsonUrl,
      )

      for (const prompt of [
        createAMapAgenticSectionPrompt(state, 'style'),
        createAMapChatSectionPrompt(state, 'style'),
      ]) {
        expect(prompt).toContain(`The selected renderer is ${rendererLabel}.`)
        expect(prompt).toContain(importLine)
        expect(prompt).toContain(expectedCode)
        expect(prompt).toContain('Make only the style-related changes')
      }
    }
  })

  test('names the next section or confirms guide completion', () => {
    expect(createAMapAgenticSectionPrompt({ preferredLocale: 'en' }, 'data')).toContain(
      'The single next action is for you to continue with the “Publish” section of the guide. Read it until it provides you with a prompt to share with me again.”',
    )
    expect(
      createAMapAgenticSectionPrompt({ preferredLocale: 'en' }, 'publish'),
    ).toContain('this is the final section of the guide')
  })
})
