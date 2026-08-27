<script lang="ts">
import { page } from '$app/state'
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { onMount, tick } from 'svelte'

import codexCliTrustDirectory from '#lib/assets/guides/codex-cli-trust-directory.png'
import sublimeOpenStyleCss from '#lib/assets/guides/editor-sublime-open-style-css.png'
import leafletSetupResult from '#lib/assets/guides/leaflet-setup-result.png'
import mapboxSetupResult from '#lib/assets/guides/mapbox-setup-result.png'
import ownDataHongKongChoropleth from '#lib/assets/guides/own-data-hong-kong-choropleth.png'
import saanSeoiDataHongKongSquare from '#lib/assets/guides/saanseoi-data-hong-kong-square.png'
import {
  CreateAMap,
  GuideAgenticAiPrimer,
  GuideCallout,
  GuideChoiceGroup,
  GuideCodeBlock,
  GuideCreateAMapVersionNotice,
  GuideEditorCardExplainer,
  GuideEditorProjectSetupSection,
  GuideEditorReadiness,
  GuideLlmReadiness,
  GuideLlmPromptSection,
  GuideMapboxTokenReadiness,
  GuideManualSetup,
  GuideMissingAnswerReminder,
  GuideParagraph,
  GuidePaymentWarning,
  GuidePlatformSelection,
  GuidePreviewCodeBlock,
  GuideReadinessPanel,
  GuideReference,
  GuideRoot,
  GuideScreenshot,
  GuideSection,
  GuideSubSectionBody,
  GuideSubSectionHeader,
  GuideTerminalIntroduction,
  GuideUrbanDensityExample,
  GuidePromptBlock,
} from '#lib/bits/pages/guides/index.js'
import { Seo } from '#lib/bits/patterns/seo/index.js'
import { Button } from '#lib/bits/primitives/button/index.js'
import { Main } from '#lib/bits/primitives/main/index.js'
import { getCurrentLocale, m } from '#lib/bits/internal/i18n.js'
import { scrollToElementBelowHeader } from '#lib/bits/utilities/helpers/scrollToElementBelowHeader.js'
import {
  createAMapStylePreviewUrl,
  createAMapTileset,
  detectOperatingSystem,
  getCreateAMapQueryChoice,
  type CreateAMapSelectionValue,
} from '#lib/guides/createAMapSelections.js'
import { mapStyleDefinitions } from '@repo/basemap'
import { trackClientProductUsage } from '#lib/analytics/clientProductUsage.js'

import { createCreateAMapGuideAdapter } from './createAMapGuideAdapter.svelte'
import {
  createMissingPrerequisiteQuestions,
  createPrerequisiteStepIds,
  isGuideSetupReady,
} from './createAMapGuideFlow'
import {
  getAgentModel,
  getAgentModelSelectionInstruction,
  getAgentPricing,
  getChatPricing,
  getSelectedLlmChatUrl,
  llmSetupLinks,
} from './createAMapGuideProviders'
import { createCreateAMapGuidePresentation } from './createAMapGuidePresentation'
import {
  createAgentProjectCommand,
  createDeploymentCode,
  editorCardExplainerCode,
  editorCardExplainerDisplayCode,
  createNotebookCode,
  createNotebookSetupCode,
  createProjectSetupCode,
  createRestartProjectCode,
  createUrbanDensityMapReadyCode,
  createAMapRendererBasemapCode,
  createAMapRendererStyleCode,
  getBunInstallCode,
  getCreateAMapRendererReference,
  getHostingInstallCode,
  getRendererTerminalCommand,
  iframeCode,
  mapboxTokenCode,
  urbanDensityMapCode,
  urbanDensityCensusAreasCode,
  urbanDensityCalculationCode,
  urbanDensityCalculationDisplayCode,
  urbanDensityMetricsCode,
  urbanDensityMetricsCss,
  urbanDensityMetricsCssDisplayCode,
  urbanDensityLiveableAreaCode,
  urbanDensityLiveableMetricsCode,
  urbanDensityStatsCode,
  urbanDensityStatsDisplayCode,
  urbanDensityTurfInstallCode,
  viteReadyOutput,
} from './snippets'
import GuideCreateAMapAccountComplete from './guideCreateAMapAccountComplete.svelte'
import GuideCreateAMapApiKeys from './guideCreateAMapApiKeys.svelte'
import GuideMapLibreBlankPreview from '#lib/bits/pages/guides/patterns/createAMap/guideMapLibreBlankPreview.svelte'
import GuideMapLibreStylePreview from '#lib/bits/pages/guides/patterns/createAMap/guideMapLibreStylePreview.svelte'
import {
  createAMapAgenticHandoverPrompt,
  createAMapAgenticSectionPrompt,
  createAMapChatHandoverPrompt,
  createAMapChatSectionPrompt,
  type CreateAMapLlmPromptState,
} from './createAMapLlmPrompt'

type Objective = CreateAMapSelectionValue<'objective'>
type AgentTool = CreateAMapSelectionValue<'agentTool'>
type CodeEditor = CreateAMapSelectionValue<'codeEditor'>
type HandoverChatLlm = Extract<
  CreateAMapSelectionValue<'llm'>,
  'chatgpt' | 'claude' | 'deepseek' | 'gemini' | 'kimi'
>
type VpnAccess = CreateAMapSelectionValue<'vpnAccess'>
type WebsitePlatform = CreateAMapSelectionValue<'websitePlatform'>

let locale = $derived(getCurrentLocale())
let isVpnRequired = $derived(page.data.isVpnRequired)
let visitorRegionCode = $derived(page.data.visitorRegionCode)
const vpnRegionLabels = {
  CN: () => m.guide_vpn_region_cn(),
  HK: () => m.guide_vpn_region_hk(),
  JP: () => m.guide_vpn_region_jp(),
  MO: () => m.guide_vpn_region_mo(),
} as const
let visitorRegionLabel = $derived.by(() => {
  locale
  return visitorRegionCode
    ? vpnRegionLabels[visitorRegionCode as keyof typeof vpnRegionLabels]?.()
    : undefined
})
let vpnAccess = $state<VpnAccess | undefined>(
  getCreateAMapQueryChoice(page.url.searchParams, 'vpnAccess'),
)
let objective = $state<Objective | undefined>(
  getCreateAMapQueryChoice(page.url.searchParams, 'objective'),
)
let operatingSystem = $state(
  getCreateAMapQueryChoice(page.url.searchParams, 'operatingSystem'),
)
let terminalExperience = $state(
  getCreateAMapQueryChoice(page.url.searchParams, 'terminalExperience'),
)
let codeEditor = $state<CodeEditor | undefined>(
  getCreateAMapQueryChoice(page.url.searchParams, 'codeEditor'),
)
let llmMode = $state(getCreateAMapQueryChoice(page.url.searchParams, 'llmMode'))
let aiAccess = $state(getCreateAMapQueryChoice(page.url.searchParams, 'aiAccess'))
let agentTool = $state<AgentTool | undefined>(
  getCreateAMapQueryChoice(page.url.searchParams, 'agentTool'),
)
let llm = $state(getCreateAMapQueryChoice(page.url.searchParams, 'llm') ?? 'other')
let hosting = $state(getCreateAMapQueryChoice(page.url.searchParams, 'hosting'))
let websitePlatform = $state(
  getCreateAMapQueryChoice(page.url.searchParams, 'websitePlatform'),
)
let mobileLibrary = $state(
  getCreateAMapQueryChoice(page.url.searchParams, 'mobileLibrary'),
)
let mobilePlatform = $state(
  getCreateAMapQueryChoice(page.url.searchParams, 'mobilePlatform'),
)
let notebookLibrary = $state(
  getCreateAMapQueryChoice(page.url.searchParams, 'notebookLibrary'),
)
let notebookRuntime = $state(
  getCreateAMapQueryChoice(page.url.searchParams, 'notebookRuntime'),
)
let renderer = $state(getCreateAMapQueryChoice(page.url.searchParams, 'renderer'))
let region = $state(getCreateAMapQueryChoice(page.url.searchParams, 'region'))
let style = $state(getCreateAMapQueryChoice(page.url.searchParams, 'style'))
let dataSource = $state(getCreateAMapQueryChoice(page.url.searchParams, 'dataSource'))
let mapboxTokenConfigured = $state(
  page.url.searchParams.get('mapbox-token-ready') === 'true',
)
let completedDataKey = $state(page.url.searchParams.get('data-ready') ?? undefined)
let llmDialogOpen = $state(false)
let copiedPromptProvider = $state<'local' | 'gemini' | 'kimi'>()
let copyPromptFailed = $state(false)
let handoverAgentPromptCopied = $state(false)
let guideLinkCopied = $state(false)
let guideLinkCopyFailed = $state(false)
let completedEditorReadinessKey = $state(
  page.url.searchParams.get('editor-ready') ?? undefined,
)

let completedLlmReadinessKey = $state(
  page.url.searchParams.get('llm-ready') ?? undefined,
)
let completedPaymentKey = $state(
  page.url.searchParams.get('payment-ready') ?? undefined,
)
let paymentCompletionWarning = $state(false)
let agenticAiPrimerExpanded = $state(
  page.url.searchParams.get('ai-primer') !== 'collapsed',
)
let terminalIntroductionExpanded = $state(
  page.url.searchParams.get('terminal-101') !== 'collapsed',
)
let zedSetupExpanded = $state(page.url.searchParams.has('zed-setup'))
let zedSetupContentExpanded = $state(
  page.url.searchParams.get('zed-setup') !== 'collapsed',
)
let analyticsTrackingStarted = $state(false)
let guideWasComplete = $state(false)
let hasBasemapApiKey = $state(page.url.searchParams.get('basemap-key-ready') === 'true')
let usingExistingBasemapApiKey = $state(false)

let editorReadinessKey = $derived(`${operatingSystem ?? ''}:${codeEditor ?? ''}`)
let dataReadinessKey = $derived(dataSource ?? '')
let isDataStepComplete = $derived(
  Boolean(dataReadinessKey) && completedDataKey === dataReadinessKey,
)
let isEditorReadinessComplete = $derived(
  completedEditorReadinessKey === editorReadinessKey,
)
let isProjectEditorReady = $derived(
  objective === 'notebook-embed' ||
    objective === 'mobile-embed' ||
    isEditorReadinessComplete,
)
let llmReadinessKey = $derived(
  aiAccess === 'agentic' && agentTool
    ? `agentic:${agentTool}`
    : aiAccess === 'web'
      ? `web:${llm}`
      : undefined,
)
let isZedSetupGuideProvided = $derived(aiAccess === 'agentic' && agentTool === 'zed')
let isLlmReadinessComplete = $derived(completedLlmReadinessKey === llmReadinessKey)
let isBasemapReady = $derived(Boolean(page.data.user) && hasBasemapApiKey)
let basemapAccountContinueUrl = $derived.by(() => {
  const url = new URL(page.url.href)
  url.searchParams.set('basemap-account', 'complete')
  return `${url.pathname}${url.search}${url.hash}`
})

const completeEditorReadiness = () => {
  completedEditorReadinessKey = editorReadinessKey
  trackClientProductUsage({
    event: 'guide.milestone',
    surface: 'guide',
    entityType: 'action',
    entityId: 'editor_ready',
  })
}

const completeDataStep = () => {
  if (!dataReadinessKey) return

  completedDataKey = dataReadinessKey
  trackClientProductUsage({
    event: 'guide.milestone',
    surface: 'guide',
    entityType: 'action',
    entityId: 'data_ready',
  })
}

const resetDataStep = () => {
  completedDataKey = undefined
}

const completeLlmReadiness = () => {
  if (!llmReadinessKey) return
  if (!isPaymentConfirmed) {
    paymentCompletionWarning = true
    trackClientProductUsage({
      event: 'guide.milestone',
      surface: 'guide',
      entityType: 'action',
      entityId: 'llm_ready',
      outcome: 'failure',
    })
    return
  }

  completedLlmReadinessKey = llmReadinessKey
  zedSetupExpanded = false
  zedSetupContentExpanded = true
  trackClientProductUsage({
    event: 'guide.milestone',
    surface: 'guide',
    entityType: 'action',
    entityId: 'llm_ready',
  })
}

const confirmPaymentSuccessful = () => {
  if (!llmReadinessKey) return

  completedPaymentKey = llmReadinessKey
  paymentCompletionWarning = false
  trackClientProductUsage({
    event: 'guide.milestone',
    surface: 'guide',
    entityType: 'action',
    entityId: 'payment_ready',
  })
}

const resetPayment = () => {
  completedPaymentKey = undefined
  paymentCompletionWarning = false
}

