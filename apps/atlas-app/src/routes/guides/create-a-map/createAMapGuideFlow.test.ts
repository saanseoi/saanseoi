import { describe, expect, mock, test } from 'bun:test'

mock.module('$app/server', () => ({
  command: (_schema: unknown, handler: unknown) => handler,
  getRequestEvent: () => ({ locals: {}, platform: undefined }),
}))

const { createPrerequisiteStepIds, isGuideSetupReady } = await import(
  './createAMapGuideFlow'
)

describe('create-a-map embedded website hosting flow', () => {
  test('asks for hosting after another website platform is selected', () => {
    expect(
      createPrerequisiteStepIds({
        aiAccess: undefined,
        isVpnRequired: false,
        llmMode: 'handover',
        notebookLibrary: undefined,
        objective: 'web-embed',
        websitePlatform: 'other',
      }),
    ).toEqual(['destination', 'llm-involvement', 'website-platform', 'hosting'])
  })

  test('requires a host for another website platform', () => {
    const selections = {
      agentTool: 'codex-cli' as const,
      codeEditor: undefined,
      llmMode: 'handover' as const,
      objective: 'web-embed' as const,
      operatingSystem: undefined,
      terminalExperience: 'basic' as const,
      usesAgenticAssistance: true,
      websitePlatform: 'other' as const,
    }

    expect(isGuideSetupReady(selections)).toBe(false)
    expect(isGuideSetupReady({ ...selections, hosting: 'cloudflare' })).toBe(true)
  })
})
