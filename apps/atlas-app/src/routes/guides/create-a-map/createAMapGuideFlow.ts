import { m } from '$lib/bits/internal/i18n'
import type { CreateAMapSelectionQuery } from '$lib/guides/createAMapSelections'

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
  isEditorReadinessComplete: boolean
  isLlmReadinessComplete: boolean
  isVpnRequired: boolean
  isZedSetupGuideProvided: boolean
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
    if (websitePlatform && websitePlatform !== 'other') ids.push('hosting')
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
  hosting,
  isEditorReadinessComplete,
  isLlmReadinessComplete,
  isVpnRequired,
  isZedSetupGuideProvided,
  llmMode,
  mobilePlatform,
  notebookLibrary,
  notebookRuntime,
  objective,
  operatingSystem,
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
          ? { id: 'platform', label: m.guide_embed_label(), answered: false }
          : websitePlatform === 'other'
            ? {
                id: 'platform',
                label: m.guide_host_label(),
                answered: Boolean(hosting),
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
      label: m.guide_objective_label(),
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
      label: m.guide_operating_system_label(),
      answered: !regularFlow || Boolean(operatingSystem),
    },
    {
      id: 'terminal-experience',
      label: m.guide_terminal_experience_label(),
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
    ...(platformQuestion ? [platformQuestion] : []),
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
        (objective === 'web-embed' &&
          websitePlatform &&
          (websitePlatform === 'other' || hosting)) ||
        (objective === 'mobile-embed' && mobileLibrary && mobilePlatform) ||
        (objective === 'notebook-embed' && notebookLibrary && notebookRuntime)),
  )
}