const resetLlmReadiness = () => {
  completedLlmReadinessKey = undefined
}

const resetEditorReadiness = () => {
  completedEditorReadinessKey = undefined
}

const completeMapboxToken = () => {
  mapboxTokenConfigured = true
  trackClientProductUsage({
    event: 'guide.milestone',
    surface: 'guide',
    entityType: 'action',
    entityId: 'mapbox_token_ready',
  })
}

const resetMapboxToken = () => {
  mapboxTokenConfigured = false
}

const openZedSetup = async () => {
  zedSetupExpanded = true
  zedSetupContentExpanded = true
  trackClientProductUsage({
    event: 'guide.milestone',
    surface: 'guide',
    entityType: 'action',
    entityId: 'zed_setup_open',
  })
  await tick()

  const guide = document.getElementById('zed-setup-guide')
  if (!guide) return

  scrollToElementBelowHeader(guide)
}

const getSelection = () => ({
  objective,
  operatingSystem,
  terminalExperience,
  codeEditor,
  llmMode,
  aiAccess,
  vpnAccess,
  agentTool,
  llm,
  hosting,
  websitePlatform,
  mobileLibrary,
  mobilePlatform,
  notebookLibrary,
  notebookRuntime,
  renderer,
  region,
  style,
  dataSource,
})

createCreateAMapGuideAdapter({
  getAnalyticsTrackingStarted: () => analyticsTrackingStarted,
  getCurrentUrl: () => page.url,
  getSelection,
  getUrlState: () => ({
    ...getSelection(),
    basemapApiKeyReady: hasBasemapApiKey,
    completedDataKey,
    completedEditorReadinessKey,
    completedLlmReadinessKey,
    completedPaymentKey,
    mapboxTokenConfigured,
    agenticAiPrimerExpanded,
    terminalIntroductionExpanded,
    zedSetupExpanded,
    zedSetupContentExpanded,
  }),
})

const guidePresentation = $derived.by(() =>
  createCreateAMapGuidePresentation({
    objective,
    llmMode,
    aiAccess,
    terminalExperience,
    vpnAccess,
    isVpnRequired,
    visitorRegionLabel,
    locale,
  }),
)
const guideUnlocked = $derived(guidePresentation.guideUnlocked)
const usesAgenticAssistance = $derived(guidePresentation.usesAgenticAssistance)
const showPublishStep = $derived(guidePresentation.showPublishStep)
const guideOutline = $derived(guidePresentation.outline)
const foundations = $derived(guidePresentation.foundations)
const objectiveChoices = $derived(guidePresentation.objectiveChoices)
const operatingSystemChoices = $derived(guidePresentation.operatingSystemChoices)
const terminalExperienceChoices = $derived(guidePresentation.terminalExperienceChoices)
const vpnAccessChoices = $derived(guidePresentation.vpnAccessChoices)
const codeEditorChoices = $derived(guidePresentation.codeEditorChoices)
const llmChoices = $derived(guidePresentation.llmChoices)
const aiAccessChoices = $derived(guidePresentation.aiAccessChoices)
const agentToolChoices = $derived(guidePresentation.agentToolChoices)
const chatAiServiceChoices = $derived(guidePresentation.chatAiServiceChoices)
const agentToolHint = $derived(guidePresentation.agentToolHint)
const chatAiServiceHint = $derived(guidePresentation.chatAiServiceHint)
const reconcileGuideSelections = () => {
  if (
    agentTool &&
    !guidePresentation.agentToolChoices.some(choice => choice.value === agentTool)
  ) {
    agentTool = undefined
    completedLlmReadinessKey = undefined
  }

  if (
    aiAccess === 'web' &&
    !guidePresentation.chatAiServiceChoices.some(choice => choice.value === llm)
  ) {
    llm = 'other'
    completedLlmReadinessKey = undefined
  }
}

$effect(reconcileGuideSelections)

const selectedLlmOption = $derived.by(() => {
  const choice =
    aiAccess === 'agentic'
      ? agentToolChoices.find(option => option.value === agentTool)
      : aiAccess === 'web'
        ? chatAiServiceChoices.find(option => option.value === llm)
        : undefined

  if (!choice) return undefined

  return {
    ...choice,
    ...llmSetupLinks[choice.value],
    ...(choice.value === 'codex-app' && operatingSystem === 'linux'
      ? { setupUrl: 'https://github.com/ilysenko/codex-desktop-linux' }
      : {}),
  }
})
const selectedLlmReadinessName = $derived(
  aiAccess === 'web' && llm === 'other'
    ? m.guide_agentic_ai_readiness_chat_other_name()
    : aiAccess === 'agentic' && agentTool === 'other'
      ? m.guide_agentic_ai_readiness_agent_other_name()
      : (selectedLlmOption?.label ?? ''),
)
const llmReadinessIncompleteDescription = $derived(
  aiAccess === 'web'
    ? m.guide_agentic_ai_readiness_chat_description({ name: selectedLlmReadinessName })
    : agentTool === 'other'
      ? m.guide_agentic_ai_readiness_other_agent_prompt()
      : m.guide_agentic_ai_readiness_agent_prompt({ name: selectedLlmReadinessName }),
)
const llmReadinessCompleteDescription = $derived(
  m.guide_agentic_ai_readiness_complete_description({ name: selectedLlmReadinessName }),
)
const llmReadinessDetailsDescription = $derived(
  aiAccess === 'web'
    ? m.guide_agentic_ai_readiness_chat_description({ name: selectedLlmReadinessName })
    : m.guide_agentic_ai_readiness_description({ name: selectedLlmReadinessName }),
)
const isPaymentConfirmationRequired = $derived(
  isVpnRequired &&
    aiAccess === 'agentic' &&
    ['codex-app', 'codex-cli', 'claude-cowork', 'claude-code'].includes(
      agentTool ?? '',
    ),
)
const isPaymentConfirmed = $derived(
  !isPaymentConfirmationRequired || completedPaymentKey === llmReadinessKey,
)
const agentModel = $derived.by(() => {
  locale
  return getAgentModel(agentTool)
})
const agentModelSelectionInstruction = $derived.by(() => {
  locale
  return getAgentModelSelectionInstruction(agentTool)
})
const agentPricing = $derived.by(() => {
  locale
  return getAgentPricing(
    agentTool,
    m
      .guide_agentic_ai_readiness_payment_note()
      .replace('Hong Kong', visitorRegionLabel ?? ''),
  )
})
const chatPricing = $derived.by(() => {
  locale
  return getChatPricing({ aiAccess, llm })
})
const rendererChoices = $derived.by(() => {
  locale
  return [
    {
      value: 'maplibre',
      badge: m.guide_renderer_recommended(),
      icon: 'simple-icons:maplibre',
      label: m.guide_renderer_maplibre(),
      description: m.guide_renderer_maplibre_description(),
    },
    {
      value: 'mapbox',
      icon: 'simple-icons:mapbox',
      label: m.guide_renderer_mapbox(),
      description: m.guide_renderer_mapbox_description(),
    },
    {
      value: 'leaflet',
      icon: 'simple-icons:leaflet',
      label: m.guide_renderer_leaflet(),
      description: m.guide_renderer_leaflet_description(),
    },
  ]
})
const regionChoices = $derived.by(() => {
  locale
  return [
    {
      value: 'hk',
      label: m.guide_basemap_hk(),
      description: m.guide_basemap_hk_description(),
      image: 'https://tiles.saanseoi.hk/render/hk/hongkong-latest-light.webp',
      darkImage: 'https://tiles.saanseoi.hk/render/hk/hongkong-latest-dark.webp',
    },
    {
      value: 'mo',
      label: m.guide_basemap_mo(),
      description: m.guide_basemap_mo_description(),
      image: 'https://tiles.saanseoi.hk/render/mo/macau-latest-light.webp',
      darkImage: 'https://tiles.saanseoi.hk/render/mo/macau-latest-dark.webp',
    },
    {
      value: 'gba',
      label: m.guide_basemap_gba(),
      description: m.guide_basemap_gba_description(),
      image: 'https://tiles.saanseoi.hk/render/gba/gba-latest-light.webp',
      darkImage: 'https://tiles.saanseoi.hk/render/gba/gba-latest-dark.webp',
    },
  ]
})
const dataChoices = $derived.by(() => {
  locale
  return [
    {
      value: 'api',
      label: m.guide_data_api(),
      description: m.guide_data_api_description(),
      image: saanSeoiDataHongKongSquare,
    },
    {
      value: 'existing',
      label: m.guide_data_existing(),
      description: m.guide_data_existing_description(),
      image: ownDataHongKongChoropleth,
    },
  ]
})
const handoverChatChoices = $derived.by(
  (): Array<{
    value: HandoverChatLlm
    label: string
    icon: string
    requiresPaste: boolean
  }> => {
    locale
    return [
      {
        value: 'chatgpt',
        label: m.guide_llm_chatgpt(),
        icon: 'simple-icons:openai',
        requiresPaste: false,
      },
      {
        value: 'claude',
        label: m.guide_llm_claude(),
        icon: 'simple-icons:anthropic',
        requiresPaste: false,
      },
      {
        value: 'deepseek',
        label: m.guide_llm_deepseek(),
        icon: 'simple-icons:deepseek',
        requiresPaste: false,
      },
      {
        value: 'gemini',
        label: m.guide_llm_gemini(),
        icon: 'simple-icons:googlegemini',
        requiresPaste: true,
      },
      {
        value: 'kimi',
        label: m.guide_llm_kimi(),
        icon: 'simple-icons:moonshotai',
        requiresPaste: true,
      },
    ]
  },
)

const scrollPrimerToTop = async (id: string) => {
  await tick()

  const primer = document.getElementById(id)
  if (!primer) return

  scrollToElementBelowHeader(primer)
}

const handleLlmModeChange = (value: string) => {
  if (value === 'handover') {
    llmDialogOpen = true
    trackClientProductUsage({
      event: 'guide.handover',
      surface: 'guide',
      entityType: 'action',
      entityId: 'open',
    })
  }
  if (value === 'assisted') void scrollPrimerToTop('agentic-ai-primer')
}
const handleTerminalExperienceChange = (value: string) => {
  if (value === 'none') void scrollPrimerToTop('terminal-introduction')
}
const handleAgentToolChange = (value: string) => {
  if (value === 'zed') void openZedSetup()
}
const handleObjectiveChange = (value: string) => {
  objective = value as Objective
  hosting = objective === 'web' ? 'cloudflare' : undefined
  websitePlatform = undefined
  mobileLibrary = objective === 'mobile-embed' ? 'maplibre-native' : undefined
  mobilePlatform = undefined
  notebookLibrary = undefined
  notebookRuntime = undefined
}
const handleWebsitePlatformChange = (value: string) => {
  websitePlatform = value as WebsitePlatform
  hosting = value === 'other' ? undefined : 'cloudflare'
}
const handleRendererChange = (value: string) => {
  renderer = value as CreateAMapSelectionValue<'renderer'>
  resetMapboxToken()
}

onMount(() => {
  operatingSystem ??= detectOperatingSystem(navigator.userAgent)
  analyticsTrackingStarted = true

  if (page.url.searchParams.get('basemap-account') === 'complete') {
    void tick().then(() => {
      const basemap = document.getElementById('basemap')
      if (basemap) scrollToElementBelowHeader(basemap)
    })
  }
})

const createHandoverChatUrls = (prompt: string) => {
  const encodedPrompt = encodeURIComponent(prompt)
  return {
    chatgpt: `https://chatgpt.com/?q=${encodedPrompt}`,
    claude: `https://claude.ai/new?q=${encodedPrompt}`,
    deepseek: `https://chat.deepseek.com/?q=${encodedPrompt}`,
    gemini: 'https://gemini.google.com/app',
    kimi: 'https://www.kimi.com/',
  }
}

const openLlmWithoutPrompt = async (provider: 'gemini' | 'kimi', prompt: string) => {
  const handoverChatUrls = createHandoverChatUrls(prompt)
  const url = provider === 'gemini' ? handoverChatUrls.gemini : handoverChatUrls.kimi
  window.open(url, '_blank', 'noopener,noreferrer')
  trackClientProductUsage({
    event: 'guide.provider_open',
    surface: 'guide',
    entityType: 'provider',
    entityId: provider,
  })

  copiedPromptProvider = provider
  copyPromptFailed = false

  try {
    await navigator.clipboard.writeText(prompt)
    trackClientProductUsage({
      event: 'guide.prompt_copy',
      surface: 'guide',
      entityType: 'action',
      entityId: 'handover',
    })
  } catch {
    copyPromptFailed = true
    trackClientProductUsage({
      event: 'guide.prompt_copy',
      surface: 'guide',
      entityType: 'action',
      entityId: 'handover',
      outcome: 'failure',
    })
  }
}

