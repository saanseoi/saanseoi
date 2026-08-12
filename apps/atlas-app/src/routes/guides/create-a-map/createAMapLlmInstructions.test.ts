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

describe('Create a Map LLM instructions', () => {
  test('renders the complete guide', () => {
    const instructions = createAMapLlmInstructions()

    expect(instructions).toContain('# SaanSeoi:')
    expect(instructions).toContain('## Prerequisites')
    expect(instructions).toContain('```bash')
    expect(instructions).toContain('## Render the map')
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

  test('names the next section or confirms guide completion', () => {
    expect(createAMapAgenticSectionPrompt({ preferredLocale: 'en' }, 'data')).toContain(
      'The single next action is for you to continue with the “Publish” section of the guide. Read it until it provides you with a prompt to share with me again.”',
    )
    expect(
      createAMapAgenticSectionPrompt({ preferredLocale: 'en' }, 'publish'),
    ).toContain('this is the final section of the guide')
  })
})
