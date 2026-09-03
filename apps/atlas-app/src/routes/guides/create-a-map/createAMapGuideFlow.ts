import { m } from '#lib/bits/internal/i18n.js'
import type { CreateAMapSelectionQuery } from '#lib/guides/createAMapSelections.js'

export type MissingPrerequisiteQuestion = {
  answered: boolean
  deferUntilId?: string
  id: string
  label: string
  reminderTitle?: string
}

type PrerequisiteStepInput = Pick<
  CreateAMapSelectionQuery,
  'aiAccess' | 'llmMode' | 'notebookLibrary' | 'objective' | 'websitePlatform'
> & {
  isVpnRequired: boolean
}

type MissingPrerequisiteInput = CreateAMapSelectionQuery & {
  isBasemapAccountReady: boolean
  isBasemapApiKeyReady: boolean
  isEditorReadinessComplete: boolean
  isLlmReadinessComplete: boolean
  isMapAccessible: boolean
  isMapboxTokenConfigured: boolean
  isPaymentConfirmed: boolean
  isPaymentConfirmationRequired: boolean
  isVpnRequired: boolean
  isZedSetupGuideProvided: boolean
  llmGuidanceEnabled: boolean
  selectedCodeEditor?: unknown
  selectedLlmOption?: unknown
}

export function createPrerequisiteStepIds({
  aiAccess,
  isVpnRequired,
  llmMode,
  notebookLibrary,
  objective,
  websitePlatform,
}: PrerequisiteStepInput) {
  const ids = ['destination', 'llm-involvement']

  if (llmMode === 'assisted') {
    ids.push('ai-access')
    if ((aiAccess === 'agentic' || aiAccess === 'web') && isVpnRequired) {
      ids.push('vpn-access')
    }

    if (aiAccess === 'agentic') {
      ids.push('terminal-experience', 'agent-tool')
    } else if (aiAccess === 'web') {
      ids.push('llm-service', 'operating-system', 'terminal-experience', 'code-editor')
    }
  } else if (llmMode === 'manual') {
    ids.push('operating-system', 'terminal-experience', 'code-editor')
  }

  if (objective === 'web') {
    ids.push('hosting')
  } else if (objective === 'web-embed') {
    ids.push('website-platform')
    if (websitePlatform) ids.push('hosting')
  } else if (objective === 'mobile-embed') {
    ids.push('mobile-platform')
  } else if (objective === 'notebook-embed') {
    ids.push('notebook-library')
    if (notebookLibrary) ids.push('notebook-runtime')
  }

  return ids
}