const openChatHandover = async (provider: HandoverChatLlm) => {
  if (provider === 'gemini' || provider === 'kimi') {
    await openLlmWithoutPrompt(provider, chatHandoverPrompt)
    return
  }

  window.open(
    createHandoverChatUrls(chatHandoverPrompt)[provider],
    '_blank',
    'noopener,noreferrer',
  )
  trackClientProductUsage({
    event: 'guide.provider_open',
    surface: 'guide',
    entityType: 'provider',
    entityId: provider,
  })
}

const copyAgenticHandoverPrompt = async () => {
  copiedPromptProvider = 'local'
  copyPromptFailed = false

  try {
    await navigator.clipboard.writeText(agenticHandoverPrompt)
    handoverAgentPromptCopied = true
    trackClientProductUsage({
      event: 'guide.prompt_copy',
      surface: 'guide',
      entityType: 'action',
      entityId: 'handover_agent',
    })
    window.setTimeout(() => (handoverAgentPromptCopied = false), 1600)
  } catch {
    copyPromptFailed = true
    trackClientProductUsage({
      event: 'guide.prompt_copy',
      surface: 'guide',
      entityType: 'action',
      entityId: 'handover_agent',
      outcome: 'failure',
    })
  }
}

const guideUrl = $derived(new URL('/guides/create-a-map', page.url.origin).toString())
const guideLlmInstructionsUrl = $derived(
  new URL('/guides/create-a-map/llms.txt', page.url.origin).toString(),
)

const copyGuideLink = async () => {
  guideLinkCopyFailed = false

  try {
    await navigator.clipboard.writeText(guideUrl)
    guideLinkCopied = true
    trackClientProductUsage({
      event: 'guide.share',
      surface: 'guide',
      entityType: 'action',
      entityId: 'copy_link',
    })
    window.setTimeout(() => (guideLinkCopied = false), 1600)
  } catch {
    guideLinkCopyFailed = true
    trackClientProductUsage({
      event: 'guide.share',
      surface: 'guide',
      entityType: 'action',
      entityId: 'copy_link',
      outcome: 'failure',
    })
  }
}

