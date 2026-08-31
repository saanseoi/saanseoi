import { describe, expect, test } from 'bun:test'

import {
  createAMapLlmInstructions,
  createAMapPrerequisitesInstructions,
} from './createAMapLlmInstructions'
import {
  createAMapAgenticHandoverPrompt,
  createAMapAgenticSectionPrompt,
  createAMapChatSectionPrompt,
} from './createAMapLlmPrompt'
import {
  createAMapRendererBasemapCode,
  createAMapRendererStyleCode,
  createUrbanDensityMapReadyCode,
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
      "const savedResultUrl = new URL(/* @vite-ignore */ './land-analysis.json', import.meta.url)",
    )
    expect(stats).toContain('const savedResultResponse = await fetch(savedResultUrl)')
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
    expect(urbanDensitySetupZ14TileFetcherCode).not.toContain('booleanIntersects')
    expect(urbanDensityCollectNonLiveableLandCode).toContain(
      'for (const [districtIndex, district] of districts.entries()) {',
    )
    expect(urbanDensityLiveableAreaCode).toContain(
      'excludedDistrictLand: featureCollection(excludedDistrictLand)',
    )
    expect(urbanDensityLiveableAreaCode).not.toContain('intersect(featureCollection')
    expect(urbanDensitySetupZ14TileFetcherCode).not.toContain('GEOSDifferencePrec')
    expect(urbanDensityLiveableAreaCode).not.toContain('liveableDistrictLand')
    expect(urbanDensityLiveableAreaCode).not.toContain('savedResult = analysisResult')
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

  test('gives agentic and web chat assistance the shared setup without handing over control', () => {
    const state = {
      objective: 'web',
      hostingValue: 'cloudflare',
      operatingSystem: 'Linux',
      preferredLocale: 'zh-Hant',
      terminalExperienceValue: 'none',
    }
    const agentPrompt = createAMapAgenticSectionPrompt(state, 'prerequisites')
    const chatPrompt = createAMapChatSectionPrompt(state, 'prerequisites')

    for (const prompt of [agentPrompt, chatPrompt]) {
      expect(prompt).toStartWith('## Overall project')
      expect(prompt).toContain(
        'We are building a SaanSeoi (a Hong Kong-based digital commons platform offering geospatial data; site: https://saanseoi.hk) digital map that will be hosted online as a stand-alone web app.',
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
      expect(prompt).toContain('## Step 0 : Prerequisites')
      expect(prompt).toContain('### Instructions')
      expect(prompt).toContain('### Verification')
      expect(prompt).not.toContain('### Ask these questions first')
      expect(prompt).toContain('preferred locale (zh-Hant)')
      expect(prompt).not.toContain('will take ownership of the work')
    }

    expect(agentPrompt).toContain('#### Linux')
    expect(agentPrompt).toContain('curl -fsSL https://bun.sh/install | bash')
    expect(agentPrompt).toContain('bun add -d wrangler')
    expect(agentPrompt).toContain('BUN_TMPDIR="$PWD/.bun-tmp"')
    expect(agentPrompt).toContain('BUN_INSTALL="$PWD/.bun-install"')
    expect(agentPrompt).toContain('bun dev')
    expect(agentPrompt).not.toContain('open another terminal tab or window')

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
      'As a web chat, we expect you cannot inspect or edit my computer directly',
    )
    expect(chatPrompt).toContain(
      'IMPORTANT: This is a collaborative assistance session, not a full hand-over.',
    )
    expect(chatPrompt).toContain(
      '- As a web chat, we expect you cannot inspect or edit my computer directly',
    )
    expect(chatPrompt).toContain(
      'State whether I should create, replace, or append the content.\n\nIMPORTANT: This is a collaborative assistance session',
    )
    expect(chatPrompt).toContain('Give me one command at a time')
    expect(chatPrompt).toContain('### Starting with the terminal')
    expect(chatPrompt).toContain('`Ctrl` + `Alt` + `T`')
    expect(agentPrompt).not.toContain('### Starting with the terminal')
    expect(agentPrompt).toContain(
      '## Working agreement\n\n- The guide builds the project in this order',
    )
    expect(agentPrompt).toContain('Inspect the existing workspace')
    expect(agentPrompt).toContain('not the clean basis expected by the guide')
    expect(agentPrompt).toContain('Stop for confirmation before any paid action')
    expect(agentPrompt).toContain('current workspace root only if it is not the')
    expect(agentPrompt).toContain(
      'An HTTP 200 response does not visually verify the app',
    )
    expect(agentPrompt).toContain('If browser access is unavailable,')
    expect(chatPrompt).toContain('Assume I am working in a new project folder')
    expect(chatPrompt).toContain('Terminal in `saanseoi-project`')
    expect(chatPrompt).toContain('Editor window in `src/main.ts`')
    expect(chatPrompt).not.toContain('Inspect the existing workspace')
    expect(chatPrompt).not.toContain('Stop for confirmation before any paid action')

    expect(agentPrompt).not.toContain('\n\n\n')
    expect(agentPrompt).not.toContain('tutorial.\n\n- Inspect')
    expect(agentPrompt).not.toContain('what they see.\n\n- This')
    expect(agentPrompt).toContain(
      'what they see.\n\nIMPORTANT: This is a collaborative assistance session',
    )
    expect(agentPrompt).not.toContain('current workspace root.\n\n\n#### Linux')
  })

  test('summarises each primary map objective in a complete sentence', () => {
    expect(
      createAMapAgenticSectionPrompt(
        { objective: 'local', preferredLocale: 'en' },
        'prerequisites',
      ),
    ).toContain('available locally on my computer.')
    expect(
      createAMapAgenticSectionPrompt(
        { objective: 'web', preferredLocale: 'en' },
        'prerequisites',
      ),
    ).toContain('hosted online as a stand-alone web app.')
    expect(
      createAMapAgenticSectionPrompt(
        { objective: 'web-embed', preferredLocale: 'en' },
        'prerequisites',
      ),
    ).toContain('hosted online and embedded in an existing site.')
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
    expect(prompt).toContain('VITE_SAANSEOI_API_KEY')
  })

  test('includes renderer-specific style code in agent and chat hand-offs', () => {
    const renderers = [
      ['maplibre', 'MapLibre', "import { Map } from 'maplibre-gl'"],
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