export function createMissingPrerequisiteQuestions({
  aiAccess,
  agentTool,
  codeEditor,
  dataFormat,
  dataSource,
  hosting,
  isBasemapAccountReady,
  isBasemapApiKeyReady,
  isEditorReadinessComplete,
  isLlmReadinessComplete,
  isMapAccessible,
  isMapboxTokenConfigured,
  isPaymentConfirmed,
  isPaymentConfirmationRequired,
  isVpnRequired,
  isZedSetupGuideProvided,
  llmGuidanceEnabled,
  llmMode,
  mobilePlatform,
  notebookLibrary,
  notebookRuntime,
  objective,
  operatingSystem,
  renderer,
  selectedCodeEditor,
  selectedLlmOption,
  terminalExperience,
  vpnAccess,
  websitePlatform,
}: MissingPrerequisiteInput): MissingPrerequisiteQuestion[] {
  const regularFlow =
    llmMode === 'manual' || (llmMode === 'assisted' && aiAccess === 'web')
  const platformQuestion: MissingPrerequisiteQuestion | undefined =
    objective === 'web'
      ? { id: 'platform', label: m.guide_host_label(), answered: Boolean(hosting) }
      : objective === 'web-embed'
        ? !websitePlatform
          ? {
              id: 'platform',
              label: m.guide_missing_website_platform(),
              answered: false,
            }
          : !hosting
            ? {
                id: 'platform',
                label: m.guide_host_label(),
                answered: false,
              }
            : undefined
        : objective === 'mobile-embed'
          ? !mobilePlatform
            ? {
                id: 'platform',
                label: m.guide_mobile_platform_label(),
                answered: false,
              }
            : undefined
          : objective === 'notebook-embed'
            ? !notebookLibrary
              ? {
                  id: 'platform',
                  label: m.guide_notebook_library_label(),
                  answered: false,
                }
              : !notebookRuntime
                ? {
                    id: 'platform',
                    label: m.guide_notebook_runtime_label(),
                    answered: false,
                  }
                : undefined
            : undefined

  return [
    {
      id: 'destination',
      label: m.guide_missing_objective(),
      answered: Boolean(objective),
    },
    { id: 'llm-involvement', label: m.guide_llm_label(), answered: Boolean(llmMode) },
    {
      id: 'ai-access',
      label: m.guide_agentic_ai_primer_choice_title(),
      answered: llmMode !== 'assisted' || Boolean(aiAccess),
    },
    {
      id: 'vpn-access',
      label: m.guide_vpn_access_label(),
      answered:
        !isVpnRequired || llmMode !== 'assisted' || !aiAccess || Boolean(vpnAccess),
    },
    {
      id: 'operating-system',
      label: m.guide_missing_operating_system(),
      answered: !regularFlow || Boolean(operatingSystem),
    },
    {
      id: 'terminal-experience',
      label: m.guide_missing_terminal_experience(),
      answered: (!regularFlow && aiAccess !== 'agentic') || Boolean(terminalExperience),
    },
    {
      id: 'code-editor',
      label: m.guide_code_editor_label(),
      answered: !regularFlow || Boolean(codeEditor),
    },
    {
      id: 'agent-tool',
      label: m.guide_agentic_ai_primer_agent_tools_title(),
      answered: aiAccess !== 'agentic' || Boolean(agentTool),
    },
    {
      id: 'payment-readiness',
      label: m.guide_payment_warning_successful(),
      reminderTitle: m.guide_missing_confirmation(),
      answered: !isPaymentConfirmationRequired || isPaymentConfirmed,
    },
    {
      id: 'llm-readiness',
      label: m.guide_agentic_ai_readiness_eyebrow(),
      reminderTitle: m.guide_missing_confirmation(),
      answered: !selectedLlmOption || isLlmReadinessComplete,
      deferUntilId: isZedSetupGuideProvided ? 'zed-setup-guide' : undefined,
    },
    {
      id: 'code-editor-readiness',
      label: m.guide_code_editor_readiness_eyebrow(),
      reminderTitle: m.guide_missing_confirmation(),
      answered: !regularFlow || !selectedCodeEditor || isEditorReadinessComplete,
    },
    {
      id: 'map-library',
      label: m.guide_renderer_label(),
      answered:
        objective === 'mobile-embed' ||
        objective === 'notebook-embed' ||
        Boolean(renderer),
    },
    ...(platformQuestion ? [platformQuestion] : []),
    {
      id: 'mapbox-account-readiness',
      label: m.guide_renderer_mapbox_account_title(),
      reminderTitle: m.guide_missing_confirmation(),
      answered: renderer !== 'mapbox' || isMapboxTokenConfigured,
    },
    {
      id: 'basemap-account-readiness',
      label: m.guide_basemap_account(),
      reminderTitle: m.guide_missing_confirmation(),
      answered: isBasemapAccountReady,
    },
    {
      id: 'basemap-api-key-readiness',
      label: m.api_keys_title(),
      reminderTitle: m.guide_missing_confirmation(),
      answered: !isBasemapAccountReady || isBasemapApiKeyReady,
    },
    {
      id: 'project-data',
      label: m.guide_data_label(),
      answered: Boolean(dataSource),
    },
    {
      id: 'data-format',
      label: m.guide_data_format_label(),
      answered: dataSource !== 'existing' || Boolean(dataFormat),
    },
    {
      id:
        hosting === 'other'
          ? 'publish-other-readiness'
          : 'publish-accessibility-readiness',
      label:
        hosting === 'other'
          ? m.guide_publish_other_ready()
          : m.guide_publish_accessibility_title(),
      reminderTitle: m.guide_missing_confirmation(),
      answered: !hosting || isMapAccessible,
    },
  ]
}

export function isGuideSetupReady({
  agentTool,
  codeEditor,
  hosting,
  llmMode,
  mobileLibrary,
  mobilePlatform,
  notebookLibrary,
  notebookRuntime,
  objective,
  operatingSystem,
  terminalExperience,
  usesAgenticAssistance,
  websitePlatform,
}: CreateAMapSelectionQuery & { usesAgenticAssistance: boolean }) {
  return Boolean(
    objective &&
      terminalExperience &&
      (usesAgenticAssistance
        ? agentTool
        : operatingSystem && (llmMode === 'handover' || codeEditor)) &&
      (objective === 'local' ||
        (objective === 'web' && hosting) ||
        (objective === 'web-embed' && websitePlatform && hosting) ||
        (objective === 'mobile-embed' && mobileLibrary && mobilePlatform) ||
        (objective === 'notebook-embed' && notebookLibrary && notebookRuntime)),
  )
}