const shareGuide = async () => {
  if (!navigator.share) {
    await copyGuideLink()
    return
  }

  try {
    await navigator.share({
      title: m.guide_create_map_title(),
      text: m.guide_share_description(),
      url: guideUrl,
    })
    trackClientProductUsage({
      event: 'guide.share',
      surface: 'guide',
      entityType: 'action',
      entityId: 'native_share',
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      trackClientProductUsage({
        event: 'guide.share',
        surface: 'guide',
        entityType: 'action',
        entityId: 'native_share',
        outcome: 'cancelled',
      })
    } else {
      trackClientProductUsage({
        event: 'guide.share',
        surface: 'guide',
        entityType: 'action',
        entityId: 'native_share',
        outcome: 'failure',
      })
      await copyGuideLink()
    }
  }
}

const shareExternalLink = (provider: string) => {
  trackClientProductUsage({
    event: 'guide.share',
    surface: 'guide',
    entityType: 'provider',
    entityId: provider,
  })
}

const trackGuideExternalOpen = (kind: 'setup' | 'sign_up' | 'openrouter') => {
  const provider = aiAccess === 'agentic' ? agentTool : llm
  trackClientProductUsage({
    event: 'guide.provider_open',
    surface: 'guide',
    entityType: 'provider',
    entityId: `${kind}:${provider ?? 'provider'}`,
  })
}

const shareLinks = $derived.by(() => {
  locale
  const url = encodeURIComponent(guideUrl)
  const text = encodeURIComponent(m.guide_share_description())
  const emailSubject = encodeURIComponent(m.guide_share_email_subject())
  const emailBody = encodeURIComponent(m.guide_share_email_body({ url: guideUrl }))

  return [
    {
      href: `https://www.threads.net/intent/post?text=${text}%20${url}`,
      icon: 'simple-icons:threads',
      label: m.guide_share_threads(),
    },
    {
      href: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      icon: 'simple-icons:twitter',
      label: m.guide_share_twitter(),
    },
    {
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      icon: 'simple-icons:linkedin',
      label: m.guide_share_linkedin(),
    },
    {
      href: `https://service.weibo.com/share/share.php?url=${url}&title=${text}`,
      icon: 'simple-icons:sinaweibo',
      label: m.guide_share_weibo(),
    },
    {
      href: `mailto:?subject=${emailSubject}&body=${emailBody}`,
      icon: 'lucide:mail',
      label: m.guide_share_email(),
      newWindow: false,
    },
  ]
})

const pastePromptMessage = $derived.by(() => {
  if (!copiedPromptProvider) return ''

  if (copiedPromptProvider === 'local') {
    return copyPromptFailed
      ? m.guide_llm_copy_failed_local()
      : m.guide_llm_paste_prompt_local()
  }

  const name =
    handoverChatChoices.find(choice => choice.value === copiedPromptProvider)?.label ??
    ''
  return copyPromptFailed
    ? m.guide_llm_copy_failed({ name })
    : m.guide_llm_paste_prompt({ name })
})

$effect(() => {
  if (!llmDialogOpen) {
    copiedPromptProvider = undefined
    copyPromptFailed = false
    handoverAgentPromptCopied = false
  }
})
const tileset = $derived(createAMapTileset(region))
const tilejsonUrl = $derived(`https://tiles.saanseoi.hk/${tileset}-latest.json`)
const selectedStyle = $derived(
  mapStyleDefinitions.find(candidate => candidate.id === style),
)
const styleUrl = $derived(
  selectedStyle
    ? `https://api.saanseoi.hk/v0/styles/${selectedStyle.id}/${selectedStyle.version}.json`
    : '',
)
const selectedObjective = $derived(
  objectiveChoices.find(choice => choice.value === objective),
)
const selectedRenderer = $derived(
  rendererChoices.find(choice => choice.value === renderer),
)
const selectedRegion = $derived(regionChoices.find(choice => choice.value === region))
const selectedDataSource = $derived(
  dataChoices.find(choice => choice.value === dataSource),
)
const hostingChoices = $derived.by(() => {
  locale
  return [
    {
      value: 'cloudflare',
      icon: 'simple-icons:cloudflare',
      label: m.guide_host_cloudflare(),
      description: m.guide_host_cloudflare_description(),
      badge: m.guide_host_cloudflare_badge(),
    },
    {
      value: 'github-pages',
      icon: 'simple-icons:github',
      label: m.guide_host_github_pages(),
      description: m.guide_host_github_pages_description(),
      badge: m.guide_host_github_pages_badge(),
    },
    {
      value: 'vercel',
      icon: 'simple-icons:vercel',
      label: m.guide_host_vercel(),
      description: m.guide_host_vercel_description(),
    },
    {
      value: 'netlify',
      icon: 'simple-icons:netlify',
      label: m.guide_host_netlify(),
      description: m.guide_host_netlify_description(),
    },
    {
      value: 'other',
      icon: 'proicons:more',
      label: m.guide_host_other(),
      description: m.guide_host_other_description(),
    },
  ]
})
const websitePlatformChoices = $derived.by(() => {
  locale
  return [
    {
      value: 'wordpress',
      icon: 'simple-icons:wordpress',
      label: m.guide_embed_wordpress(),
      description: m.guide_embed_wordpress_description(),
    },
    {
      value: 'squarespace',
      icon: 'simple-icons:squarespace',
      label: m.guide_embed_squarespace(),
      description: m.guide_embed_squarespace_description(),
    },
    {
      value: 'wix',
      icon: 'simple-icons:wix',
      label: m.guide_embed_wix(),
      description: m.guide_embed_wix_description(),
    },
    {
      value: 'webflow',
      icon: 'simple-icons:webflow',
      label: m.guide_embed_webflow(),
      description: m.guide_embed_webflow_description(),
    },
    {
      value: 'other',
      icon: 'proicons:more',
      label: m.guide_embed_other(),
      description: m.guide_embed_other_description(),
    },
  ]
})
const mobileLibraryChoices = $derived.by(() => {
  locale
  return [
    {
      value: 'maplibre-native',
      icon: 'proicons:map',
      label: m.guide_mobile_maplibre(),
      description: m.guide_mobile_maplibre_description(),
    },
  ]
})
const mobilePlatformChoices = $derived.by(() => {
  locale
  return [
    {
      value: 'android',
      icon: 'simple-icons:android',
      label: m.guide_mobile_platform_android(),
      description: m.guide_mobile_platform_android_description(),
    },
    {
      value: 'ios',
      icon: 'simple-icons:apple',
      label: m.guide_mobile_platform_ios(),
      description: m.guide_mobile_platform_ios_description(),
    },
    {
      value: 'other',
      icon: 'proicons:more',
      label: m.guide_mobile_platform_other(),
      description: m.guide_mobile_platform_other_description(),
    },
  ]
})
const notebookLibraryChoices = $derived.by(() => {
  locale
  return [
    {
      value: 'maplibre-jupyter',
      icon: 'proicons:map',
      label: m.guide_notebook_maplibre(),
      description: m.guide_notebook_maplibre_description(),
    },
    {
      value: 'folium',
      icon: 'proicons:book',
      label: m.guide_notebook_folium(),
      description: m.guide_notebook_folium_description(),
    },
  ]
})
const notebookRuntimeChoices = $derived.by(() => {
  locale
  return [
    {
      value: 'local',
      icon: 'proicons:laptop',
      label: m.guide_notebook_runtime_local(),
      description: m.guide_notebook_runtime_local_description(),
    },
    {
      value: 'colab',
      icon: 'simple-icons:googlecolab',
      label: m.guide_notebook_runtime_colab(),
      description: m.guide_notebook_runtime_colab_description(),
    },
    {
      value: 'jupyterhub',
      icon: 'proicons:cloud',
      label: m.guide_notebook_runtime_jupyterhub(),
      description: m.guide_notebook_runtime_jupyterhub_description(),
    },
  ]
})
const selectedHosting = $derived(
  hostingChoices.find(choice => choice.value === hosting),
)
const selectedWebsitePlatform = $derived(
  websitePlatformChoices.find(choice => choice.value === websitePlatform),
)
const selectedMobileLibrary = $derived(
  mobileLibraryChoices.find(choice => choice.value === mobileLibrary),
)
const selectedMobilePlatform = $derived(
  mobilePlatformChoices.find(choice => choice.value === mobilePlatform),
)
const selectedNotebookLibrary = $derived(
  notebookLibraryChoices.find(choice => choice.value === notebookLibrary),
)
const selectedNotebookRuntime = $derived(
  notebookRuntimeChoices.find(choice => choice.value === notebookRuntime),
)
const selectedOperatingSystem = $derived(
  operatingSystemChoices.find(choice => choice.value === operatingSystem),
)
const selectedCodeEditor = $derived(
  codeEditorChoices.find(choice => choice.value === codeEditor),
)
const codeEditorInstallation = $derived.by(() => {
  locale
  if (!operatingSystem || !codeEditor || codeEditor === 'other') return undefined

  const editorDetails =
    codeEditor === 'zed'
      ? { href: 'https://zed.dev/download', name: 'Zed' }
      : codeEditor === 'vscode'
        ? { href: 'https://code.visualstudio.com/download', name: 'VS Code' }
        : codeEditor === 'cursor'
          ? { href: 'https://www.cursor.com/downloads', name: 'Cursor' }
          : { href: 'https://www.sublimetext.com/download', name: 'Sublime Text' }

  return {
    href: editorDetails.href,
    label: m.guide_code_editor_readiness_download({ name: editorDetails.name }),
  }
})
const editorPricing = $derived.by(() => {
  locale
  if (!codeEditor || codeEditor === 'other') return undefined

  const freeDetail =
    codeEditor === 'sublime-text'
      ? m.guide_code_editor_pricing_sublime_free_detail()
      : codeEditor === 'cursor'
        ? m.guide_code_editor_pricing_cursor_free_detail()
        : m.guide_code_editor_pricing_free_detail()
  const options: Array<{ detail?: string; label: string; price?: string }> = [
    {
      label: m.guide_code_editor_pricing_free(),
      price: '$0',
      detail: freeDetail,
    },
  ]

  if (codeEditor === 'zed') {
    options.push({
      label: m.guide_code_editor_pricing_subscription(),
      price: m.guide_code_editor_pricing_zed_subscription_price(),
      detail: m.guide_agentic_ai_readiness_subscription_detail(),
    })
  }

  if (codeEditor === 'cursor') {
    options.push({
      label: m.guide_code_editor_pricing_subscription(),
      price: m.guide_code_editor_pricing_cursor_subscription_price(),
      detail: m.guide_agentic_ai_readiness_subscription_detail(),
    })
  }

  return { options }
})
const editorReadinessDescription = $derived(
  codeEditor === 'other'
    ? m.guide_code_editor_readiness_other_description()
    : selectedCodeEditor
      ? m.guide_code_editor_readiness_description({ name: selectedCodeEditor.label })
      : '',
)
const editorReadinessCompleteDescription = $derived(
  codeEditor === 'other'
    ? m.guide_code_editor_readiness_complete_other_description()
    : selectedCodeEditor
      ? m.guide_code_editor_readiness_complete_description({
          name: selectedCodeEditor.label,
        })
      : '',
)
const editorReadinessWelcomeDescription = $derived(
  !codeEditorInstallation
    ? undefined
    : codeEditor === 'zed'
      ? m.guide_code_editor_readiness_zed_welcome()
      : codeEditor === 'vscode'
        ? m.guide_code_editor_readiness_vscode_welcome()
        : codeEditor === 'cursor'
          ? m.guide_code_editor_readiness_cursor_welcome()
          : m.guide_code_editor_readiness_sublime_text_welcome(),
)
const showPlatform = $derived(objective !== 'local')
const minimumPrerequisiteCount = 5
const prerequisiteStepIds = $derived(
  createPrerequisiteStepIds({
    objective,
    llmMode,
    aiAccess,
    isVpnRequired,
    websitePlatform,
    notebookLibrary,
  }),
)
const prerequisiteMarker = (id: string) => {
  const current = prerequisiteStepIds.indexOf(id) + 1
  const total = Math.max(minimumPrerequisiteCount, prerequisiteStepIds.length)
  return { current, label: m.guide_prerequisites_requirement_label(), total }
}
const missingPrerequisiteQuestions = $derived.by(() => {
  locale
  return createMissingPrerequisiteQuestions({
    objective,
    llmMode,
    aiAccess,
    vpnAccess,
    isVpnRequired,
    agentTool,
    selectedLlmOption,
    isLlmReadinessComplete,
    isBasemapAccountReady: Boolean(page.data.user),
    isBasemapApiKeyReady: hasBasemapApiKey,
    isDataStepComplete,
    isMapboxTokenConfigured: mapboxTokenConfigured,
    isPaymentConfirmed,
    isPaymentConfirmationRequired,
    isZedSetupGuideProvided,
    llmGuidanceEnabled,
    operatingSystem,
    terminalExperience,
    codeEditor,
    selectedCodeEditor,
    isEditorReadinessComplete,
    hosting,
    websitePlatform,
    mobilePlatform,
    notebookLibrary,
    notebookRuntime,
    renderer,
    dataSource,
  })
})
$effect(() => {
  const complete =
    Boolean(objective) &&
    missingPrerequisiteQuestions.length > 0 &&
    missingPrerequisiteQuestions.every(question => question.answered)
  if (complete && !guideWasComplete) {
    trackClientProductUsage({
      event: 'guide.completion',
      surface: 'guide',
      entityType: 'guide',
      entityId: 'create-a-map',
    })
  }
  guideWasComplete = complete
})
const selectedMapLibrary = $derived(
  objective === 'mobile-embed'
    ? selectedMobileLibrary
    : objective === 'notebook-embed'
      ? selectedNotebookLibrary
      : selectedRenderer,
)
const outline = $derived(guideOutline)
const selectedPlatform = $derived(
  objective === 'local'
    ? m.guide_platform_local()
    : objective === 'web'
      ? selectedHosting?.label
      : objective === 'web-embed'
        ? websitePlatform === 'other'
          ? m.guide_platform_local()
          : selectedWebsitePlatform && selectedHosting
            ? `${selectedWebsitePlatform.label} · ${selectedHosting.label}`
            : selectedWebsitePlatform?.label
        : objective === 'mobile-embed'
          ? selectedMobilePlatform?.label
          : [selectedNotebookLibrary?.label, selectedNotebookRuntime?.label]
              .filter(Boolean)
              .join(' · '),
)
const llmGuidanceEnabled = $derived(
  llmMode === 'assisted' && (aiAccess === 'agentic' || aiAccess === 'web'),
)
const llmPromptState = $derived.by(() => {
  return {
    agentTool: selectedLlmOption?.label,
    agentToolValue: agentTool,
    codeEditor: selectedCodeEditor?.label,
    dataSource,
    dataSourceLabel: selectedDataSource?.label,
    hosting: selectedHosting?.label,
    hostingValue: hosting,
    mobileLibrary: selectedMobileLibrary?.label,
    mobilePlatform: selectedMobilePlatform?.label,
    notebookLibrary: selectedNotebookLibrary?.label,
    notebookRuntime: selectedNotebookRuntime?.label,
    objective,
    objectiveLabel: selectedObjective?.label,
    operatingSystem: selectedOperatingSystem?.label,
    platform: selectedPlatform,
    preferredLocale: locale,
    region,
    regionLabel: selectedRegion?.label,
    renderer,
    rendererLabel: selectedRenderer?.label,
    style,
    styleLabel:
      selectedStyle?.name ?? (style === 'custom' ? m.guide_style_custom() : undefined),
    styleUrl,
    terminalExperience: terminalExperienceChoices.find(
      choice => choice.value === terminalExperience,
    )?.label,
    terminalExperienceValue: terminalExperience,
    tilejsonUrl,
    vpnAccess: isVpnRequired
      ? vpnAccessChoices.find(choice => choice.value === vpnAccess)?.label
      : undefined,
    websitePlatform,
  } satisfies CreateAMapLlmPromptState
})

// 1. Full hand-over to a coding agent. Used by the initial hand-over dialog.
const agenticHandoverPrompt = $derived(
  createAMapAgenticHandoverPrompt(llmPromptState, guideUrl, guideLlmInstructionsUrl),
)
// 2. Full hand-over to a web chat. Used by the initial hand-over dialog.
const chatHandoverPrompt = $derived(
  createAMapChatHandoverPrompt(llmPromptState, guideUrl, guideLlmInstructionsUrl),
)
// 3. Progressive prompts for a coding agent as the guide advances.
const agenticSectionPrompts = $derived({
  prerequisites: createAMapAgenticSectionPrompt(llmPromptState, 'prerequisites'),
  render: createAMapAgenticSectionPrompt(llmPromptState, 'render'),
  basemap: createAMapAgenticSectionPrompt(llmPromptState, 'basemap'),
  style: createAMapAgenticSectionPrompt(llmPromptState, 'style'),
  data: createAMapAgenticSectionPrompt(llmPromptState, 'data'),
  publish: createAMapAgenticSectionPrompt(llmPromptState, 'publish'),
})
// 4. Progressive prompts for a web chat as the guide advances.
const chatSectionPrompts = $derived({
  prerequisites: createAMapChatSectionPrompt(llmPromptState, 'prerequisites'),
  render: createAMapChatSectionPrompt(llmPromptState, 'render'),
  basemap: createAMapChatSectionPrompt(llmPromptState, 'basemap'),
  style: createAMapChatSectionPrompt(llmPromptState, 'style'),
  data: createAMapChatSectionPrompt(llmPromptState, 'data'),
  publish: createAMapChatSectionPrompt(llmPromptState, 'publish'),
})
const progressiveSectionPrompts = $derived(
  aiAccess === 'agentic' ? agenticSectionPrompts : chatSectionPrompts,
)

const guideDecisions = $derived.by(() => {
  locale
  return [
    {
      id: 'destination',
      label: m.guide_decision_destination(),
      selection: selectedObjective?.label,
    },
    {
      id: 'operating-system',
      label: m.guide_decision_operating_system(),
      selection: selectedOperatingSystem?.label,
    },
    ...(showPlatform
      ? [
          {
            id: 'platform',
            label: m.guide_decision_platform(),
            selection: selectedPlatform,
          },
        ]
      : []),
    {
      id: 'map-library',
      label: m.guide_decision_map_library(),
      selection: selectedMapLibrary?.label,
    },
    {
      id: 'basemap-choice',
      label: m.guide_decision_basemap(),
      selection: selectedRegion?.label,
    },
    {
      id: 'style-choice',
      label: m.guide_decision_style(),
      selection: selectedStyle?.name,
    },
    {
      id: 'project-data',
      label: m.guide_decision_project_data(),
      selection: selectedDataSource?.label,
    },
  ]
})

const hostingInstallCode = $derived(getHostingInstallCode(hosting))
const setupCode = $derived(createProjectSetupCode(operatingSystem, renderer))
const hostingInstallExplanation = $derived(
  m.guide_setup_install_hosting_tool_explanation({
    host: selectedHosting?.label ?? '',
  }),
)
const bunInstallExplanation = $derived(
  `${m.guide_setup_install_bun_explanation()}${terminalExperience === 'basic' ? ` ${m.guide_setup_install_bun_alternative_toolchain()}` : ''}`,
)
const setupStartStepNumber = $derived(hostingInstallCode ? 4 : 3)
const setupContinueStepNumber = $derived(hostingInstallCode ? 5 : 4)
const restartProjectCode = $derived(createRestartProjectCode(operatingSystem))
const agentProjectCommand = $derived(createAgentProjectCommand(agentTool))
const stopServerModifier = $derived(operatingSystem === 'macos' ? 'Control' : 'Ctrl')
const terminalProjectPath = $derived(
  operatingSystem === 'windows'
    ? 'C:\\Users\\your-name\\saanseoi-project'
    : '~/saanseoi-project',
)
const projectSetupIntro = $derived.by(() => {
  if (llmMode !== 'manual' || !setupReady || terminalExperience === 'advanced') {
    return m.guide_project_setup_intro()
  }

  return `${m.guide_project_setup_intro()}<br><br>${m.guide_project_setup_terminal_intro()}`
})
const bunInstallCode = $derived(getBunInstallCode(operatingSystem))
const notebookSetupCode = $derived(
  createNotebookSetupCode(operatingSystem, notebookLibrary),
)
const deploymentCode = $derived(createDeploymentCode(hosting))
const hostingDocsUrl = $derived(
  hosting === 'cloudflare'
    ? 'https://developers.cloudflare.com/workers/static-assets/get-started/'
    : hosting === 'github-pages'
      ? 'https://docs.github.com/pages/getting-started-with-github-pages/creating-a-github-pages-site'
      : hosting === 'vercel'
        ? 'https://vercel.com/docs/deployments'
        : hosting === 'netlify'
          ? 'https://docs.netlify.com/welcome/add-new-site/'
          : undefined,
)
const mobileDocsUrl = $derived(
  mobilePlatform === 'android'
    ? 'https://maplibre.org/maplibre-native/android/'
    : mobilePlatform === 'ios'
      ? 'https://maplibre.org/maplibre-native/ios/'
      : undefined,
)
const notebookCode = $derived(createNotebookCode(notebookLibrary))
const setupReady = $derived(
  isGuideSetupReady({
    objective,
    terminalExperience,
    usesAgenticAssistance,
    agentTool,
    operatingSystem,
    llmMode,
    codeEditor,
    hosting,
    websitePlatform,
    mobileLibrary,
    mobilePlatform,
    notebookLibrary,
    notebookRuntime,
  }),
)
const selectedLlmChatUrl = $derived(getSelectedLlmChatUrl(llm))
const rendererReference = $derived(
  getCreateAMapRendererReference(
    renderer === 'maplibre' || renderer === 'mapbox' || renderer === 'leaflet'
      ? renderer
      : 'leaflet',
  ),
)
const rendererInstallCode = $derived(rendererReference.installCommand)
const rendererVersionDependency = $derived(
  renderer === 'maplibre'
    ? { name: 'maplibre-gl', pinnedVersion: '6.6.0' }
    : renderer === 'mapbox'
      ? { name: 'mapbox-gl', pinnedVersion: '3.29.0' }
      : { name: 'leaflet', pinnedVersion: '1.9.4' },
)
const rendererTerminalReminder = $derived(
  operatingSystem === 'windows'
    ? m.guide_renderer_terminal_reminder_windows({
        command: getRendererTerminalCommand(operatingSystem),
      })
    : m.guide_renderer_terminal_reminder_unix({
        command: getRendererTerminalCommand(operatingSystem),
      }),
)
const rendererEditorPath = 'src/main.ts'
const rendererStylesheetPath = 'src/style.css'
const editorNewFileShortcut = $derived(operatingSystem === 'macos' ? '⌘N' : 'Ctrl+N')
const mapboxTokenPasteInstruction = $derived(
  operatingSystem === 'windows'
    ? m.guide_renderer_mapbox_token_paste_windows()
    : operatingSystem === 'macos'
      ? m.guide_renderer_mapbox_token_paste_macos()
      : m.guide_renderer_mapbox_token_paste_linux(),
)
const isWebsiteMap = $derived(objective === 'web' || objective === 'web-embed')
const rendererEditorRefreshNote = $derived(
  renderer === 'mapbox' || renderer === 'leaflet'
    ? m.guide_renderer_leaflet_editor_refresh_note()
    : m.guide_renderer_editor_refresh_note(),
)
const rendererCodeLabel = $derived.by(() => {
  switch (renderer) {
    case 'maplibre':
      return m.guide_renderer_maplibre_code()
    case 'mapbox':
      return m.guide_renderer_mapbox_code()
    default:
      return m.guide_renderer_leaflet_code()
  }
})
const rendererCssCode = $derived(rendererReference.stylesheetCode)
const rendererCode = $derived(rendererReference.code)
const rendererCodeComments = $derived(
  renderer === 'maplibre'
    ? [
        { line: 1, text: m.guide_renderer_maplibre_comment_import() },
        { line: 2, text: m.guide_renderer_maplibre_comment_default_styles() },
        { line: 3, text: m.guide_renderer_maplibre_comment_custom_styles() },
        { line: 5, text: m.guide_renderer_maplibre_comment_map_node() },
        { line: 7, text: m.guide_renderer_maplibre_comment_new_map() },
        { line: 8, text: m.guide_renderer_maplibre_comment_container() },
        { line: 9, text: m.guide_renderer_maplibre_comment_center() },
        { line: 10, text: m.guide_renderer_maplibre_comment_zoom() },
        { line: 11, text: m.guide_renderer_maplibre_comment_style() },
      ]
    : [],
)
const basemapCode = $derived(
  renderer === 'maplibre' || renderer === 'mapbox' || renderer === 'leaflet'
    ? createAMapRendererBasemapCode(renderer, styleUrl, tilejsonUrl)
    : '',
)
const basemapCodeDimmedLines = $derived(
  renderer === 'maplibre' ? [1, 2, 3, 11, 13, 14, 15, 16, 24] : [],
)
const basemapCodeComments = $derived(
  renderer === 'maplibre'
    ? [
        { line: 1, text: m.guide_renderer_maplibre_comment_import() },
        { line: 2, text: m.guide_renderer_maplibre_comment_default_styles() },
        { line: 3, text: m.guide_renderer_maplibre_comment_custom_styles() },
        { line: 5, text: m.guide_basemap_comment_access_token() },
        { line: 6, text: m.guide_basemap_comment_validate_token() },
        { line: 7, text: m.guide_basemap_comment_url_safe_api_key() },
        { line: 8, text: m.guide_basemap_comment_basemap_base_url() },
        { line: 9, text: m.guide_basemap_comment_basemap_url() },
        { line: 11, text: m.guide_renderer_maplibre_comment_map_node() },
        { line: 13, text: m.guide_renderer_maplibre_comment_new_map() },
        { line: 14, text: m.guide_renderer_maplibre_comment_container() },
        { line: 15, text: m.guide_renderer_maplibre_comment_center() },
        { line: 16, text: m.guide_renderer_maplibre_comment_zoom() },
        { line: 17, text: m.guide_basemap_comment_style() },
        { line: 20, text: m.guide_basemap_comment_source() },
      ]
    : [],
)
const rendererEditorInstruction = $derived(
  m.guide_renderer_editor_instruction({
    editor: selectedCodeEditor?.label ?? m.guide_setup_editor_your_editor(),
    library: selectedRenderer?.label ?? '',
    path: rendererEditorPath,
  }),
)
const styleEditCode = $derived(
  selectedStyle &&
    (renderer === 'maplibre' || renderer === 'mapbox' || renderer === 'leaflet')
    ? createAMapRendererStyleCode(renderer, styleUrl, tilejsonUrl)
    : '',
)
const styleEditDimmedLines = $derived(
  styleEditCode
    .split('\n')
    .map((_, index) => index + 1)
    .filter(lineNumber => lineNumber < 11 || lineNumber > 15),
)
const styleEditComments = $derived(
  renderer === 'maplibre'
    ? [
        { line: 11, text: m.guide_style_comment_style_url() },
        { line: 12, text: m.guide_style_comment_fetch() },
        { line: 13, text: m.guide_style_comment_sources() },
        { line: 14, text: m.guide_style_comment_basemap_source() },
      ]
    : [],
)
const styleEditorInstruction = $derived(
  m.guide_style_editor_instruction({
    editor: selectedCodeEditor?.label ?? m.guide_setup_editor_your_editor(),
    path: rendererEditorPath,
  }),
)
const rendererStylesheetInstruction = $derived(
  m.guide_renderer_stylesheet_instruction({
    editor: selectedCodeEditor?.label ?? m.guide_setup_editor_your_editor(),
    path: rendererStylesheetPath,
  }),
)
const urbanDensityMapReadyCode = $derived(
  selectedStyle ? createUrbanDensityMapReadyCode(styleUrl) : '',
)

const selectedStylePreview = (styleId: string) =>
  createAMapStylePreviewUrl(styleId, region, tileset)
const styleChoiceDescription = (styleId: string) => {
  if (styleId === 'light' || styleId === 'dark') return m.guide_style_protomap_default()
  if (styleId === 'white' || styleId === 'grayscale' || styleId === 'black') {
    return m.guide_style_protomap_dataviz()
  }
  if (styleId === 'midnight') return m.guide_style_midnight_description()
  return ''
}
const styleChoices = $derived.by(() =>
  [
    'midnight',
    ...mapStyleDefinitions
      .map(candidate => candidate.id)
      .filter(styleId => styleId !== 'midnight'),
    {
      value: 'custom',
      label: m.guide_style_custom(),
      description: m.guide_style_custom_choice_description(),
      imageSlices: ['light', 'white', 'grayscale', 'light'].map(selectedStylePreview),
      darkImageSlices: ['dark', 'black', 'midnight', 'dark'].map(selectedStylePreview),
    },
  ].map(choice => {
    if (typeof choice === 'string') {
      const definition = mapStyleDefinitions.find(candidate => candidate.id === choice)

      return {
        value: choice,
        label: definition?.name ?? choice,
        badge: choice === 'midnight' ? m.guide_recommended() : undefined,
        description: styleChoiceDescription(choice),
        image: selectedStylePreview(choice),
      }
    }

    return choice
  }),
)
</script>

<Seo
  title={m.guide_create_map_title()}
  description={m.guide_create_map_meta_description()}
  image="/guides/build-a-map-dark.webp"
  type="article"
  publishedTime="2026-08-08"
  modifiedTime="2026-08-16"
  noindex={page.url.searchParams.size > 0}
  structuredData={{
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LearningResource',
        '@id': 'https://saanseoi.hk/guides/create-a-map#resource',
        name: m.guide_create_map_title(),
        description: m.guide_create_map_meta_description(),
        url: 'https://saanseoi.hk/guides/create-a-map',
        image: 'https://saanseoi.hk/guides/build-a-map-dark.webp',
        inLanguage: locale,
        author: {
          '@type': 'Person',
          name: 'Mart van de Ven',
          url: 'https://type.hk',
        },
        publisher: {
          '@type': 'Organization',
          name: 'SaanSeoi',
          url: 'https://saanseoi.hk',
        },
        datePublished: '2026-08-08',
        dateModified: '2026-08-16',
        educationalLevel: 'Beginner',
        teaches: [
          'Creating a digital map',
          'Using SaanSeoi basemap, styles and API data',
          'Publishing a map online or embedding it in a site',
        ],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: 'https://saanseoi.hk/',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: m.guide_title(),
            item: 'https://saanseoi.hk/guides',
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: m.guide_create_map_title(),
            item: 'https://saanseoi.hk/guides/create-a-map',
          },
        ],
      },
    ],
  }}
