import { describe, expect, mock, test } from 'bun:test'

mock.module('$app/server', () => ({
  command: (_schema: unknown, handler: unknown) => handler,
  getRequestEvent: () => ({ locals: {}, platform: undefined }),
}))

const {
  createMissingPrerequisiteQuestions,
  createPrerequisiteStepIds,
  isGuideSetupReady,
} = await import('./createAMapGuideFlow')

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

  test('reminds a user to confirm publication before embedding', () => {
    const questions = createMissingPrerequisiteQuestions({
      agentTool: undefined,
      aiAccess: undefined,
      codeEditor: 'cursor',
      dataFormat: 'csv',
      dataSource: 'existing',
      hosting: 'github-pages',
      isBasemapAccountReady: true,
      isBasemapApiKeyReady: true,
      isEditorReadinessComplete: true,
      isLlmReadinessComplete: true,
      isMapAccessible: false,
      isMapboxTokenConfigured: false,
      isPaymentConfirmed: true,
      isPaymentConfirmationRequired: false,
      isVpnRequired: false,
      isZedSetupGuideProvided: false,
      llmGuidanceEnabled: false,
      llmMode: 'manual',
      mobilePlatform: undefined,
      notebookLibrary: undefined,
      notebookRuntime: undefined,
      objective: 'web-embed',
      operatingSystem: 'windows',
      renderer: 'leaflet',
      selectedCodeEditor: {},
      selectedLlmOption: undefined,
      terminalExperience: 'basic',
      vpnAccess: undefined,
      websitePlatform: 'webflow',
    })

    expect(questions).toContainEqual(
      expect.objectContaining({
        answered: false,
        id: 'publish-accessibility-readiness',
      }),
    )
  })
})