/>

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-16 md:py-20"
>
  <section
    class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-12"
  >
    <CreateAMap.Introduction {foundations} />
    <CreateAMap.Aside
      {guideLinkCopied}
      {guideLinkCopyFailed}
      onCopyGuideLink={copyGuideLink}
      onOpenHandover={() => {
        llmDialogOpen = true
        trackClientProductUsage({
          event: 'guide.handover',
          surface: 'guide',
          entityType: 'action',
          entityId: 'open',
        })
      }}
      onShareGuide={shareGuide}
      onShareExternalLink={shareExternalLink}
      {shareLinks}
    />
  </section>

  <div class="mt-7">
    <GuideRoot
      {outline}
      decisions={guideDecisions}
      decisionsLabel={m.guide_decisions_title()}
      tocLabel={m.guide_toc()}
    >
      <GuideSection
        id="prerequisites"
        number={1}
        showBorder={false}
        actionLabel={prerequisiteMarker('destination')}
        eyebrow={m.guide_prerequisites_eyebrow()}
        intro={m.guide_prerequisites_intro()}
        title={m.guide_prerequisites_title()}
        description={m.guide_prerequisites_description()}
      >
        <div>
          <div id="destination" class="scroll-mt-28">
            <GuideChoiceGroup
              label={m.guide_objective_label()}
              hideLabel
              choices={objectiveChoices}
              bind:value={objective}
              onchange={handleObjectiveChange}
              illustratedFitWhenPossible
              variant="illustrated"
            />
          </div>
          <div id="llm-involvement" class="scroll-mt-28">
            <GuideChoiceGroup
              alignment="left"
              label={m.guide_llm_label()}
              marker={prerequisiteMarker('llm-involvement')}
              hint={m.guide_llm_callout_intro()}
              choices={llmChoices}
              bind:value={llmMode}
              onchange={handleLlmModeChange}
              variant="illustrated"
            />
            {#if llmMode === 'assisted'}
              <div id="agentic-ai-primer" class="mt-8 scroll-mt-28">
                <GuideAgenticAiPrimer
                  expanded={agenticAiPrimerExpanded}
                  onExpandedChange={expanded => (agenticAiPrimerExpanded = expanded)}
                />
              </div>
              <div id="ai-access" class="scroll-mt-28">
                <GuideChoiceGroup
                  alignment="left"
                  label={m.guide_agentic_ai_primer_choice_title()}
                  marker={prerequisiteMarker('ai-access')}
                  hint={m.guide_agentic_ai_primer_choice_hint()}
                  choices={aiAccessChoices}
                  bind:value={aiAccess}
                  variant="tiles"
                />
              </div>
              {#if isVpnRequired}
                <div id="vpn-access" class="mt-8 scroll-mt-28">
                  <GuideChoiceGroup
                    alignment="left"
                    label={m.guide_vpn_access_label()}
                    marker={prerequisiteMarker('vpn-access')}
                    hint={m.guide_vpn_access_hint({ region: visitorRegionLabel ?? '' })}
                    choices={vpnAccessChoices}
                    bind:value={vpnAccess}
                    variant="tiles"
                  />
                </div>
              {/if}
              {#if aiAccess === 'agentic'}
                <div id="terminal-experience" class="scroll-mt-28">
                  <GuideChoiceGroup
                    alignment="left"
                    label={m.guide_terminal_experience_label()}
                    marker={prerequisiteMarker('terminal-experience')}
                    hint={m.guide_terminal_experience_hint()}
                    choices={terminalExperienceChoices}
                    bind:value={terminalExperience}
                    variant="tiles"
                  />
                </div>
                <div id="agent-tool" class="scroll-mt-28">
                  <GuideChoiceGroup
                    alignment="left"
                    label={m.guide_agentic_ai_primer_agent_tools_title()}
                    marker={prerequisiteMarker('agent-tool')}
                    hint={agentToolHint}
                    choices={agentToolChoices}
                    bind:value={agentTool}
                    onchange={handleAgentToolChange}
                    variant="tiles"
                    tileLayout="flow"
                  />
                </div>
              {:else if aiAccess === 'web'}
                <div id="llm-service" class="scroll-mt-28">
                  <GuideChoiceGroup
                    alignment="left"
                    label={m.guide_agentic_ai_primer_web_tools_title()}
                    marker={prerequisiteMarker('llm-service')}
                    hint={chatAiServiceHint}
                    choices={chatAiServiceChoices}
                    bind:value={llm}
                    variant="tiles"
                    tileLayout="flow"
                  />
                </div>
              {/if}
              {#if selectedLlmOption}
                {#if isPaymentConfirmationRequired}
                  <GuidePaymentWarning
                    choice={selectedLlmReadinessName}
                    region={visitorRegionLabel ?? ''}
                    completed={isPaymentConfirmed}
                    showIncompleteWarning={paymentCompletionWarning}
                    onPaymentSuccessful={confirmPaymentSuccessful}
                    onResetPayment={resetPayment}
                  />
                {/if}
                <GuideLlmReadiness
                  {agentModel}
                  {agentPricing}
                  {aiAccess}
                  {chatPricing}
                  complete={isLlmReadinessComplete}
                  completeDescription={llmReadinessCompleteDescription}
                  detailsDescription={llmReadinessDetailsDescription}
                  incompleteDescription={llmReadinessIncompleteDescription}
                  {isZedSetupGuideProvided}
                  onComplete={completeLlmReadiness}
                  onExternalOpen={trackGuideExternalOpen}
                  onOpenZedSetup={openZedSetup}
                  onReset={resetLlmReadiness}
                  {operatingSystem}
                  option={selectedLlmOption}
                  prompt={progressiveSectionPrompts.prerequisites}
                  {zedSetupContentExpanded}
                  {zedSetupExpanded}
                  onZedSetupContentExpandedChange={(expanded: boolean) =>
                    (zedSetupContentExpanded = expanded)}
                />
              {/if}
            {/if}
          </div>
          {#if guideUnlocked}
            {#if objective && (llmMode === 'manual' || (llmMode === 'assisted' && aiAccess === 'web'))}
              <div id="operating-system" class="scroll-mt-28">
                <GuideChoiceGroup
                  alignment="left"
                  label={m.guide_operating_system_label()}
                  marker={prerequisiteMarker('operating-system')}
                  hint={m.guide_operating_system_hint()}
                  choices={operatingSystemChoices}
                  bind:value={operatingSystem}
                  variant="tiles"
                />
              </div>

              {#if operatingSystem}
                <div id="terminal-experience" class="scroll-mt-28">
                  <GuideChoiceGroup
                    alignment="left"
                    label={m.guide_terminal_experience_label()}
                    marker={prerequisiteMarker('terminal-experience')}
                    hint={m.guide_terminal_experience_hint()}
                    choices={terminalExperienceChoices}
                    bind:value={terminalExperience}
                    onchange={handleTerminalExperienceChange}
                    variant="tiles"
                  />
                  {#if terminalExperience === 'none'}
                    <div id="terminal-introduction" class="mt-6 scroll-mt-28 lg:-mr-56">
                      <GuideTerminalIntroduction
                        bind:expanded={terminalIntroductionExpanded}
                        {operatingSystem}
                      />
                    </div>
                  {/if}
                </div>

                <div id="code-editor" class="scroll-mt-28">
                  <GuideChoiceGroup
                    alignment="left"
                    label={m.guide_code_editor_label()}
                    marker={prerequisiteMarker('code-editor')}
                    hint={m.guide_code_editor_hint()}
                    choices={codeEditorChoices}
                    bind:value={codeEditor}
                    variant="tiles"
                    tileLayout="flow"
                  />
                  {#if selectedCodeEditor}
                    <GuideEditorReadiness
                      complete={isEditorReadinessComplete}
                      completeDescription={editorReadinessCompleteDescription}
                      completeEyebrow={m.guide_code_editor_readiness_complete_eyebrow()}
                      incompleteDescription={editorReadinessDescription}
                      incompleteEyebrow={m.guide_code_editor_readiness_eyebrow()}
                      installation={codeEditorInstallation}
                      installationPrefix={m.guide_code_editor_readiness_install_prefix()}
                      installationSuffix={m.guide_code_editor_readiness_install_suffix()}
                      onComplete={completeEditorReadiness}
                      onReset={resetEditorReadiness}
                      pricingOptions={editorPricing?.options}
                      welcomeDescription={editorReadinessWelcomeDescription}
                    />
                  {/if}
                </div>
              {/if}
            {/if}

            {#if objective && showPlatform}
              <div id="platform" class="scroll-mt-28">
                <GuidePlatformSelection
                  {objective}
                  {hostingChoices}
                  {mobilePlatformChoices}
                  {notebookLibraryChoices}
                  {notebookRuntimeChoices}
                  onWebsitePlatformChange={handleWebsitePlatformChange}
                  {prerequisiteMarker}
                  {websitePlatformChoices}
                  bind:hosting
                  bind:mobilePlatform
                  bind:notebookLibrary
                  bind:notebookRuntime
                  bind:websitePlatform
                />
              </div>
            {/if}
          {/if}
        </div>
      </GuideSection>

      <GuideSection
        id="project-setup"
        number={2}
        showBorder={false}
        eyebrow={m.guide_project_setup_eyebrow()}
        intro={projectSetupIntro}
      >
        {#if guideUnlocked}
          {#if objective && llmMode === 'manual' && setupReady}
            <GuideManualSetup
              {bunInstallCode}
              {bunInstallExplanation}
              {codeEditor}
              {hostingInstallCode}
              {hostingInstallExplanation}
              {locale}
              {notebookCode}
              {notebookLibrary}
              {notebookRuntime}
              {notebookSetupCode}
              {objective}
              {operatingSystem}
              {restartProjectCode}
              {setupCode}
              {setupContinueStepNumber}
              {setupStartStepNumber}
              {stopServerModifier}
              {terminalExperience}
              {viteReadyOutput}
            />
          {:else if objective && llmMode === 'assisted' && setupReady && (aiAccess !== 'agentic' || isLlmReadinessComplete)}
            <div class="mt-14 space-y-6">
              {#if aiAccess === 'agentic'}
                <div class="space-y-5">
                  <GuideSubSectionHeader
                    eyebrow={m.guide_setup_agent_eyebrow()}
                    title={m.guide_setup_agent_title()}
                  />
                  {#if agentTool === 'zed' || agentTool === 'cursor'}
                    <GuideEditorProjectSetupSection
                      editor={agentTool}
                      showHeading={false}
                    />
                  {:else if agentProjectCommand}
                    <p
                      class="max-w-3xl font-body text-body-lg leading-8 text-foreground-alt"
                    >
                      {@html m.guide_setup_agent_terminal_instruction()}
                    </p>
                    <GuideCodeBlock
                      label={m.guide_setup_agent_terminal_label()}
                      code={agentProjectCommand}
                      language="bash"
                      copyLabel={m.common_copy()}
                      copiedLabel={m.common_copied()}
                    />
                    {#if agentTool === 'codex-cli'}
                      <p
                        class="max-w-3xl font-body text-body-lg leading-8 text-foreground-alt"
                      >
                        {@html m.guide_setup_agent_codex_cli_trust_directory()}
                      </p>
                      <div class="max-w-3xl">
                        <GuideScreenshot
                          src={codexCliTrustDirectory}
                          alt={m.guide_setup_agent_codex_cli_trust_directory_alt()}
                        />
                      </div>
                    {/if}
                  {:else if agentTool === 'codex-app'}
                    <p
                      class="max-w-3xl font-body text-body-lg leading-8 text-foreground-alt"
                    >
                      {@html m.guide_setup_agent_codex_app_instruction()}
                    </p>
                  {:else if agentTool === 'claude-cowork'}
                    <p
                      class="max-w-3xl font-body text-body-lg leading-8 text-foreground-alt"
                    >
                      {@html m.guide_setup_agent_claude_cowork_instruction()}
                    </p>
                  {:else}
                    <p
                      class="max-w-3xl font-body text-body-lg leading-8 text-foreground-alt"
                    >
                      {@html m.guide_setup_agent_other_instruction()}
                    </p>
                  {/if}
                  {#if agentModelSelectionInstruction}
                    <p
                      class="max-w-3xl font-body text-body-lg leading-8 text-foreground-alt"
                    >
                      {@html agentModelSelectionInstruction}
                    </p>
                  {/if}
                </div>
              {/if}
              {#if aiAccess === 'agentic'}
                {#if agentTool === 'zed'}
                  <p
                    class="max-w-3xl font-body text-body-lg leading-8 text-foreground-alt"
                  >
                    {@html m.guide_setup_agent_zed_prompt_instruction()}
                  </p>
                {/if}
                <GuidePromptBlock
                  code={progressiveSectionPrompts.prerequisites}
                  promptIcon={selectedLlmOption?.icon}
                />
              {/if}
              {#if aiAccess === 'web' && objective !== 'notebook-embed' && objective !== 'mobile-embed'}
                <GuideEditorProjectSetupSection editor={codeEditor} />
              {/if}
              {#if aiAccess === 'web' && isProjectEditorReady && isLlmReadinessComplete}
                <div class="mt-14 space-y-5">
                  <GuideSubSectionHeader
                    eyebrow={m.guide_setup_llm_eyebrow()}
                    title={m.guide_setup_llm_title()}
                  />
                  <p
                    class="max-w-3xl font-body text-body-lg leading-8 text-foreground-alt"
                  >
                    {@html m.guide_setup_llm_instruction_before()}
                    {#if selectedLlmChatUrl}
                      <Button
                        class="mx-1 min-h-0 px-1.5 py-0 align-baseline text-secondary underline decoration-secondary/60 underline-offset-4"
                        href={selectedLlmChatUrl}
                        size="compact"
                        variant="text"
                      >
                        <Icon
                          icon={selectedLlmOption?.icon ?? 'proicons:more'}
                          class="size-4"
                        />
                        {@html selectedLlmOption?.label ?? ''}
                        <Icon icon="proicons:arrow-up-right" class="size-3.5" />
                      </Button>
                    {:else}
                      <span class="font-semibold text-foreground">
                        {@html selectedLlmOption?.label ?? ''}
                      </span>
                    {/if}
                    {@html m.guide_setup_llm_instruction_after()}
                  </p>
                  <GuidePromptBlock
                    code={progressiveSectionPrompts.prerequisites}
                    promptIcon={selectedLlmOption?.icon}
                  />
                </div>
              {/if}
            </div>
          {/if}
        {/if}
      </GuideSection>

      <GuideSection
        id="render"
        number={3}
        showBorder={false}
        eyebrow={m.guide_render_eyebrow()}
      >
        <GuideParagraph class="mt-3">
          {@html m.guide_render_description()}
        </GuideParagraph>
        {#if codeEditor && objective !== 'mobile-embed' && objective !== 'notebook-embed'}
          <GuideParagraph class="mt-3">
            {@html m.guide_render_editor_intro({
              editor: selectedCodeEditor?.label ?? m.guide_setup_editor_your_editor(),
            })}
          </GuideParagraph>
          <GuideEditorCardExplainer
            code={editorCardExplainerCode}
            displayCode={editorCardExplainerDisplayCode}
            editorIcon={selectedCodeEditor?.icon}
          />
        {/if}
        <div class="mt-8 space-y-8">
          {#if objective !== 'mobile-embed' && objective !== 'notebook-embed'}
            <div id="map-library" class="scroll-mt-28">
              <GuideChoiceGroup
                alignment="left"
                label={m.guide_renderer_label()}
                marker={{
                  current: 1,
                  label: m.guide_prerequisites_requirement_label(),
                  total: 1,
                }}
                choices={rendererChoices}
                bind:value={renderer}
                onchange={handleRendererChange}
                variant="tiles"
                tileLayout="flow"
              />
            </div>
          {/if}
          {#if renderer && objective !== 'mobile-embed' && objective !== 'notebook-embed'}
            <GuideCreateAMapVersionNotice
              dependency={rendererVersionDependency}
              library={selectedRenderer?.label ?? ''}
              noticeLabel={m.guide_renderer_version_notice_label({})}
              minorDifference={m.guide_renderer_version_minor_difference({})}
              majorDifference={m.guide_renderer_version_major_difference()}
              contactBefore={m.guide_renderer_version_contact_before()}
              contactLabel={m.guide_renderer_version_contact_label()}
              contactAfter={m.guide_renderer_version_contact_after()}
            />
            {#if renderer === 'mapbox'}
              <GuideMapboxTokenReadiness
                configured={mapboxTokenConfigured}
                {isWebsiteMap}
                onComplete={completeMapboxToken}
                onReset={resetMapboxToken}
                tokenCode={mapboxTokenCode}
                tokenPasteInstruction={mapboxTokenPasteInstruction}
                {terminalProjectPath}
              />
            {/if}
            {#if renderer !== 'mapbox' || mapboxTokenConfigured}
              {#if !llmGuidanceEnabled}
                <div class="pt-10">
                  <GuideSubSectionHeader
                    eyebrow={m.guide_renderer_prompt_none_eyebrow()}
                    title={m.guide_renderer_package_title({
                      library: selectedRenderer?.label ?? '',
                    })}
                  />
                  <p
                    class="mt-3 max-w-3xl font-body text-body-lg leading-8 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
                  >
                    {@html rendererTerminalReminder}
                  </p>
                  <div class="mt-6 max-w-2xl">
                    <GuideCodeBlock
                      label={m.guide_setup_terminal_label({
                        action: m.guide_renderer_install(),
                        path: terminalProjectPath,
                      })}
                      code={rendererInstallCode}
                      language={operatingSystem === 'windows' ? 'powershell' : 'bash'}
                      copyLabel={m.common_copy()}
                      copiedLabel={m.common_copied()}
                    />
                  </div>
                </div>
                <div>
                  <GuideSubSectionHeader
                    eyebrow={m.guide_renderer_css_code()}
                    title={m.guide_renderer_reset_styles_title()}
                  />
                  <p
                    class="mt-4 max-w-3xl font-body text-body-lg leading-8 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
                  >
                    {@html rendererStylesheetInstruction}
                  </p>
                  {#if codeEditor === 'sublime-text'}
                    <div class="mt-6 max-w-2xl">
                      <GuideScreenshot
                        src={sublimeOpenStyleCss}
                        alt={m.guide_renderer_sublime_stylesheet_image_alt()}
                        caption={m.guide_renderer_sublime_stylesheet_image_caption()}
                      />
                    </div>
                  {/if}
                  <div class="mt-4 max-w-2xl">
                    <GuideCodeBlock
                      label={rendererStylesheetPath}
                      code={rendererCssCode}
                      editorIcon={selectedCodeEditor?.icon}
                      language="css"
                      variant="editor"
                      copyLabel={m.common_copy()}
                      copiedLabel={m.common_copied()}
                    />
                  </div>
                </div>
                <div>
                  <GuideSubSectionHeader
                    eyebrow={rendererCodeLabel}
                    title={m.guide_renderer_code_title({
                      library: selectedRenderer?.label ?? '',
                    })}
                  />
                  <p
                    class="mt-4 max-w-3xl font-body text-body-lg leading-8 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
                  >
                    {@html rendererEditorInstruction}
                  </p>
                  {#if renderer === 'maplibre'}
                    <div class="mt-4 max-w-[80ch]">
                      <GuidePreviewCodeBlock
                        label={rendererEditorPath}
                        code={rendererCode}
                        comments={rendererCodeComments}
                        editorIcon={selectedCodeEditor?.icon}
                        language="typescript"
                        variant="editor"
                        copyLabel={m.common_copy()}
                        copiedLabel={m.common_copied()}
                        previewLabel={m.guide_code_block_preview()}
                        showCodeLabel={m.guide_code_block_code()}
                        expandable
                        expandLabel={m.guide_code_block_expand()}
                        closeLabel={m.common_close()}
                      >
                        {#snippet preview()}
                          <GuideMapLibreBlankPreview />
                        {/snippet}
                      </GuidePreviewCodeBlock>
                    </div>
                  {:else}
                    <div class="mt-4 max-w-2xl">
                      <GuideCodeBlock
                        label={rendererEditorPath}
                        code={rendererCode}
                        editorIcon={selectedCodeEditor?.icon}
                        language="typescript"
                        variant="editor"
                        copyLabel={m.common_copy()}
                        copiedLabel={m.common_copied()}
                      />
                    </div>
                  {/if}
                  {#if renderer === 'mapbox' || renderer === 'leaflet'}
                    <div class="mt-5 max-w-3xl">
                      <GuideScreenshot
                        src={renderer === 'mapbox' ? mapboxSetupResult : leafletSetupResult}
                        alt={renderer === 'mapbox'
                          ? m.guide_renderer_mapbox_setup_screenshot_alt()
                          : m.guide_renderer_leaflet_setup_screenshot_alt()}
                      />
                    </div>
                  {/if}
                  <p
                    class="mt-3 max-w-3xl font-body text-body-lg leading-8 text-foreground-alt"
                  >
                    {@html rendererEditorRefreshNote}
                  </p>
                </div>
                {#if objective === 'web-embed'}
                  <GuideCallout>
                    <p>
                      {@html m.guide_renderer_web_embed()}
                      <a
                        class="font-semibold text-secondary underline underline-offset-4"
                        href="/#community"
                        >{@html m.guide_join_community()}</a
                      >.
                    </p>
                  </GuideCallout>
                {/if}
              {/if}
            {/if}
          {/if}
          {#if objective === 'mobile-embed'}
            <GuideCallout id="map-library" class="scroll-mt-28">
              <p>{@html m.guide_renderer_mobile()}</p>
              {#if mobileDocsUrl}
                <a
                  class="mt-3 inline-flex font-semibold text-secondary underline underline-offset-4"
                  href={mobileDocsUrl}
                  target="_blank"
                  rel="noreferrer"
                  >{mobilePlatform === 'android'
                    ? m.guide_mobile_android()
                    : m.guide_mobile_ios()}</a
                >
              {/if}
            </GuideCallout>
          {:else if objective === 'notebook-embed'}
            <GuideCallout id="map-library" class="space-y-4 scroll-mt-28">
              <p class="font-body text-body-lg leading-8 text-foreground-alt">
                {@html m.guide_renderer_notebook()}
              </p>
              {#if notebookLibrary}
                <GuideCodeBlock
                  label={m.guide_notebook_code()}
                  code={notebookCode}
                  copyLabel={m.common_copy()}
                  copiedLabel={m.common_copied()}
                />
              {/if}
            </GuideCallout>
          {/if}
          {#if llmGuidanceEnabled && selectedMapLibrary}
            <GuideLlmPromptSection
              eyebrow={aiAccess === 'agentic'
                ? m.guide_renderer_prompt_agent_eyebrow()
                : m.guide_renderer_prompt_chat_eyebrow()}
              prompt={progressiveSectionPrompts.render}
              promptIcon={selectedLlmOption?.icon}
              title={m.guide_renderer_setup_title({ library: selectedMapLibrary.label })}
            />
          {/if}
        </div>
      </GuideSection>

      <GuideSection
        id="basemap"
        number={4}
        showBorder={false}
        eyebrow={m.guide_basemap_eyebrow()}
      >
        <GuideParagraph class="mt-3">
          {@html m.guide_basemap_description_before()}
          <GuideReference
            href={`saanseoi:${locale.toLowerCase()}:note/basemap/v1`}
            label={m.reference_basemap()}
          />{@html m.guide_basemap_description_after()}
        </GuideParagraph>
        <div class="mt-10 max-w-3xl">
          <GuideSubSectionHeader
            requirement={{
              current: 1,
              label: m.guide_prerequisites_requirement_label(),
              total: 3,
            }}
            title={m.guide_basemap_account_requirement_title()}
          />
          {#if page.data.user}
            <GuideCreateAMapAccountComplete user={page.data.user} />
          {:else}
            <CreateAMap.GuideCreateAMapAccountAccess
              id="basemap-account-readiness"
              continueUrl={basemapAccountContinueUrl}
            />
          {/if}
        </div>
        {#if page.data.user}
          <div class="mt-10 max-w-3xl">
            <GuideSubSectionHeader
              requirement={{
                current: 2,
                label: m.guide_prerequisites_requirement_label(),
                total: 3,
              }}
              title={m.guide_basemap_api_key_requirement_title()}
            >
              {#snippet actions()}
                {#if usingExistingBasemapApiKey}
                  <Button
                    onclick={() => (usingExistingBasemapApiKey = false)}
                    size="compact"
                    type="button"
                    variant="secondary"
                  >
                    <Icon
                      aria-hidden="true"
                      class="size-5"
                      icon="material-symbols-light:restart-alt-rounded"
                    />
                    {@html m.guide_readiness_reset()}
                  </Button>
                {/if}
              {/snippet}
            </GuideSubSectionHeader>
            {#if !hasBasemapApiKey && !usingExistingBasemapApiKey}
              <p class="mt-3 font-body text-body-lg leading-8 text-foreground-alt">
                {m.guide_basemap_api_key_create_instruction()}
              </p>
            {/if}
            <GuideCreateAMapApiKeys
              apiKeyReady={hasBasemapApiKey}
              editorIcon={selectedCodeEditor?.icon}
              editorLabel={selectedCodeEditor?.label}
              newFileShortcut={editorNewFileShortcut}
              {operatingSystem}
              {terminalProjectPath}
              onApiKeyReadyChange={ready => (hasBasemapApiKey = ready)}
              showHeading={false}
              bind:usingExistingKey={usingExistingBasemapApiKey}
            />
          </div>
        {/if}
        {#if isBasemapReady}
          <div class="mt-10">
            <div id="basemap-choice" class="scroll-mt-28">
              <GuideChoiceGroup
                alignment="left"
                label={m.guide_basemap_region_label()}
                marker={{
                  current: 3,
                  label: m.guide_prerequisites_requirement_label(),
                  total: 3,
                }}
                hint={m.guide_basemap_region_hint()}
                choices={regionChoices}
                bind:value={region}
                variant="illustrated"
              />
            </div>
          </div>
          {#if region && renderer && objective !== 'mobile-embed' && objective !== 'notebook-embed'}
            {#if !llmGuidanceEnabled}
              <div class="mt-10 max-w-3xl border-t border-border-card pt-10">
                <GuideSubSectionHeader
                  eyebrow={m.guide_basemap_editor_eyebrow()}
                  title={m.guide_basemap_editor_title()}
                />
                <GuideSubSectionBody content={m.guide_basemap_editor_description()}>
                  {#if renderer === 'maplibre'}
                    <GuidePreviewCodeBlock
                      label={rendererEditorPath}
                      code={basemapCode}
                      comments={basemapCodeComments}
                      dimmedLines={basemapCodeDimmedLines}
                      editorIcon={selectedCodeEditor?.icon}
                      copyLabel={m.common_copy()}
                      copiedLabel={m.common_copied()}
                      language="typescript"
                      variant="editor"
                      previewLabel={m.guide_code_block_preview()}
                      showCodeLabel={m.guide_code_block_code()}
                      expandable
                      expandLabel={m.guide_code_block_expand()}
                      closeLabel={m.common_close()}
                    >
                      {#snippet preview()}
                        <GuideMapLibreBlankPreview
                          title={m.guide_basemap_preview_title()}
                          description={m.guide_basemap_preview_description()}
                        />
                      {/snippet}
                    </GuidePreviewCodeBlock>
                  {:else}
                    <GuideCodeBlock
                      label={rendererEditorPath}
                      code={basemapCode}
                      comments={basemapCodeComments}
                      commentsVisible={true}
                      dimmedLines={basemapCodeDimmedLines}
                      editorIcon={selectedCodeEditor?.icon}
                      copyLabel={m.common_copy()}
                      copiedLabel={m.common_copied()}
                      language="typescript"
                      variant="editor"
                    />
                  {/if}
                  <p class="font-body text-body-lg leading-8 text-foreground-alt">
                    {m.guide_basemap_editor_restart()}
                  </p>
                  <p class="mt-3 font-body text-body-lg leading-8 text-foreground-alt">
                    {m.guide_basemap_editor_style_next()}
                  </p>
                </GuideSubSectionBody>
              </div>
            {/if}
          {:else if region && objective === 'mobile-embed'}
            <GuideCallout class="mt-8">
              <p>
                {@html m.guide_basemap_mobile_handoff()}
              </p>
            </GuideCallout>
          {:else if region && objective === 'notebook-embed'}
            <GuideCallout class="mt-8">
              <p>
                {@html m.guide_basemap_notebook_handoff()}
              </p>
            </GuideCallout>
          {/if}
          {#if llmGuidanceEnabled && region}
            <div class="mt-10">
              <GuideLlmPromptSection
                eyebrow={aiAccess === 'agentic'
                  ? m.guide_renderer_prompt_agent_eyebrow()
                  : m.guide_renderer_prompt_chat_eyebrow()}
                prompt={progressiveSectionPrompts.basemap}
                promptIcon={selectedLlmOption?.icon}
                title={m.guide_basemap_prompt_title()}
              />
            </div>
          {/if}
        {/if}
      </GuideSection>

      <GuideSection
        id="style"
        number={5}
        showBorder={false}
        eyebrow={m.guide_style_eyebrow()}
      >
        <GuideParagraph
          class="mt-3 [&_a]:font-semibold [&_a]:text-secondary [&_a]:underline [&_a]:underline-offset-4"
        >
          {@html m.guide_style_description()}
        </GuideParagraph>
        <div id="style-choice" class="scroll-mt-28">
          <GuideChoiceGroup
            alignment="left"
            label={m.guide_style_label()}
            marker={{
              current: 1,
              label: m.guide_prerequisites_requirement_label(),
              total: 1,
            }}
            choices={styleChoices}
            bind:value={style}
            illustratedCardSizing="fixed"
            illustratedFullBleed
            variant="illustrated"
          />
        </div>
        {#if style === 'custom'}
          <GuideCallout class="mt-6" size="generous">
            <h3 class="font-display text-headline-sm font-bold text-primary">
              {@html m.guide_style_custom_title()}
            </h3>
            <p class="mt-3 font-body text-body-lg leading-8 text-foreground-alt">
              {@html m.guide_style_custom_description()}
            </p>
            <div class="mt-5 flex flex-wrap gap-4">
              <Button href="https://maplibre.org/maputnik/" variant="secondary"
                >{@html m.guide_style_open_maputnik()}</Button
              >
            </div>
            <div class="mt-5">
              <GuideCodeBlock
                label={m.guide_style_prompt_label()}
                code={m.guide_style_prompt()}
                copyLabel={m.common_copy()}
                copiedLabel={m.common_copied()}
              />
            </div>
          </GuideCallout>
        {/if}
        {#if selectedStyle && renderer}
          <div class="mt-10 max-w-3xl pt-10">
            <GuideSubSectionHeader
              eyebrow={m.guide_basemap_editor_eyebrow()}
              title={m.guide_style_editor_title({ library: selectedRenderer?.label ?? '' })}
            />
            <GuideSubSectionBody>
              <p
                class="font-body text-body-lg leading-8 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
              >
                {@html styleEditorInstruction}
              </p>
              {#if renderer === 'maplibre'}
                <GuidePreviewCodeBlock
                  label={rendererEditorPath}
                  code={styleEditCode}
                  comments={styleEditComments}
                  dimmedLines={styleEditDimmedLines}
                  editorIcon={selectedCodeEditor?.icon}
                  language="typescript"
                  variant="editor"
                  copyLabel={m.common_copy()}
                  copiedLabel={m.common_copied()}
                  previewLabel={m.guide_code_block_preview()}
                  showCodeLabel={m.guide_code_block_code()}
                  expandable
                  expandLabel={m.guide_code_block_expand()}
                  closeLabel={m.common_close()}
                >
                  {#snippet preview()}
                    <GuideMapLibreStylePreview
                      label={selectedStyle?.name ?? ''}
                      {styleUrl}
                      {tilejsonUrl}
                    />
                  {/snippet}
                </GuidePreviewCodeBlock>
                <GuideParagraph class="mt-4">
                  {m.guide_style_editor_success()}
                </GuideParagraph>
              {:else}
                <GuideCodeBlock
                  label={rendererEditorPath}
                  code={styleEditCode}
                  comments={styleEditComments}
                  dimmedLines={styleEditDimmedLines}
                  editorIcon={selectedCodeEditor?.icon}
                  language="typescript"
                  variant="editor"
                  copyLabel={m.common_copy()}
                  copiedLabel={m.common_copied()}
                />
              {/if}
            </GuideSubSectionBody>
          </div>
        {/if}
        {#if llmGuidanceEnabled && style}
          <GuideLlmPromptSection
            eyebrow={aiAccess === 'agentic'
              ? m.guide_renderer_prompt_agent_eyebrow()
              : m.guide_renderer_prompt_chat_eyebrow()}
            prompt={progressiveSectionPrompts.style}
            promptIcon={selectedLlmOption?.icon}
            title={m.guide_renderer_setup_title({
              library: selectedMapLibrary?.label ?? '',
            })}
          />
        {/if}
      </GuideSection>

      <GuideSection
        id="data"
        number={6}
        showBorder={false}
        eyebrow={m.guide_data_eyebrow()}
      >
        <GuideParagraph class="mt-3">
          {@html m.guide_data_description({ region: selectedRegion?.label ?? '' })}
        </GuideParagraph>
        <div id="project-data" class="scroll-mt-28">
          <GuideChoiceGroup
            alignment="left"
            label={m.guide_data_label()}
            marker={{
              current: 1,
              label: m.guide_prerequisites_requirement_label(),
              total: 1,
            }}
            choices={dataChoices}
            bind:value={dataSource}
            illustratedCardSizing="fixed"
            illustratedFitWhenPossible
            variant="illustrated"
          />
        </div>
        {#if dataSource === 'existing'}
          <GuideCallout class="mt-8" size="generous">
            <h3 class="font-display text-headline-sm font-bold text-primary">
              {@html m.guide_data_existing_title()}
            </h3>
            <div class="mt-5">
              <GuideCodeBlock
                label={m.guide_data_existing_prompt_label()}
                code={m.guide_data_existing_prompt()}
                copyLabel={m.common_copy()}
                copiedLabel={m.common_copied()}
              />
            </div>
          </GuideCallout>
        {:else if dataSource === 'api' && renderer === 'maplibre' && selectedStyle}
          <GuideUrbanDensityExample
            editorIcon={selectedCodeEditor?.icon}
            hasNonHongKongBasemap={Boolean(region && region !== 'hk')}
            hongKongBasemapNote={region && region !== 'hk'
              ? m.guide_data_urban_density_hong_kong_note({
                  region: selectedRegion?.label ?? '',
                })
              : undefined}
            mapReadyCode={urbanDensityMapReadyCode}
            mapPreviewLabel={m.guide_data_urban_density_map_preview_label({
              style: selectedStyle.name,
            })}
            {styleUrl}
            {terminalProjectPath}
            tilejsonUrl="https://tiles.saanseoi.hk/hongkong-latest.json"
            mapCode={urbanDensityMapCode}
            censusAreasCode={urbanDensityCensusAreasCode}
            calculationCode={urbanDensityCalculationCode}
            calculationDisplayCode={urbanDensityCalculationDisplayCode}
            metricsCode={urbanDensityMetricsCode}
            metricsCss={urbanDensityMetricsCss}
            metricsCssDisplayCode={urbanDensityMetricsCssDisplayCode}
            liveableAreaCode={urbanDensityLiveableAreaCode}
            liveableMetricsCode={urbanDensityLiveableMetricsCode}
            statsCode={urbanDensityStatsCode}
            statsDisplayCode={urbanDensityStatsDisplayCode}
            turfInstallCode={urbanDensityTurfInstallCode}
            {shareLinks}
            onShareExternalLink={shareExternalLink}
          />
        {:else if dataSource === 'api'}
          <GuideCallout class="mt-8" size="generous">
            <h3 class="font-display text-headline-sm font-bold text-primary">
              {@html m.guide_data_urban_density_maplibre_only_title()}
            </h3>
            <p class="mt-3 font-body text-body-lg leading-8 text-foreground-alt">
              {@html m.guide_data_urban_density_maplibre_only_description()}
            </p>
          </GuideCallout>
        {/if}
        {#if llmGuidanceEnabled && dataSource}
          <div class="mt-8">
            <GuidePromptBlock
              code={progressiveSectionPrompts.data}
              promptIcon={selectedLlmOption?.icon}
            />
          </div>
        {/if}
        {#if llmGuidanceEnabled && dataSource}
          <GuideReadinessPanel
            id="data-step-readiness"
            complete={isDataStepComplete}
            titleId="data-step-readiness-title"
          >
            <div class="flex items-start gap-3">
              <Icon
                icon={isDataStepComplete
                  ? 'material-symbols-light:check-circle-rounded'
                  : 'material-symbols-light:warning-rounded'}
                class={`mt-0.5 size-5 shrink-0 ${isDataStepComplete ? 'text-[#6fdec9]' : 'text-[#ef8b88]'}`}
                aria-hidden="true"
              />
              <div class="min-w-0 flex-1">
                <p
                  id="data-step-readiness-title"
                  class={`font-body text-label-sm font-semibold uppercase tracking-[0.12em] ${isDataStepComplete ? 'text-[#6fdec9]' : 'text-[#ffb4b1]'}`}
                >
                  {@html isDataStepComplete
                    ? m.guide_data_readiness_complete_eyebrow()
                    : m.guide_data_readiness_eyebrow()}
                </p>
                <p
                  class="mt-2 max-w-3xl font-body text-body-lg leading-8 text-foreground-alt"
                >
                  {@html isDataStepComplete
                    ? m.guide_data_readiness_complete_description()
                    : m.guide_data_readiness_description()}
                </p>
                <div class="mt-6 flex flex-wrap items-center justify-end gap-3">
                  {#if isDataStepComplete}
                    <Button size="compact" variant="secondary" onclick={resetDataStep}>
                      <Icon
                        icon="material-symbols-light:restart-alt-rounded"
                        class="size-5"
                        aria-hidden="true"
                      />
                      {@html m.guide_readiness_reset()}
                    </Button>
                  {:else}
                    <Button
                      class="bg-[#6fdec9] text-[#00201b] hover:bg-[#8aecd9]"
                      size="compact"
                      onclick={completeDataStep}
                    >
                      <Icon
                        icon="material-symbols-light:check-rounded"
                        class="size-5"
                        aria-hidden="true"
                      />
                      {@html m.guide_data_readiness_done()}
                    </Button>
                  {/if}
                </div>
              </div>
            </div>
          </GuideReadinessPanel>
        {/if}
      </GuideSection>

      {#if showPublishStep}
        <GuideSection
          id="publish"
          number={7}
          showBorder={false}
          eyebrow={m.guide_publish_eyebrow()}
          title={m.guide_setup_publish_title()}
          description={objective === 'mobile-embed'
              ? m.guide_publish_mobile_description()
              : m.guide_setup_publish_description()}
        >
          {#if llmGuidanceEnabled && isDataStepComplete}
            <GuidePromptBlock
              code={progressiveSectionPrompts.publish}
              promptIcon={selectedLlmOption?.icon}
            />
          {/if}
          {#if objective === 'mobile-embed'}
            {#if mobileDocsUrl}
              <a
                class="inline-flex font-body text-label-md font-semibold text-secondary underline underline-offset-4"
                href={mobileDocsUrl}
                target="_blank"
                rel="noreferrer"
                >{mobilePlatform === 'android'
                  ? m.guide_mobile_android()
                  : m.guide_mobile_ios()}</a
              >
            {:else}
              <GuideCallout>
                <p>
                  {@html m.guide_setup_mobile_other()}
                  <a
                    class="font-semibold text-secondary underline underline-offset-4"
                    href="/#community"
                    >{@html m.guide_join_community()}</a
                  >.
                </p>
              </GuideCallout>
            {/if}
          {:else}
            <GuideCodeBlock
              label={m.guide_setup_terminal_label({
                action: m.guide_setup_publish_code(),
                path: terminalProjectPath,
              })}
              code={deploymentCode}
              language={operatingSystem === 'windows' ? 'powershell' : 'bash'}
              copyLabel={m.common_copy()}
              copiedLabel={m.common_copied()}
            />
            {#if hostingDocsUrl}
              <a
                class="mt-4 inline-flex font-body text-label-md font-semibold text-secondary underline underline-offset-4"
                href={hostingDocsUrl}
                target="_blank"
                rel="noreferrer"
                >{@html m.guide_setup_hosting_docs()}</a
              >
            {/if}
            {#if objective === 'web-embed' && websitePlatform !== 'other'}
              <div class="mt-8">
                <h3 class="font-display text-headline-sm font-bold text-primary">
                  {@html m.guide_setup_embed_title()}
                </h3>
                <p class="mt-3 font-body text-body-lg leading-8 text-foreground-alt">
                  {@html m.guide_setup_embed_description({
                    provider: selectedWebsitePlatform?.label ?? '',
                  })}
                </p>
                <div class="mt-5">
                  <GuideCodeBlock
                    label={m.guide_setup_embed_code()}
                    code={iframeCode}
                    copyLabel={m.common_copy()}
                    copiedLabel={m.common_copied()}
                  />
                </div>
              </div>
            {/if}
          {/if}
        </GuideSection>
      {/if}
    </GuideRoot>
    <GuideMissingAnswerReminder
      dismissLabel={m.guide_missing_answer_dismiss()}
      questions={missingPrerequisiteQuestions}
      title={m.guide_missing_answer()}
    />
  </div>
</Main>

<CreateAMap.LlmDialog
  bind:open={llmDialogOpen}
  {copiedPromptProvider}
  onCopyAgenticHandoverPrompt={copyAgenticHandoverPrompt}
  onOpenChatHandover={openChatHandover}
  {pastePromptMessage}
  {handoverChatChoices}
  {handoverAgentPromptCopied}
/>
