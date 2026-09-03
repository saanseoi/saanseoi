<script lang="ts">
import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'
import { page } from '$app/state'
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { onMount, tick } from 'svelte'

import codexCliTrustDirectory from '#lib/assets/guides/codex-cli-trust-directory.png'
import viteDemoPage from '#lib/assets/guides/vite-demo-page.png'
import geojsonIoCsvImportDialog from '#lib/assets/guides/geojson-io-import-csv-dialog.png'
import geojsonIoImportGba from '#lib/assets/guides/geojson-io-import-gba.png'
import geojsonIoImportHongKong from '#lib/assets/guides/geojson-io-import-geojson.png'
import geojsonIoImportMacao from '#lib/assets/guides/geojson-io-import-macao.png'
import geojsonIoXlsxImportDialog from '#lib/assets/guides/geojson-io-import-xlsx-dialog.png'
import sublimeOpenStyleCss from '#lib/assets/guides/editor-sublime-open-style-css.png'
import ownDataHongKongChoropleth from '#lib/assets/guides/own-data-hong-kong-choropleth.png'
import saanSeoiDataHongKongSquare from '#lib/assets/guides/saanseoi-data-hong-kong-square.png'
import llmDataHongKongDragons from '#lib/assets/guides/llm-data-hong-kong-dragons.png'
import {
  CreateAMap,
  GuideAgenticAiPrimer,
  GuideAttachedLayout,
  GuideCallout,
  GuideCardBlock,
  GuideChoiceGroup,
  GuideCodeBlock,
  GuideCreateAMapVersionNotice,
  GuideEditorCardExplainer,
  GuideEditorProjectSetupSection,
  GuideEditorReadiness,
  GuideInstructionCallout,
  GuideLlmReadiness,
  GuideLlmPromptCard,
  GuideLlmPromptCardExplainer,
  GuideMapboxTokenReadiness,
  GuideManualSetup,
  GuideMissingAnswerReminder,
  GuideParagraph,
  GuidePaymentWarning,
  GuidePlatformSelection,
  GuidePreviewCodeBlock,
  GuideReference,
  GuideRoot,
  GuideScreenshot,
  GuideSection,
  GuideSubSectionBody,
  GuideSubSectionHeader,
  GuideTerminalIntroduction,
  GuideUrbanDensityExample,
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
  getCreateAMapOpeningPosition,
  getCreateAMapQueryChoice,
  type CreateAMapSelectionQuery,
  type CreateAMapSelectionValue,
} from '#lib/guides/createAMapSelections.js'
import { mapStyleDefinitions } from '@repo/basemap'
import { trackClientProductUsage } from '#lib/analytics/clientProductUsage.js'
import type { GuideLlmPromptReference } from '#lib/bits/pages/guides/index.js'

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
  editorCardExplainerCode,
  editorCardExplainerDisplayCode,
  createNotebookCode,
  createNotebookSetupCode,
  createProjectSetupCode,
  createProjectSetupReferences,
  createRestartProjectCode,
  createUrbanDensityStatsCode,
  createUrbanDensityStatsDisplayCode,
  createUrbanDensityMapReadyCode,
  createUrbanDensitySetupZ14TileFetcherCode,
  createUrbanDensitySetupZ14TileFetcherDisplayCode,
  createAMapRendererBasemapCode,
  createAMapRendererStyleCode,
  createGeoJsonImportCode,
  getBunInstallCode,
  getCreateAMapRendererReference,
  getRendererTerminalCommand,
  urbanDensityMapCode,
  urbanDensityMapDisplayCode,
  urbanDensityCalculationCode,
  urbanDensityCalculationDisplayCode,
  urbanDensityMetricsCode,
  urbanDensityMetricsDisplayCode,
  createUrbanDensityMetricsCss,
  urbanDensityGeometryWorkerCode,
  urbanDensityLiveableAreaCode,
  urbanDensityLiveableAreaCss,
  urbanDensityLiveableAreaDisplayCode,
  urbanDensityLiveableAreaMapCode,
  urbanDensityLiveableAreaMapDisplayCode,
  urbanDensityCollectNonLiveableLandCode,
  urbanDensityCollectNonLiveableLandDisplayCode,
  urbanDensitySetupZ14TileFetcherCss,
  urbanDensityLiveableMetricsCode,
  urbanDensityLiveableMetricsDisplayCode,
  urbanDensityTurfInstallCode,
  urbanDensityTurfInstallOutput,
  viteReadyOutput,
} from './snippets'
import GuideCreateAMapAccountComplete from './guideCreateAMapAccountComplete.svelte'
import GuideCreateAMapApiKeys from './guideCreateAMapApiKeys.svelte'
import GuideCreateAMapEmbed from './guideCreateAMapEmbed.svelte'
import GuideCreateAMapPublish from './guideCreateAMapPublish.svelte'
import GuideCreateAMapPublishOther from './guideCreateAMapPublishOther.svelte'
import GuidePublishRequirement from './guidePublishRequirement.svelte'
import GuideRendererBlankPreview from '#lib/bits/pages/guides/patterns/createAMap/guideRendererBlankPreview.svelte'
import GuideMapLibreStylePreview from '#lib/bits/pages/guides/patterns/createAMap/guideMapLibreStylePreview.svelte'
import GuideGeoJsonDataPreview from '#lib/bits/pages/guides/patterns/createAMap/guideGeoJsonDataPreview.svelte'
import {
  createAMapAgenticHandoverPrompt,
  createAMapAgenticDataStepPrompt,
  createAMapAgenticSectionPrompt,
  createAMapChatDataStepPrompt,
  createAMapChatHandoverPrompt,
  createAMapChatSectionPrompt,
  createAMapCustomDataPrompt,
  createAMapExistingDataPrompt,
  isCreateAMapAgentCapableEditor,
  shouldShowCreateAMapEditorSetup,
  type CreateAMapDataPromptStep,
  type CreateAMapDataPromptReferences,
  type CreateAMapLlmPromptState,
} from './createAMapLlmPrompt'

type Objective = CreateAMapSelectionValue<'objective'>
type AgentTool = CreateAMapSelectionValue<'agentTool'>
type CodeEditor = CreateAMapSelectionValue<'codeEditor'>
type DataFormat = CreateAMapSelectionValue<'dataFormat'>
type HandoverChatLlm = Extract<
  CreateAMapSelectionValue<'llm'>,
  'chatgpt' | 'claude' | 'deepseek' | 'gemini' | 'kimi'
>
type VpnAccess = CreateAMapSelectionValue<'vpnAccess'>
type WebsitePlatform = CreateAMapSelectionValue<'websitePlatform'>

const getPublishReadinessKey = ({
  aiAccess,
  hosting,
  llmMode,
  operatingSystem,
  terminalExperience,
}: Pick<
  CreateAMapSelectionQuery,
  'aiAccess' | 'hosting' | 'llmMode' | 'operatingSystem' | 'terminalExperience'
>) => [hosting, operatingSystem, terminalExperience, llmMode, aiAccess].join(':')

const getPublishAccessibilityRequirement = (
  hosting: CreateAMapSelectionQuery['hosting'],
) => {
  if (hosting === 'other') return 1
  if (hosting === 'github-pages') return 7
  return hosting ? 6 : undefined
}

const getCompletedPublishRequirements = (value: string | null, key: string) => {
  const [storedKey, serializedRequirements] = value?.split('|', 2) ?? []
  if (storedKey !== key || !serializedRequirements) return []

  return [
    ...new Set(
      serializedRequirements
        .split(',')
        .map(Number)
        .filter(
          requirement =>
            Number.isInteger(requirement) && requirement >= 1 && requirement <= 7,
        ),
    ),
  ].sort((left, right) => left - right)
}

let locale = $derived(getCurrentLocale())
const apiBaseUrl = (PUBLIC_ATLAS_API_BASE_URL || 'http://localhost:8787').replace(
  /\/+$/,
  '',
)
let urbanDensityStatsCode = $derived(
  createUrbanDensityStatsCode(
    apiBaseUrl,
    m.guide_data_urban_density_stats_comment_saved_result(),
  ),
)
let urbanDensityStatsDisplayCode = $derived(
  createUrbanDensityStatsDisplayCode(
    apiBaseUrl,
    m.guide_data_urban_density_stats_comment_saved_result(),
  ),
)
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
let dataFormat = $state<DataFormat | undefined>(
  getCreateAMapQueryChoice(page.url.searchParams, 'dataFormat'),
)
let mapboxTokenConfigured = $state(
  page.url.searchParams.get('mapbox-token-ready') === 'true',
)
let completedDataPreparationKey = $state(
  page.url.searchParams.get('data-prepared') ?? undefined,
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
let llmBasemapApiKey = $state<string>()
const llmGuidanceEnabled = $derived(
  llmMode === 'assisted' && (aiAccess === 'agentic' || aiAccess === 'web'),
)
let publishedHosting = $state<string | undefined>()
const initialPublishReadinessKey = getPublishReadinessKey({
  aiAccess: getCreateAMapQueryChoice(page.url.searchParams, 'aiAccess'),
  hosting: getCreateAMapQueryChoice(page.url.searchParams, 'hosting'),
  llmMode: getCreateAMapQueryChoice(page.url.searchParams, 'llmMode'),
  operatingSystem: getCreateAMapQueryChoice(page.url.searchParams, 'operatingSystem'),
  terminalExperience: getCreateAMapQueryChoice(
    page.url.searchParams,
    'terminalExperience',
  ),
})
let publishReadinessKey = $derived(
  getPublishReadinessKey({
    aiAccess,
    hosting,
    llmMode,
    operatingSystem,
    terminalExperience,
  }),
)
const initialCompletedPublishRequirements = getCompletedPublishRequirements(
  page.url.searchParams.get('publish-ready'),
  initialPublishReadinessKey,
)
let completedPublishRequirements = $state(initialCompletedPublishRequirements)
let isMapAccessible = $state(
  initialCompletedPublishRequirements.includes(
    getPublishAccessibilityRequirement(
      getCreateAMapQueryChoice(page.url.searchParams, 'hosting'),
    ) ?? 0,
  ),
)
let previousPublishReadinessKey = $state(initialPublishReadinessKey)

$effect(() => {
  if (previousPublishReadinessKey !== publishReadinessKey) {
    completedPublishRequirements = []
    isMapAccessible = false
  }
  previousPublishReadinessKey = publishReadinessKey
})

let editorReadinessKey = $derived(`${operatingSystem ?? ''}:${codeEditor ?? ''}`)
let dataReadinessKey = $derived(
  dataSource === 'existing' ? `${dataSource}:${dataFormat ?? ''}` : (dataSource ?? ''),
)
let isDataPrepared = $derived(
  Boolean(dataReadinessKey) && completedDataPreparationKey === dataReadinessKey,
)
let isDataAdded = $derived(
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
let isBasemapReady = $derived(
  Boolean(page.data.user) &&
    hasBasemapApiKey &&
    (!llmGuidanceEnabled || Boolean(llmBasemapApiKey)),
)
let basemapAccountContinueUrl = $derived.by(() => {
  const url = new URL(page.url.href)
  url.searchParams.set('basemap-account', 'complete')
  return `${url.pathname}${url.search}`
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

const completeDataPreparation = () => {
  if (!dataReadinessKey) return

  completedDataPreparationKey = dataReadinessKey
  trackClientProductUsage({
    event: 'guide.milestone',
    surface: 'guide',
    entityType: 'action',
    entityId: 'data_prepared',
  })
}

const resetDataPreparation = () => {
  completedDataPreparationKey = undefined
  completedDataKey = undefined
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

$effect(() => {
  if (llmGuidanceEnabled && !llmBasemapApiKey) {
    hasBasemapApiKey = false
    usingExistingBasemapApiKey = false
  }
})

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

const scrollToBasemapApiKeyRequirement = async () => {
  await tick()
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

  const requirement = document.getElementById('basemap-api-key-requirement')
  if (requirement) scrollToElementBelowHeader(requirement)
}

const confirmBasemapApiKey = async () => {
  hasBasemapApiKey = true
  await scrollToBasemapApiKeyRequirement()
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
  dataFormat,
})

createCreateAMapGuideAdapter({
  getAnalyticsTrackingStarted: () => analyticsTrackingStarted,
  getCurrentUrl: () => page.url,
  getSelection,
  getUrlState: () => ({
    ...getSelection(),
    basemapApiKeyReady: hasBasemapApiKey,
    completedDataPreparationKey,
    completedDataKey,
    completedEditorReadinessKey,
    completedLlmReadinessKey,
    completedPaymentKey,
    completedPublishRequirements,
    mapboxTokenConfigured,
    publishReadinessKey,
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
    ...(llmGuidanceEnabled
      ? [
          {
            value: 'llm',
            label: m.guide_data_llm(),
            description: m.guide_data_llm_description(),
            image: llmDataHongKongDragons,
          },
        ]
      : []),
    {
      value: 'existing',
      label: m.guide_data_existing(),
      description: m.guide_data_existing_description(),
      image: ownDataHongKongChoropleth,
    },
  ]
})
const dataFormatChoices = [
  {
    value: 'geojson',
    label: 'GeoJSON(L)',
    description: '.geojson, .json, .geojsonl, .geojsons, .ld',
    icon: 'proicons:brackets',
  },
  { value: 'kml', label: 'KML/KMZ', description: '.kml, .kmz', icon: 'proicons:globe' },
  {
    value: 'csv',
    label: 'CSV/TSV',
    description: '.csv, .tsv',
    icon: 'proicons:brackets',
  },
  {
    value: 'topojson',
    label: 'TopoJSON',
    description: '.topojson, .json',
    icon: 'proicons:layers',
  },
  {
    value: 'shapefile',
    label: 'Shapefile',
    description: '.zip',
    icon: 'proicons:archive',
  },
  {
    value: 'flatgeobuf',
    label: 'FlatGeobuf',
    description: '.fgb',
    icon: 'proicons:database',
  },
  {
    value: 'wkt',
    label: 'WKT',
    description: 'Well-Known Text',
    icon: 'proicons:brackets',
  },
  {
    value: 'xlsx',
    label: 'XLS/XLSX',
    description: 'Excel spreadsheet',
    icon: 'proicons:brackets',
  },
  {
    value: 'osm',
    label: 'OSM',
    description: '.osm, .xml',
    icon: 'proicons:map',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'GPX, GeoTIFF, photos, routes, coordinates and other spatial data',
    icon: 'proicons:more',
  },
] satisfies Array<{
  value: DataFormat
  label: string
  description: string
  icon: string
}>
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

const scrollToGuideChoice = (event: MouseEvent, id: string) => {
  event.preventDefault()

  const choice = document.getElementById(id)
  if (choice) scrollToElementBelowHeader(choice)
}

const handleLlmModeChange = (value?: string) => {
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
const handleTerminalExperienceChange = (value?: string) => {
  if (value === 'none') void scrollPrimerToTop('terminal-introduction')
}
const handleAgentToolChange = (value?: string) => {
  if (value === 'zed') void openZedSetup()
}
const handleObjectiveChange = (value?: string) => {
  objective = value as Objective | undefined
  hosting = objective === 'web' ? 'cloudflare' : undefined
  websitePlatform = undefined
  mobileLibrary = objective === 'mobile-embed' ? 'maplibre-native' : undefined
  mobilePlatform = undefined
  notebookLibrary = undefined
  notebookRuntime = undefined
  isMapAccessible = false
}
const handleWebsitePlatformChange = (value?: string) => {
  websitePlatform = value as WebsitePlatform | undefined
  hosting = value ? 'cloudflare' : undefined
  isMapAccessible = false
}
const handleRendererChange = (value?: string) => {
  renderer = value as CreateAMapSelectionValue<'renderer'> | undefined
  resetMapboxToken()
}

onMount(() => {
  operatingSystem ??= detectOperatingSystem(navigator.userAgent)
  analyticsTrackingStarted = true

  if (
    page.url.searchParams.get('basemap-account') === 'complete' &&
    !window.location.hash
  ) {
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
const openingPosition = $derived(getCreateAMapOpeningPosition(region))
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
const selectedDataFormat = $derived(
  dataFormatChoices.find(choice => choice.value === dataFormat),
)
const guideRenderer = $derived(
  renderer === 'maplibre' || renderer === 'mapbox' || renderer === 'leaflet'
    ? renderer
    : undefined,
)
const geoJsonImportCode = $derived(
  guideRenderer ? createGeoJsonImportCode(guideRenderer) : '',
)
const sampleDataUrl = $derived(
  `/guides/sample-data/${region === 'mo' ? 'macao' : region === 'gba' ? 'gba' : 'hong-kong'}-places.geojson`,
)
const geojsonImportScreenshot = $derived(
  region === 'mo'
    ? geojsonIoImportMacao
    : region === 'gba'
      ? geojsonIoImportGba
      : geojsonIoImportHongKong,
)
const dataPublicDirectory = $derived(
  operatingSystem === 'windows'
    ? 'C:\\Users\\YourName\\saanseoi-project\\public'
    : '~/saanseoi-project/public',
)
const geoJsonConversionTarget = $derived(
  guideRenderer === 'leaflet'
    ? m.guide_data_convert_target_leaflet()
    : guideRenderer
      ? m.guide_data_convert_target_map({
          library: selectedRenderer?.label ?? guideRenderer,
        })
      : '',
)
const dataImportLimit = $derived.by(() => {
  locale
  if (hosting === 'cloudflare') return m.guide_data_import_limit_cloudflare()
  if (hosting === 'github-pages') return m.guide_data_import_limit_github_pages()
  if (hosting === 'vercel') return m.guide_data_import_limit_vercel()
  if (hosting === 'netlify') return m.guide_data_import_limit_netlify()
  if (hosting === 'other') return m.guide_data_import_limit_other()
  return undefined
})
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
$effect(() => {
  if (publishedHosting && publishedHosting !== hosting) isMapAccessible = false
  publishedHosting = hosting
})
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
    isDataAdded,
    isDataPrepared,
    isMapAccessible,
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
    dataFormat,
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
const basemapDecisionTarget = $derived(
  isBasemapReady
    ? 'basemap-choice'
    : page.data.user
      ? 'basemap-api-key-requirement'
      : 'basemap',
)
const projectOutline = $derived([
  ...(llmGuidanceEnabled
    ? []
    : [
        {
          id: 'project-pre-check',
          label: m.guide_data_urban_density_toc_pre_check(),
        },
      ]),
  {
    id: 'project-fetch-stats',
    label: m.guide_data_urban_density_toc_fetch_stats(),
  },
  {
    id: 'project-calc-pop-density',
    label: m.guide_data_urban_density_toc_calc_pop_density(),
  },
  {
    id: 'project-add-stats-to-map',
    label: m.guide_data_urban_density_toc_add_stats_to_map(),
  },
  {
    id: 'project-highlight-excl',
    label: m.guide_data_urban_density_toc_highlight_excl(),
  },
  {
    id: 'project-calc-liveable-land',
    label: m.guide_data_urban_density_toc_calc_liveable_land(),
  },
  {
    id: 'project-finalise-map',
    label: m.guide_data_urban_density_toc_finalise_map(),
  },
])
const selectedPlatform = $derived(
  objective === 'local'
    ? m.guide_platform_local()
    : objective === 'web'
      ? selectedHosting?.label
      : objective === 'web-embed'
        ? selectedWebsitePlatform && selectedHosting
          ? `${selectedWebsitePlatform.label} · ${selectedHosting.label}`
          : selectedWebsitePlatform?.label
        : objective === 'mobile-embed'
          ? selectedMobilePlatform?.label
          : [selectedNotebookLibrary?.label, selectedNotebookRuntime?.label]
              .filter(Boolean)
              .join(' · '),
)
const promptEditor = $derived(
  aiAccess === 'agentic' && isCreateAMapAgentCapableEditor(agentTool)
    ? selectedLlmOption?.label
    : selectedCodeEditor?.label,
)
const promptEditorValue = $derived(
  aiAccess === 'agentic' && isCreateAMapAgentCapableEditor(agentTool)
    ? agentTool
    : codeEditor,
)
const showEditorProjectSetup = $derived(
  llmGuidanceEnabled &&
    shouldShowCreateAMapEditorSetup({
      llmType: aiAccess === 'agentic' ? 'agent' : 'chat',
      editorValue: promptEditorValue,
    }),
)
const showRenderEditorInstructions = $derived(!llmGuidanceEnabled)
const promptEditorIcon = $derived(
  aiAccess === 'agentic' && isCreateAMapAgentCapableEditor(agentTool)
    ? selectedLlmOption?.icon
    : selectedCodeEditor?.icon,
)
const llmPromptState = $derived.by(() => {
  return {
    agentTool: selectedLlmOption?.label,
    agentToolValue: agentTool,
    basemapApiKey: llmBasemapApiKey,
    codeEditor: promptEditor,
    codeEditorValue: promptEditorValue,
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
    operatingSystemValue: operatingSystem,
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
const guideDecisions = $derived.by(() => {
  locale
  return [
    {
      id: 'destination',
      label: m.guide_decision_destination(),
      selection: selectedObjective?.label,
    },
    ...(aiAccess === 'agentic'
      ? []
      : [
          {
            id: 'operating-system',
            label: m.guide_decision_operating_system(),
            selection: selectedOperatingSystem?.label,
          },
        ]),
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
      id: basemapDecisionTarget,
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

const setupCode = $derived(createProjectSetupCode(operatingSystem, renderer))
const llmProjectSetupReferences = $derived(
  createProjectSetupReferences(operatingSystem, renderer, {
    configureVite: m.guide_llm_prompt_card_configure_vite(),
    createProject: m.guide_llm_prompt_card_create_project(),
    createProjectDirectory: m.guide_llm_prompt_card_create_project_directory(),
    enterProjectDirectory: m.guide_llm_prompt_card_enter_project_directory(),
    installPackages: m.guide_llm_prompt_card_install_packages(),
  }),
)
const bunInstallExplanation = $derived(
  `${m.guide_setup_install_bun_explanation()}${terminalExperience === 'basic' ? ` ${m.guide_setup_install_bun_alternative_toolchain()}` : ''}`,
)
const setupStartStepNumber = 3
const setupContinueStepNumber = 4
const restartProjectCode = $derived(createRestartProjectCode(operatingSystem))
const agentProjectCommand = $derived(createAgentProjectCommand(agentTool))
const stopServerModifier = $derived(operatingSystem === 'macos' ? 'Control' : 'Ctrl')
const terminalProjectPath = $derived(
  operatingSystem === 'windows' ? '~\\saanseoi-project' : '~/saanseoi-project',
)
const projectSetupIntro = $derived.by(() => {
  if (aiAccess === 'agentic') {
    return m.guide_project_setup_agent_intro()
  }

  if (llmMode !== 'manual' || !setupReady || terminalExperience === 'advanced') {
    return m.guide_project_setup_intro()
  }

  return `${m.guide_project_setup_intro()}<br><br>${m.guide_project_setup_terminal_intro()}`
})
const bunInstallCode = $derived(getBunInstallCode(operatingSystem))
const notebookSetupCode = $derived(
  createNotebookSetupCode(operatingSystem, notebookLibrary),
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
    openingPosition,
  ),
)
const rendererInstallCode = $derived(rendererReference.installCommand)
const rendererVersionDependency = $derived(
  renderer === 'maplibre'
    ? { name: 'maplibre-gl', pinnedVersion: '6.7.0' }
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
const rendererEditorPath = $derived(
  operatingSystem === 'windows' ? 'src\\main.ts' : 'src/main.ts',
)
const rendererStylesheetPath = $derived(
  operatingSystem === 'windows' ? 'src\\style.css' : 'src/style.css',
)
const rendererEditorLabel = $derived(
  `${rendererEditorPath} • ${m.guide_renderer_editor_card_start_map()}`,
)
const rendererStylesheetLabel = $derived(
  `${rendererStylesheetPath} • ${m.guide_renderer_editor_card_reset_styles()}`,
)
const basemapEditorLabel = $derived(
  `${rendererEditorPath} • ${m.guide_basemap_editor_title()}`,
)
const styleEditorLabel = $derived(
  `${rendererEditorPath} • ${m.guide_style_editor_title({
    library: selectedRenderer?.label ?? '',
  })}`,
)
const editorNewFileShortcut = $derived(operatingSystem === 'macos' ? '⌘N' : 'Ctrl+N')
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
const llmRendererReferences = $derived.by(() => {
  if (!guideRenderer) return []

  const language: 'bash' | 'powershell' =
    operatingSystem === 'windows' ? 'powershell' : 'bash'

  return [
    {
      code: rendererInstallCode,
      language,
      path: terminalProjectPath,
      title: m.guide_renderer_package_title({ library: selectedRenderer?.label ?? '' }),
      type: 'CLI' as const,
    },
    {
      code: rendererCode,
      language: 'typescript' as const,
      path: rendererEditorPath,
      title: m.guide_renderer_code_title({ library: selectedRenderer?.label ?? '' }),
      type: 'TS' as const,
    },
    {
      code: rendererCssCode,
      language: 'css' as const,
      path: rendererStylesheetPath,
      title: m.guide_renderer_reset_styles_title(),
      type: 'CSS' as const,
    },
  ]
})
const rendererCodeComments = $derived.by(() => {
  if (renderer === 'mapbox') {
    return [
      { line: 1, text: m.guide_renderer_mapbox_comment_import() },
      { line: 2, text: m.guide_renderer_mapbox_comment_default_styles() },
      { line: 3, text: m.guide_renderer_comment_custom_styles() },
      { line: 5, text: m.guide_renderer_comment_map_node() },
      { line: 7, text: m.guide_renderer_mapbox_comment_access_token() },
      { line: 8, text: m.guide_renderer_mapbox_comment_new_map() },
      { line: 9, text: m.guide_renderer_comment_container() },
      { line: 10, text: m.guide_renderer_mapbox_comment_style() },
      { line: 11, text: m.guide_renderer_comment_center() },
      { line: 12, text: m.guide_renderer_comment_zoom() },
    ]
  }

  if (renderer === 'leaflet') {
    return [
      { line: 1, text: m.guide_renderer_leaflet_comment_import() },
      { line: 2, text: m.guide_renderer_leaflet_comment_default_styles() },
      { line: 3, text: m.guide_renderer_comment_custom_styles() },
      { line: 5, text: m.guide_renderer_comment_map_node() },
      { line: 7, text: m.guide_renderer_leaflet_comment_new_map() },
      { line: 8, text: m.guide_renderer_leaflet_comment_tiles() },
      { line: 9, text: m.guide_renderer_leaflet_comment_attribution() },
    ]
  }

  if (renderer === 'maplibre') {
    return [
      { line: 1, text: m.guide_renderer_maplibre_comment_import() },
      { line: 2, text: m.guide_renderer_maplibre_comment_worker() },
      { line: 3, text: m.guide_renderer_maplibre_comment_default_styles() },
      { line: 4, text: m.guide_renderer_comment_custom_styles() },
      { line: 6, text: m.guide_renderer_maplibre_comment_worker() },
      { line: 8, text: m.guide_renderer_comment_map_node() },
      { line: 10, text: m.guide_renderer_maplibre_comment_new_map() },
      { line: 11, text: m.guide_renderer_comment_container() },
      { line: 12, text: m.guide_renderer_comment_center() },
      { line: 13, text: m.guide_renderer_comment_zoom() },
      { line: 14, text: m.guide_renderer_maplibre_comment_style() },
    ]
  }

  return []
})
const basemapCode = $derived(
  renderer === 'maplibre' || renderer === 'mapbox' || renderer === 'leaflet'
    ? createAMapRendererBasemapCode(renderer, styleUrl, tilejsonUrl, openingPosition)
    : '',
)
const llmBasemapReferences = $derived.by(() => {
  if (!guideRenderer || !region) return []

  return [
    {
      code: basemapCode,
      language: 'typescript' as const,
      path: rendererEditorPath,
      title: m.guide_basemap_editor_title(),
      type: 'TS' as const,
    },
  ]
})
const basemapCodeDimmedLines = $derived(
  basemapCode
    .split('\n')
    .flatMap((line, index) =>
      line.trim() && rendererCode.split('\n').includes(line) ? [index + 1] : [],
    ),
)
const basemapCodeComments = $derived.by(() => {
  if (renderer === 'mapbox') {
    return [
      { line: 1, text: m.guide_renderer_mapbox_comment_import() },
      { line: 2, text: m.guide_renderer_mapbox_comment_default_styles() },
      { line: 3, text: m.guide_renderer_comment_custom_styles() },
      { line: 5, text: m.guide_basemap_comment_access_token() },
      { line: 6, text: m.guide_basemap_comment_url_safe_api_key() },
      { line: 7, text: m.guide_basemap_comment_basemap_base_url() },
      { line: 8, text: m.guide_basemap_comment_basemap_url() },
      { line: 13, text: m.guide_renderer_comment_container() },
      { line: 14, text: m.guide_renderer_comment_center() },
      { line: 15, text: m.guide_renderer_comment_zoom() },
      { line: 16, text: m.guide_basemap_comment_style() },
      { line: 19, text: m.guide_basemap_comment_source() },
    ]
  }

  if (renderer === 'leaflet') {
    return [
      { line: 1, text: m.guide_renderer_leaflet_comment_import() },
      { line: 2, text: m.guide_renderer_leaflet_comment_default_styles() },
      { line: 3, text: m.guide_renderer_maplibre_comment_import() },
      { line: 4, text: m.guide_renderer_maplibre_comment_worker() },
      { line: 5, text: m.guide_renderer_leaflet_comment_bridge() },
      { line: 6, text: m.guide_renderer_maplibre_comment_default_styles() },
      { line: 7, text: m.guide_renderer_comment_custom_styles() },
      { line: 9, text: m.guide_renderer_maplibre_comment_worker() },
      { line: 11, text: m.guide_basemap_comment_access_token() },
      { line: 12, text: m.guide_basemap_comment_url_safe_api_key() },
      { line: 13, text: m.guide_basemap_comment_basemap_base_url() },
      { line: 14, text: m.guide_basemap_comment_basemap_url() },
      { line: 23, text: m.guide_renderer_leaflet_comment_bridge() },
      { line: 24, text: m.guide_basemap_comment_style() },
      { line: 27, text: m.guide_basemap_comment_source() },
    ]
  }

  if (renderer === 'maplibre') {
    return [
      { line: 1, text: m.guide_renderer_maplibre_comment_import() },
      { line: 2, text: m.guide_renderer_maplibre_comment_worker() },
      { line: 3, text: m.guide_renderer_maplibre_comment_default_styles() },
      { line: 4, text: m.guide_renderer_comment_custom_styles() },
      { line: 6, text: m.guide_renderer_maplibre_comment_worker() },
      { line: 8, text: m.guide_basemap_comment_access_token() },
      { line: 9, text: m.guide_basemap_comment_url_safe_api_key() },
      { line: 10, text: m.guide_basemap_comment_basemap_base_url() },
      { line: 11, text: m.guide_basemap_comment_basemap_url() },
      { line: 16, text: m.guide_renderer_comment_container() },
      { line: 17, text: m.guide_renderer_comment_center() },
      { line: 18, text: m.guide_renderer_comment_zoom() },
      { line: 19, text: m.guide_basemap_comment_style() },
      { line: 22, text: m.guide_basemap_comment_source() },
    ]
  }

  return []
})
const rendererEditorInstruction = $derived(
  m.guide_renderer_editor_instruction({
    editor: promptEditor ?? m.guide_setup_editor_your_editor(),
    library: selectedRenderer?.label ?? '',
    path: rendererEditorPath,
  }),
)
const styleEditCode = $derived(
  selectedStyle &&
    (renderer === 'maplibre' || renderer === 'mapbox' || renderer === 'leaflet')
    ? createAMapRendererStyleCode(renderer, styleUrl, tilejsonUrl, openingPosition)
    : '',
)
const llmStyleReferences = $derived.by(() => {
  if (!guideRenderer || !selectedStyle) return []

  return [
    {
      code: styleEditCode,
      language: 'typescript' as const,
      path: rendererEditorPath,
      title: m.guide_style_editor_title({ library: selectedRenderer?.label ?? '' }),
      type: 'TS' as const,
    },
  ]
})
const llmUrbanDensityReferences = $derived.by(
  (): {
    calculation: GuideLlmPromptReference[]
    final: GuideLlmPromptReference[]
    liveable: GuideLlmPromptReference[]
    map: GuideLlmPromptReference[]
    metrics: GuideLlmPromptReference[]
    stats: GuideLlmPromptReference[]
  } => {
    if (!guideRenderer || !selectedStyle) {
      return {
        calculation: [],
        final: [],
        liveable: [],
        map: [],
        metrics: [],
        stats: [],
      }
    }

    return {
      stats: [
        {
          code: urbanDensityStatsCode,
          language: 'typescript',
          path: rendererEditorPath,
          title: m.guide_data_urban_density_calculate_code(),
          type: 'TS',
        },
      ],
      calculation: [
        {
          code: urbanDensityCalculationCode,
          language: 'typescript',
          path: rendererEditorPath,
          title: m.guide_data_urban_density_results_code(),
          type: 'TS',
        },
      ],
      map: [
        {
          code: urbanDensityMapCode,
          language: 'typescript',
          path: rendererEditorPath,
          title: m.guide_data_urban_density_map_code(),
          type: 'TS',
        },
      ],
      metrics: [
        {
          code: createUrbanDensityMetricsCss(selectedStyle.appearance),
          language: 'css',
          path: rendererStylesheetPath,
          title: m.guide_data_urban_density_metrics_css(),
          type: 'CSS',
        },
        {
          code: urbanDensityMetricsCode,
          language: 'typescript',
          path: rendererEditorPath,
          title: m.guide_data_urban_density_results_map_code(),
          type: 'TS',
        },
      ],
      liveable: [
        {
          code: urbanDensityTurfInstallCode,
          language: 'bash',
          path: terminalProjectPath,
          title: m.guide_data_urban_density_install_code(),
          type: 'CLI',
        },
        {
          code: urbanDensityTurfInstallOutput,
          language: 'text',
          path: terminalProjectPath,
          title: m.guide_data_urban_density_install_output(),
          type: 'CLI',
        },
        {
          code: urbanDensityGeometryWorkerCode,
          language: 'typescript',
          path: 'src/land-analysis.worker.ts',
          title: m.guide_data_urban_density_geometry_worker_code(),
          type: 'TS',
        },
        {
          code: [urbanDensitySetupZ14TileFetcherCss, urbanDensityLiveableAreaCss].join(
            '\n\n',
          ),
          language: 'css',
          path: rendererStylesheetPath,
          title: m.guide_data_urban_density_llm_analysis_styles(),
          type: 'CSS',
        },
        {
          code: [
            createUrbanDensitySetupZ14TileFetcherCode(guideRenderer),
            urbanDensityCollectNonLiveableLandCode,
            urbanDensityLiveableAreaCode,
          ].join('\n\n'),
          language: 'typescript',
          path: rendererEditorPath,
          title: m.guide_data_urban_density_llm_analysis_main(),
          type: 'TS',
        },
      ],
      final: [
        {
          code: [urbanDensityLiveableMetricsCode, urbanDensityLiveableAreaMapCode].join(
            '\n\n',
          ),
          language: 'typescript',
          path: rendererEditorPath,
          title: m.guide_data_urban_density_llm_finalise_map(),
          type: 'TS',
        },
      ],
    }
  },
)
const llmUrbanDensityDataStepReferences = $derived<CreateAMapDataPromptReferences>({
  fetchStats: llmUrbanDensityReferences.stats,
  calculateDensity: llmUrbanDensityReferences.calculation,
  addStatsToMap: llmUrbanDensityReferences.metrics,
  findUnliveableLand: llmUrbanDensityReferences.map,
  calculateLiveableArea: llmUrbanDensityReferences.liveable,
  finaliseMap: llmUrbanDensityReferences.final,
})

// 3. Progressive prompts for a coding agent as the guide advances.
const agenticSectionPrompts = $derived({
  prerequisites: createAMapAgenticSectionPrompt(llmPromptState, 'prerequisites'),
  render: createAMapAgenticSectionPrompt(llmPromptState, 'render'),
  basemap: createAMapAgenticSectionPrompt(llmPromptState, 'basemap'),
  style: createAMapAgenticSectionPrompt(llmPromptState, 'style'),
  data: createAMapAgenticSectionPrompt(
    llmPromptState,
    'data',
    llmUrbanDensityDataStepReferences,
  ),
  publish: createAMapAgenticSectionPrompt(llmPromptState, 'publish'),
})
// 4. Progressive prompts for a web chat as the guide advances.
const chatSectionPrompts = $derived({
  prerequisites: createAMapChatSectionPrompt(llmPromptState, 'prerequisites'),
  render: createAMapChatSectionPrompt(llmPromptState, 'render'),
  basemap: createAMapChatSectionPrompt(llmPromptState, 'basemap'),
  style: createAMapChatSectionPrompt(llmPromptState, 'style'),
  data: createAMapChatSectionPrompt(
    llmPromptState,
    'data',
    llmUrbanDensityDataStepReferences,
  ),
  publish: createAMapChatSectionPrompt(llmPromptState, 'publish'),
})
const progressiveSectionPrompts = $derived(
  aiAccess === 'agentic' ? agenticSectionPrompts : chatSectionPrompts,
)
const llmCustomDataPrompt = $derived(
  createAMapCustomDataPrompt(
    llmPromptState,
    aiAccess === 'agentic' ? 'agentic' : 'chat',
  ),
)
const llmGeoJsonImportReferences = $derived<GuideLlmPromptReference[]>(
  guideRenderer
    ? [
        {
          code: geoJsonImportCode,
          language: 'typescript',
          path: rendererEditorPath,
          title: m.guide_data_import_code_label(),
          type: 'TS',
        },
      ]
    : [],
)
const llmExistingDataPrompt = $derived(
  createAMapExistingDataPrompt(
    llmPromptState,
    aiAccess === 'agentic' ? 'agentic' : 'chat',
    llmGeoJsonImportReferences,
  ),
)
const agenticDataStepPrompts = $derived<Record<CreateAMapDataPromptStep, string>>({
  fetchStats: createAMapAgenticDataStepPrompt(
    llmPromptState,
    'fetchStats',
    llmUrbanDensityDataStepReferences.fetchStats,
  ),
  calculateDensity: createAMapAgenticDataStepPrompt(
    llmPromptState,
    'calculateDensity',
    llmUrbanDensityDataStepReferences.calculateDensity,
  ),
  addStatsToMap: createAMapAgenticDataStepPrompt(
    llmPromptState,
    'addStatsToMap',
    llmUrbanDensityDataStepReferences.addStatsToMap,
  ),
  findUnliveableLand: createAMapAgenticDataStepPrompt(
    llmPromptState,
    'findUnliveableLand',
    llmUrbanDensityDataStepReferences.findUnliveableLand,
  ),
  calculateLiveableArea: createAMapAgenticDataStepPrompt(
    llmPromptState,
    'calculateLiveableArea',
    llmUrbanDensityDataStepReferences.calculateLiveableArea,
  ),
  finaliseMap: createAMapAgenticDataStepPrompt(
    llmPromptState,
    'finaliseMap',
    llmUrbanDensityDataStepReferences.finaliseMap,
  ),
})
const chatDataStepPrompts = $derived<Record<CreateAMapDataPromptStep, string>>({
  fetchStats: createAMapChatDataStepPrompt(
    llmPromptState,
    'fetchStats',
    llmUrbanDensityDataStepReferences.fetchStats,
  ),
  calculateDensity: createAMapChatDataStepPrompt(
    llmPromptState,
    'calculateDensity',
    llmUrbanDensityDataStepReferences.calculateDensity,
  ),
  addStatsToMap: createAMapChatDataStepPrompt(
    llmPromptState,
    'addStatsToMap',
    llmUrbanDensityDataStepReferences.addStatsToMap,
  ),
  findUnliveableLand: createAMapChatDataStepPrompt(
    llmPromptState,
    'findUnliveableLand',
    llmUrbanDensityDataStepReferences.findUnliveableLand,
  ),
  calculateLiveableArea: createAMapChatDataStepPrompt(
    llmPromptState,
    'calculateLiveableArea',
    llmUrbanDensityDataStepReferences.calculateLiveableArea,
  ),
  finaliseMap: createAMapChatDataStepPrompt(
    llmPromptState,
    'finaliseMap',
    llmUrbanDensityDataStepReferences.finaliseMap,
  ),
})
const progressiveDataStepPrompts = $derived(
  aiAccess === 'agentic' ? agenticDataStepPrompts : chatDataStepPrompts,
)

const geoJsonImportOmittedLines = $derived(
  styleEditCode ? styleEditCode.split('\n').length : 0,
)
const geoJsonImportComments = $derived.by(() => {
  const omittedLinesComment = {
    alwaysVisible: true,
    line: 1,
    spacerAfter: true,
    text: m.guide_data_import_code_omitted({ lines: geoJsonImportOmittedLines }),
  }

  if (renderer === 'leaflet') {
    return [
      omittedLinesComment,
      { line: 1, text: m.guide_data_import_comment_fetch() },
      { line: 3, text: m.guide_data_import_comment_layer() },
      { line: 4, text: m.guide_data_import_comment_marker() },
      { line: 11, text: m.guide_data_import_comment_popup() },
    ]
  }

  return [
    omittedLinesComment,
    { line: 1, text: m.guide_data_import_comment_fetch() },
    { line: 3, text: m.guide_data_import_comment_ready() },
    { line: 4, text: m.guide_data_import_comment_source() },
    { line: 5, text: m.guide_data_import_comment_layer() },
    { line: 6, text: m.guide_data_import_comment_marker() },
    { line: 9, text: m.guide_data_import_comment_popup() },
    { line: 16, text: m.guide_data_import_comment_loaded() },
  ]
})
const styleEditDimmedLines = $derived(
  styleEditCode
    .split('\n')
    .flatMap((line, index) =>
      line.trim() && basemapCode.split('\n').includes(line) ? [index + 1] : [],
    ),
)
const styleEditComments = $derived.by(() => {
  if (renderer === 'mapbox') {
    return [
      { line: 1, text: m.guide_renderer_mapbox_comment_import() },
      { line: 2, text: m.guide_renderer_mapbox_comment_default_styles() },
      { line: 3, text: m.guide_renderer_comment_custom_styles() },
      { line: 5, text: m.guide_basemap_comment_access_token() },
      { line: 6, text: m.guide_basemap_comment_url_safe_api_key() },
      { line: 7, text: m.guide_basemap_comment_basemap_base_url() },
      { line: 8, text: m.guide_basemap_comment_basemap_url() },
      { line: 10, text: m.guide_style_comment_style_url() },
      { line: 11, text: m.guide_style_comment_fetch() },
      { line: 12, text: m.guide_style_comment_sources() },
      { line: 13, text: m.guide_style_comment_basemap_source() },
      { line: 18, text: m.guide_renderer_comment_container() },
      { line: 19, text: m.guide_renderer_comment_center() },
      { line: 20, text: m.guide_renderer_comment_zoom() },
      { line: 21, text: m.guide_basemap_comment_style() },
    ]
  }

  if (renderer === 'leaflet') {
    return [
      { line: 1, text: m.guide_renderer_leaflet_comment_import() },
      { line: 2, text: m.guide_renderer_leaflet_comment_default_styles() },
      { line: 3, text: m.guide_renderer_maplibre_comment_import() },
      { line: 4, text: m.guide_renderer_maplibre_comment_worker() },
      { line: 5, text: m.guide_renderer_leaflet_comment_bridge() },
      { line: 6, text: m.guide_renderer_maplibre_comment_default_styles() },
      { line: 7, text: m.guide_renderer_comment_custom_styles() },
      { line: 9, text: m.guide_renderer_maplibre_comment_worker() },
      { line: 11, text: m.guide_basemap_comment_access_token() },
      { line: 12, text: m.guide_basemap_comment_url_safe_api_key() },
      { line: 13, text: m.guide_basemap_comment_basemap_base_url() },
      { line: 14, text: m.guide_basemap_comment_basemap_url() },
      { line: 16, text: m.guide_style_comment_style_url() },
      { line: 17, text: m.guide_style_comment_fetch() },
      { line: 18, text: m.guide_style_comment_sources() },
      { line: 19, text: m.guide_style_comment_basemap_source() },
      { line: 24, text: m.guide_renderer_leaflet_comment_bridge() },
      { line: 25, text: m.guide_basemap_comment_style() },
    ]
  }

  if (renderer === 'maplibre') {
    return [
      { line: 1, text: m.guide_renderer_maplibre_comment_import() },
      { line: 2, text: m.guide_renderer_maplibre_comment_worker() },
      { line: 3, text: m.guide_renderer_maplibre_comment_default_styles() },
      { line: 4, text: m.guide_renderer_comment_custom_styles() },
      { line: 6, text: m.guide_renderer_maplibre_comment_worker() },
      { line: 8, text: m.guide_basemap_comment_access_token() },
      { line: 9, text: m.guide_basemap_comment_url_safe_api_key() },
      { line: 10, text: m.guide_basemap_comment_basemap_base_url() },
      { line: 11, text: m.guide_basemap_comment_basemap_url() },
      { line: 13, text: m.guide_style_comment_style_url() },
      { line: 14, text: m.guide_style_comment_fetch() },
      { line: 15, text: m.guide_style_comment_sources() },
      { line: 16, text: m.guide_style_comment_basemap_source() },
      { line: 21, text: m.guide_renderer_comment_container() },
      { line: 22, text: m.guide_renderer_comment_center() },
      { line: 23, text: m.guide_renderer_comment_zoom() },
      { line: 24, text: m.guide_basemap_comment_style() },
    ]
  }

  return []
})
const styleEditorInstruction = $derived(
  m.guide_style_editor_instruction({
    editor: promptEditor ?? m.guide_setup_editor_your_editor(),
    path: rendererEditorPath,
  }),
)
const rendererStylesheetInstruction = $derived(
  m.guide_renderer_stylesheet_instruction({
    editor: promptEditor ?? m.guide_setup_editor_your_editor(),
    path: rendererStylesheetPath,
  }),
)
const urbanDensityMapReadyCode = $derived(
  selectedStyle && guideRenderer
    ? createUrbanDensityMapReadyCode(styleUrl, guideRenderer)
    : '',
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
      {projectOutline}
      projectOutlineAnchorId="saanseoi-project"
      projectOutlineEndAnchorId="publish"
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
              illustratedFullBleed
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
                <div>
                  {#if showEditorProjectSetup && agentTool === 'cursor'}
                    <GuideEditorProjectSetupSection editor={agentTool} />
                  {:else if agentTool !== 'zed'}
                    <GuideSubSectionHeader
                      eyebrow={m.guide_setup_agent_eyebrow()}
                      title={m.guide_setup_agent_title()}
                    />
                    {#if agentProjectCommand}
                      <GuideParagraph>
                        {@html m.guide_setup_agent_terminal_instruction()}
                      </GuideParagraph>
                      <div class="mt-5">
                        <GuideCodeBlock
                          label={m.guide_setup_agent_terminal_label()}
                          code={agentProjectCommand}
                          language="bash"
                          copyLabel={m.common_copy()}
                          copiedLabel={m.common_copied()}
                        />
                      </div>
                      {#if agentTool === 'codex-cli'}
                        <GuideParagraph class="mt-5">
                          {@html m.guide_setup_agent_codex_cli_trust_directory()}
                        </GuideParagraph>
                        <div class="mt-5 max-w-3xl">
                          <GuideScreenshot
                            src={codexCliTrustDirectory}
                            alt={m.guide_setup_agent_codex_cli_trust_directory_alt()}
                          />
                        </div>
                      {/if}
                    {:else if agentTool === 'codex-app'}
                      <GuideParagraph>
                        {@html m.guide_setup_agent_codex_app_instruction()}
                      </GuideParagraph>
                    {:else if agentTool === 'claude-cowork'}
                      <GuideParagraph>
                        {@html m.guide_setup_agent_claude_cowork_instruction()}
                      </GuideParagraph>
                    {:else}
                      <GuideParagraph>
                        {@html m.guide_setup_agent_other_instruction()}
                      </GuideParagraph>
                    {/if}
                  {/if}
                  {#if agentModelSelectionInstruction}
                    <GuideParagraph class="mt-5">
                      {@html agentModelSelectionInstruction}
                    </GuideParagraph>
                  {/if}
                </div>
              {/if}
              {#if aiAccess === 'agentic'}
                {#if llmGuidanceEnabled}
                  <GuideLlmPromptCardExplainer promptIcon={selectedLlmOption?.icon} />
                {/if}
                <div class="w-full min-w-0 max-w-232">
                  <GuideSubSectionHeader
                    eyebrow={m.guide_setup_llm_eyebrow()}
                    title={m.guide_setup_llm_title()}
                  />
                  <GuideParagraph>
                    {@html m.guide_setup_agent_llm_instruction_before()}
                    <span
                      class="mx-1 inline-flex items-center gap-1 font-semibold text-foreground"
                    >
                      <Icon
                        icon={selectedLlmOption?.icon ?? 'proicons:more'}
                        class="size-4"
                      />
                      {@html selectedLlmOption?.label ?? ''}
                    </span>
                    {@html m.guide_setup_agent_llm_instruction_after()}
                  </GuideParagraph>
                  <div class="mt-5">
                    <GuideLlmPromptCard
                      prompt={progressiveSectionPrompts.prerequisites}
                      promptIcon={selectedLlmOption?.icon}
                      references={llmProjectSetupReferences}
                      title={m.guide_setup_llm_title()}
                      previewImageSrc={viteDemoPage}
                      previewAlt={m.guide_llm_prompt_card_preview_alt()}
                    />
                  </div>
                </div>
              {/if}
              {#if showEditorProjectSetup && aiAccess === 'web' && objective !== 'notebook-embed' && objective !== 'mobile-embed'}
                <GuideEditorProjectSetupSection editor={codeEditor} />
              {/if}
              {#if aiAccess === 'web' && isProjectEditorReady && isLlmReadinessComplete}
                {#if llmGuidanceEnabled}
                  <GuideLlmPromptCardExplainer promptIcon={selectedLlmOption?.icon} />
                {/if}
                <div class="mt-14 w-full min-w-0 max-w-232">
                  <GuideSubSectionHeader
                    eyebrow={m.guide_setup_llm_eyebrow()}
                    title={m.guide_setup_llm_title()}
                  />
                  <GuideParagraph>
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
                  </GuideParagraph>
                  <div class="mt-5">
                    <GuideLlmPromptCard
                      prompt={progressiveSectionPrompts.prerequisites}
                      promptIcon={selectedLlmOption?.icon}
                      references={llmProjectSetupReferences}
                      title={m.guide_setup_llm_title()}
                      previewImageSrc={viteDemoPage}
                      previewAlt={m.guide_llm_prompt_card_preview_alt()}
                    />
                  </div>
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
        {#if showRenderEditorInstructions && promptEditor && objective !== 'mobile-embed' && objective !== 'notebook-embed'}
          <GuideParagraph class="mt-3">
            {@html m.guide_render_editor_intro({
              editor: promptEditor ?? m.guide_setup_editor_your_editor(),
            })}
          </GuideParagraph>
          <GuideEditorCardExplainer
            code={editorCardExplainerCode}
            displayCode={editorCardExplainerDisplayCode}
            editorIcon={promptEditorIcon}
            pathSeparator={operatingSystem === 'windows' ? '\\' : undefined}
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
            {#if renderer === 'mapbox' && !llmGuidanceEnabled}
              <GuideMapboxTokenReadiness
                configured={mapboxTokenConfigured}
                editorIcon={promptEditorIcon}
                editorLabel={promptEditor}
                newFileShortcut={editorNewFileShortcut}
                onComplete={completeMapboxToken}
                onReset={resetMapboxToken}
                {operatingSystem}
                {terminalProjectPath}
              />
            {/if}
            {#if renderer !== 'mapbox' || mapboxTokenConfigured}
              {#if showRenderEditorInstructions}
                {#snippet rendererInstallCard()}
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
                {/snippet}
                <div class="pt-10">
                  <GuideCardBlock
                    eyebrow={m.guide_renderer_prompt_none_eyebrow()}
                    title={m.guide_renderer_package_title({
                      library: selectedRenderer?.label ?? '',
                    })}
                    card={rendererInstallCard}
                  >
                    <GuideParagraph
                      class="[&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
                    >
                      {@html rendererTerminalReminder}
                    </GuideParagraph>
                  </GuideCardBlock>
                </div>
                {#snippet rendererStylesheetCard()}
                  <GuideCodeBlock
                    label={rendererStylesheetLabel}
                    code={rendererCssCode}
                    editorIcon={promptEditorIcon}
                    language="css"
                    variant="editor"
                    width="short"
                    copyLabel={m.common_copy()}
                    copiedLabel={m.common_copied()}
                  />
                {/snippet}
                {#snippet rendererStylesheetBefore()}
                  {#if codeEditor === 'sublime-text'}
                    <div class="max-w-2xl">
                      <GuideScreenshot
                        src={sublimeOpenStyleCss}
                        alt={m.guide_renderer_sublime_stylesheet_image_alt()}
                        caption={m.guide_renderer_sublime_stylesheet_image_caption()}
                      />
                    </div>
                  {/if}
                {/snippet}
                <GuideCardBlock
                  before={rendererStylesheetBefore}
                  card={rendererStylesheetCard}
                  width="short"
                  eyebrow={m.guide_renderer_css_code()}
                  title={m.guide_renderer_reset_styles_title()}
                >
                  <GuideParagraph
                    class="[&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
                  >
                    {@html rendererStylesheetInstruction}
                  </GuideParagraph>
                </GuideCardBlock>
                {#snippet rendererCodeCard()}
                  <GuidePreviewCodeBlock
                    label={rendererEditorLabel}
                    code={rendererCode}
                    comments={rendererCodeComments}
                    editorIcon={promptEditorIcon}
                    language="typescript"
                    variant="editor"
                    width="short"
                    copyLabel={m.common_copy()}
                    copiedLabel={m.common_copied()}
                    previewLabel={m.guide_code_block_preview()}
                    showCodeLabel={m.guide_code_block_code()}
                    expandable
                    expandLabel={m.guide_code_block_expand()}
                    closeLabel={m.common_close()}
                  >
                    {#snippet preview()}
                      <GuideRendererBlankPreview
                        renderer={renderer ?? 'maplibre'}
                        {openingPosition}
                      />
                    {/snippet}
                  </GuidePreviewCodeBlock>
                {/snippet}
                {#snippet rendererCodeAfter()}
                  <GuideParagraph> {@html rendererEditorRefreshNote} </GuideParagraph>
                {/snippet}
                <GuideCardBlock
                  after={rendererCodeAfter}
                  card={rendererCodeCard}
                  width="short"
                  eyebrow={rendererCodeLabel}
                  title={m.guide_renderer_code_title({
                    library: selectedRenderer?.label ?? '',
                  })}
                >
                  <GuideParagraph
                    class="[&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
                  >
                    {@html rendererEditorInstruction}
                  </GuideParagraph>
                </GuideCardBlock>
              {/if}
            {/if}
          {/if}
          {#if objective === 'mobile-embed'}
            <GuideCallout id="map-library" class="scroll-mt-28">
              <GuideParagraph>{@html m.guide_renderer_mobile()}</GuideParagraph>
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
              <GuideParagraph> {@html m.guide_renderer_notebook()} </GuideParagraph>
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
          {#if llmGuidanceEnabled && guideRenderer && selectedMapLibrary}
            <div>
              <GuideSubSectionHeader
                eyebrow={m.guide_setup_llm_eyebrow()}
                title={m.guide_renderer_setup_title({ library: selectedMapLibrary.label })}
              />
              <GuideParagraph>
                {@html renderer === 'mapbox'
                  ? m.guide_renderer_prompt_mapbox_instruction({
                      llm: selectedLlmOption?.label ?? '',
                    })
                  : m.guide_renderer_prompt_instruction({
                      library: selectedMapLibrary.label,
                      llm: selectedLlmOption?.label ?? '',
                    })}
              </GuideParagraph>
              <div class="mt-6 max-w-232">
                <GuideLlmPromptCard
                  prompt={progressiveSectionPrompts.render}
                  promptIcon={selectedLlmOption?.icon}
                  references={llmRendererReferences}
                  title={m.guide_renderer_setup_title({ library: selectedMapLibrary.label })}
                >
                  {#snippet preview()}
                    <GuideRendererBlankPreview
                      renderer={renderer ?? 'maplibre'}
                      {openingPosition}
                    />
                  {/snippet}
                </GuideLlmPromptCard>
              </div>
            </div>
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
          <div id="basemap-api-key-requirement" class="mt-10 max-w-3xl scroll-mt-28">
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
              <GuideParagraph class="mt-3">
                {m.guide_basemap_api_key_create_instruction()}
              </GuideParagraph>
            {/if}
            <GuideCreateAMapApiKeys
              allowExistingKey={!llmGuidanceEnabled}
              autoConfirmCreatedKey={llmGuidanceEnabled}
              apiKeyReady={hasBasemapApiKey}
              editorIcon={selectedCodeEditor?.icon}
              editorLabel={selectedCodeEditor?.label}
              environmentFileExists={renderer === 'mapbox'}
              newFileShortcut={editorNewFileShortcut}
              {operatingSystem}
              {terminalProjectPath}
              onApiKeyCreated={key => {
                if (!llmGuidanceEnabled) return
                llmBasemapApiKey = key
              }}
              onApiKeyConfirmed={confirmBasemapApiKey}
              onApiKeyReadyChange={ready => {
                hasBasemapApiKey = ready
                if (!ready) llmBasemapApiKey = undefined
              }}
              showHeading={false}
              showEnvironmentSetup={!llmGuidanceEnabled}
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
            {#if showRenderEditorInstructions}
              <div class="mt-10 max-w-232 pt-10">
                <GuideSubSectionHeader
                  eyebrow={m.guide_basemap_editor_eyebrow()}
                  title={m.guide_basemap_editor_title()}
                />
                <GuideSubSectionBody content={m.guide_basemap_editor_description()}>
                  {#if renderer === 'leaflet'}
                    <GuideParagraph>
                      {m.guide_basemap_leaflet_bridge_description()}
                    </GuideParagraph>
                  {/if}
                  <GuidePreviewCodeBlock
                    label={basemapEditorLabel}
                    code={basemapCode}
                    comments={basemapCodeComments}
                    dimmedLines={basemapCodeDimmedLines}
                    editorIcon={promptEditorIcon}
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
                      <GuideRendererBlankPreview
                        {renderer}
                        {openingPosition}
                        title={m.guide_basemap_preview_title()}
                        description={m.guide_basemap_preview_description()}
                        unstyled
                      />
                    {/snippet}
                  </GuidePreviewCodeBlock>
                  <GuideParagraph>
                    {m.guide_basemap_editor_restart()}
                  </GuideParagraph>
                  <GuideParagraph class="mt-3">
                    {m.guide_basemap_editor_style_next()}
                  </GuideParagraph>
                </GuideSubSectionBody>
              </div>
            {/if}
          {:else if region && objective === 'mobile-embed'}
            <GuideCallout class="mt-8">
              <GuideParagraph>
                {@html m.guide_basemap_mobile_handoff()}
              </GuideParagraph>
            </GuideCallout>
          {:else if region && objective === 'notebook-embed'}
            <GuideCallout class="mt-8">
              <GuideParagraph>
                {@html m.guide_basemap_notebook_handoff()}
              </GuideParagraph>
            </GuideCallout>
          {/if}
          {#if llmGuidanceEnabled && region}
            <div class="mt-10">
              <div class="border-t border-border-card pt-10">
                <GuideSubSectionHeader
                  eyebrow={m.guide_setup_llm_eyebrow()}
                  title={m.guide_basemap_prompt_title()}
                />
                <div class="mt-6 max-w-232">
                  <GuideLlmPromptCard
                    prompt={progressiveSectionPrompts.basemap}
                    promptIcon={selectedLlmOption?.icon}
                    references={llmBasemapReferences}
                    title={m.guide_basemap_prompt_title()}
                  >
                    {#snippet preview()}
                      <GuideRendererBlankPreview
                        {renderer}
                        {openingPosition}
                        title={m.guide_basemap_preview_title()}
                        description={m.guide_basemap_preview_description()}
                        unstyled
                      />
                    {/snippet}
                  </GuideLlmPromptCard>
                </div>
              </div>
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
            <GuideParagraph class="mt-3">
              {@html m.guide_style_custom_description()}
            </GuideParagraph>
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
        {#if !llmGuidanceEnabled && selectedStyle && renderer}
          <div class="mt-10 max-w-232 pt-10">
            <GuideSubSectionHeader
              eyebrow={m.guide_basemap_editor_eyebrow()}
              title={m.guide_style_editor_title({ library: selectedRenderer?.label ?? '' })}
            />
            <GuideSubSectionBody>
              <GuideParagraph
                class="[&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
              >
                {@html styleEditorInstruction}
              </GuideParagraph>
              <GuidePreviewCodeBlock
                label={styleEditorLabel}
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
                    renderer={guideRenderer ?? 'maplibre'}
                    {styleUrl}
                    {tilejsonUrl}
                    {openingPosition}
                  />
                {/snippet}
              </GuidePreviewCodeBlock>
              <GuideParagraph class="mt-4">
                {m.guide_style_editor_success()}
              </GuideParagraph>
            </GuideSubSectionBody>
          </div>
        {/if}
        {#if llmGuidanceEnabled && selectedStyle && guideRenderer}
          <div class="mt-10">
            <GuideSubSectionHeader
              eyebrow={m.guide_setup_llm_eyebrow()}
              title={m.guide_style_setup_title()}
            />
            <div class="mt-6 max-w-232">
              <GuideLlmPromptCard
                prompt={progressiveSectionPrompts.style}
                promptIcon={selectedLlmOption?.icon}
                references={llmStyleReferences}
                title={m.guide_style_setup_title()}
              >
                {#snippet preview()}
                  <GuideMapLibreStylePreview
                    label={selectedStyle.name}
                    renderer={guideRenderer}
                    {styleUrl}
                    {tilejsonUrl}
                    {openingPosition}
                  />
                {/snippet}
              </GuideLlmPromptCard>
            </div>
          </div>
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
              total: dataSource === 'existing' ? 3 : 1,
            }}
            choices={dataChoices}
            bind:value={dataSource}
            illustratedCardSizing="fixed"
            illustratedFitWhenPossible
            variant="illustrated"
          />
        </div>
        {#if dataSource === 'existing'}
          <div id="data-format" class="mt-8 scroll-mt-28">
            <GuideChoiceGroup
              alignment="left"
              label={m.guide_data_format_label()}
              marker={{
                current: 2,
                label: m.guide_prerequisites_requirement_label(),
                total: 3,
              }}
              hint={m.guide_data_format_hint()}
              choices={dataFormatChoices}
              bind:value={dataFormat}
              variant="tiles"
              tileLayout="five-across"
            />
          </div>
          {#if selectedDataFormat}
            <div id="geojson" class="mt-12 max-w-232 scroll-mt-28">
              <GuideSubSectionHeader
                requirement={{
                    current: 3,
                    label: m.guide_prerequisites_requirement_label(),
                    total: 3,
                  }}
                title={dataFormat === 'geojson'
                    ? m.guide_data_geojson_title()
                    : m.guide_data_convert_title({ format: selectedDataFormat.label })}
              />
              <GuidePublishRequirement
                complete={isDataPrepared}
                completeAction={m.guide_data_preparation_done()}
                description={m.guide_data_preparation_complete_description()}
                eyebrow={m.guide_data_preparation_complete_eyebrow()}
                id="data-preparation-readiness"
                onComplete={completeDataPreparation}
                onReset={resetDataPreparation}
                resetDescription={m.guide_data_preparation_reset_description()}
                resetLabel={m.guide_readiness_reset()}
                scrollTargetId="data-preparation-readiness"
                titleId="data-preparation-readiness-title"
              >
                <GuideAttachedLayout primaryWidth="shortCard" class="mt-3">
                  <GuideSubSectionBody spacing="none">
                    {#if dataFormat !== 'geojson'}
                      <GuideParagraph>
                        {@html m.guide_data_convert_description({
                        fallback:
                          dataFormat === 'other' ? m.guide_data_convert_other() : '',
                        format: selectedDataFormat.label,
                        target: geoJsonConversionTarget,
                      })}
                      </GuideParagraph>
                    {/if}
                    {#if dataFormat === 'geojson'}
                      <GuideParagraph>
                        {@html m.guide_data_geojson_editor_optional({
                        assetLimit: dataImportLimit ? `<br><br>${dataImportLimit}` : '',
                      })}
                      </GuideParagraph>
                    {/if}
                    <ol
                      class={`${dataFormat === 'geojson' ? 'mt-0' : 'mt-4'} list-decimal space-y-2 pl-6 font-body text-body-lg leading-8 text-foreground-alt`}
                    >
                      <li>{@html m.guide_data_convert_step_open()}</li>
                      <li>{@html m.guide_data_convert_step_import()}</li>
                      {#if dataFormat === 'csv'}
                        <li>{@html m.guide_data_convert_step_columns()}</li>
                      {:else if dataFormat === 'xlsx'}
                        <li>{@html m.guide_data_convert_step_spreadsheet()}</li>
                      {/if}
                    </ol>
                    {#if dataFormat === 'csv'}
                      <GuideAttachedLayout
                        primaryWidth="shortCard"
                        class="xl:!w-[calc(100%+28rem)]"
                      >
                        <div class="space-y-4">
                          <GuideScreenshot
                            src={geojsonIoCsvImportDialog}
                            alt={m.guide_data_csv_dialog_screenshot_alt()}
                            caption={m.guide_data_csv_dialog_screenshot_caption()}
                            width="content"
                          />
                        </div>
                        {#snippet aside()}
                          <GuideInstructionCallout
                            title={m.guide_data_csv_kind_title()}
                            description={m.guide_data_csv_kind_coordinates()}
                          >
                            <ul
                              class="mt-3 list-disc space-y-1 pl-6 font-body text-sm leading-[1.6] text-foreground-alt"
                            >
                              <li>{@html m.guide_data_csv_kind_wkt()}</li>
                              <li>{@html m.guide_data_csv_kind_geojson()}</li>
                              <li>{@html m.guide_data_csv_kind_polyline()}</li>
                            </ul>
                          </GuideInstructionCallout>
                        {/snippet}
                      </GuideAttachedLayout>
                    {:else if dataFormat === 'xlsx'}
                      <GuideAttachedLayout
                        primaryWidth="shortCard"
                        class="xl:!w-[calc(100%+28rem)]"
                      >
                        <GuideScreenshot
                          src={geojsonIoXlsxImportDialog}
                          alt={m.guide_data_xlsx_dialog_screenshot_alt()}
                          caption={m.guide_data_xlsx_dialog_screenshot_caption()}
                          width="content"
                        />
                        {#snippet aside()}
                          <GuideInstructionCallout
                            title={m.guide_data_csv_kind_title()}
                            description={m.guide_data_csv_kind_coordinates()}
                          >
                            <ul
                              class="mt-3 list-disc space-y-1 pl-6 font-body text-sm leading-[1.6] text-foreground-alt"
                            >
                              <li>{@html m.guide_data_csv_kind_wkt()}</li>
                              <li>{@html m.guide_data_csv_kind_geojson()}</li>
                              <li>{@html m.guide_data_csv_kind_polyline()}</li>
                            </ul>
                          </GuideInstructionCallout>
                        {/snippet}
                      </GuideAttachedLayout>
                    {/if}
                    <GuideScreenshot
                      class="mt-6"
                      src={geojsonImportScreenshot}
                      alt={m.guide_data_geojson_imported_screenshot_alt({
                      region: selectedRegion?.label ?? '',
                    })}
                      caption={m.guide_data_geojson_imported_screenshot_caption({
                      region: selectedRegion?.label ?? '',
                    })}
                      width="content"
                    />
                    <ol
                      class="mt-4 list-decimal space-y-2 pl-6 font-body text-body-lg leading-8 text-foreground-alt"
                    >
                      <li>{@html m.guide_data_geojson_step_properties()}</li>
                      <li>{@html m.guide_data_geojson_step_geometry()}</li>
                      <li>{@html m.guide_data_geojson_step_export()}</li>
                    </ol>
                  </GuideSubSectionBody>
                  {#snippet aside()}
                    <GuideInstructionCallout
                      title={m.guide_data_geojson_callout_title()}
                      description={m.guide_data_geojson_description()}
                    />
                  {/snippet}
                </GuideAttachedLayout>
              </GuidePublishRequirement>
            </div>

            {#if renderer && selectedStyle}
              <div class="mt-10 max-w-232">
                {#if llmGuidanceEnabled}
                  <GuideSubSectionHeader
                    eyebrow={m.guide_data_import_llm_eyebrow()}
                    title={m.guide_data_import_llm_title()}
                  />
                {:else}
                  <GuideSubSectionHeader
                    eyebrow={m.guide_data_import_eyebrow()}
                    title={m.guide_data_import_title({ library: selectedRenderer?.label ?? '' })}
                  />
                {/if}
              </div>
            {/if}
            <div class={renderer && selectedStyle ? 'max-w-232' : ''}>
              <GuidePublishRequirement
                complete={isDataAdded}
                completeAction={m.guide_data_readiness_done()}
                description={m.guide_data_readiness_complete_description()}
                eyebrow={m.guide_data_readiness_complete_eyebrow()}
                id="data-addition-readiness"
                onComplete={completeDataStep}
                onReset={resetDataStep}
                resetDescription={m.guide_data_readiness_reset_description()}
                resetLabel={m.guide_readiness_reset()}
                scrollTargetId="data-addition-readiness"
                titleId="data-addition-readiness-title"
              >
                {#if renderer && selectedStyle}
                  <div class="max-w-232">
                    {#if llmGuidanceEnabled}
                      <div class="mt-6">
                        <GuideLlmPromptCard
                          prompt={llmExistingDataPrompt}
                          promptIcon={selectedLlmOption?.icon}
                          references={llmGeoJsonImportReferences}
                          title={m.guide_data_import_llm_title()}
                        >
                          {#snippet preview()}
                            <GuideGeoJsonDataPreview
                              label={m.guide_data_import_preview_label({ region: selectedRegion?.label ?? '' })}
                              renderer={guideRenderer ?? 'maplibre'}
                              {openingPosition}
                              popupAppearance={selectedStyle?.appearance ?? 'light'}
                              {sampleDataUrl}
                              {styleUrl}
                              {tilejsonUrl}
                            />
                          {/snippet}
                        </GuideLlmPromptCard>
                      </div>
                    {:else}
                      <GuideSubSectionBody>
                        <GuideParagraph
                          class="[&_code]:rounded-sm [&_code]:border [&_code]:border-black [&_code]:bg-black [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-white"
                        >
                          {@html m.guide_data_import_description({ path: dataPublicDirectory })}
                        </GuideParagraph>
                        <div class="mt-5">
                          <GuidePreviewCodeBlock
                            label={m.guide_data_import_code_label()}
                            code={geoJsonImportCode}
                            comments={geoJsonImportComments}
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
                              <GuideGeoJsonDataPreview
                                label={m.guide_data_import_preview_label({ region: selectedRegion?.label ?? '' })}
                                renderer={guideRenderer ?? 'maplibre'}
                                {openingPosition}
                                popupAppearance={selectedStyle?.appearance ?? 'light'}
                                {sampleDataUrl}
                                {styleUrl}
                                {tilejsonUrl}
                              />
                            {/snippet}
                          </GuidePreviewCodeBlock>
                        </div>
                        <GuideParagraph class="mt-5">
                          {@html m.guide_data_import_inspect()}
                        </GuideParagraph>
                      </GuideSubSectionBody>
                    {/if}
                  </div>
                {:else}
                  <GuideCallout class="mt-8" size="generous">
                    <GuideParagraph
                      >{@html m.guide_data_import_missing_preferences()}</GuideParagraph
                    >
                  </GuideCallout>
                {/if}
              </GuidePublishRequirement>
            </div>
          {/if}
        {:else if dataSource === 'llm' && llmGuidanceEnabled}
          <div class="mt-10 max-w-232">
            <GuideSubSectionHeader
              eyebrow={m.guide_setup_llm_eyebrow()}
              title={m.guide_data_llm_title()}
            />
            <div class="mt-6">
              <GuideLlmPromptCard
                prompt={llmCustomDataPrompt}
                promptIcon={selectedLlmOption?.icon}
                title={m.guide_data_llm_title()}
              />
              <div class="mt-6 space-y-3">
                <GuideParagraph>
                  {@html hosting
                    ? m.guide_data_llm_continue_publish()
                    : m.guide_data_llm_continue_refining()}
                </GuideParagraph>
                <GuideParagraph>{m.guide_data_llm_revisit()}</GuideParagraph>
              </div>
            </div>
          </div>
        {:else if dataSource === 'api' && guideRenderer && selectedStyle}
          <GuideUrbanDensityExample
            editorIcon={selectedCodeEditor?.icon}
            hasNonHongKongBasemap={Boolean(region && region !== 'hk')}
            hongKongBasemapNote={region && region !== 'hk'
              ? m.guide_data_urban_density_hong_kong_note({
                  region: selectedRegion?.label ?? '',
                })
              : undefined}
            mapReadyCode={urbanDensityMapReadyCode}
            showPublishLink={objective !== 'local'}
            mapPreviewLabel={m.guide_data_urban_density_map_preview_label({
              style: selectedStyle.name,
            })}
            mapAppearance={selectedStyle.appearance}
            renderer={guideRenderer}
            {styleUrl}
            {terminalProjectPath}
            tilejsonUrl="https://tiles.saanseoi.hk/hongkong-latest.json"
            mapCode={urbanDensityMapCode}
            mapDisplayCode={urbanDensityMapDisplayCode}
            calculationCode={urbanDensityCalculationCode}
            calculationDisplayCode={urbanDensityCalculationDisplayCode}
            geometryWorkerCode={urbanDensityGeometryWorkerCode}
            metricsCode={urbanDensityMetricsCode}
            metricsDisplayCode={urbanDensityMetricsDisplayCode}
            metricsCss={createUrbanDensityMetricsCss(selectedStyle.appearance)}
            metricsCssDisplayCode={createUrbanDensityMetricsCss(selectedStyle.appearance)}
            liveableAreaCode={urbanDensityLiveableAreaCode}
            liveableAreaCss={urbanDensityLiveableAreaCss}
            liveableAreaDisplayCode={urbanDensityLiveableAreaDisplayCode}
            liveableAreaMapCode={urbanDensityLiveableAreaMapCode}
            liveableAreaMapDisplayCode={urbanDensityLiveableAreaMapDisplayCode}
            collectNonLiveableLandCode={urbanDensityCollectNonLiveableLandCode}
            collectNonLiveableLandDisplayCode={urbanDensityCollectNonLiveableLandDisplayCode}
            setupZ14TileFetcherCode={createUrbanDensitySetupZ14TileFetcherCode(guideRenderer)}
            setupZ14TileFetcherCss={urbanDensitySetupZ14TileFetcherCss}
            setupZ14TileFetcherDisplayCode={createUrbanDensitySetupZ14TileFetcherDisplayCode(guideRenderer)}
            liveableMetricsCode={urbanDensityLiveableMetricsCode}
            liveableMetricsDisplayCode={urbanDensityLiveableMetricsDisplayCode}
            {llmGuidanceEnabled}
            llmPromptIcon={selectedLlmOption?.icon}
            llmPrompts={progressiveDataStepPrompts}
            llmReferences={llmUrbanDensityReferences}
            statsCode={urbanDensityStatsCode}
            statsDisplayCode={urbanDensityStatsDisplayCode}
            turfInstallCode={urbanDensityTurfInstallCode}
            turfInstallOutput={urbanDensityTurfInstallOutput}
          />
        {:else if dataSource === 'api' && (!renderer || !selectedStyle)}
          <GuideCallout class="mt-8" size="generous">
            <h3 class="font-display text-headline-sm font-bold text-primary">
              {@html m.guide_data_urban_density_preferences_title()}
            </h3>
            <GuideParagraph class="mt-3">
              {@html m.guide_data_urban_density_missing_preferences_intro()}
            </GuideParagraph>
            <ul
              class="mt-3 list-disc space-y-2 pl-6 font-body text-body-lg leading-8 text-foreground-alt"
            >
              {#if !renderer}
                <li>
                  <a
                    class="font-semibold text-secondary underline underline-offset-4"
                    href="#map-library"
                    onclick={event => scrollToGuideChoice(event, 'map-library')}
                  >
                    {@html m.guide_data_urban_density_missing_renderer()}
                  </a>
                </li>
              {/if}
              {#if !selectedStyle}
                <li>
                  <a
                    class="font-semibold text-secondary underline underline-offset-4"
                    href="#style-choice"
                    onclick={event => scrollToGuideChoice(event, 'style-choice')}
                  >
                    {@html m.guide_data_urban_density_missing_style()}
                  </a>
                </li>
              {/if}
            </ul>
            {#if region && region !== 'hk'}
              <GuideParagraph class="mt-4">
                {@html m.guide_data_urban_density_missing_preferences_region({
                  region: selectedRegion?.label ?? '',
                })}
              </GuideParagraph>
            {/if}
          </GuideCallout>
        {/if}
      </GuideSection>

      {#if showPublishStep}
        <GuideSection
          id="publish"
          number={7}
          showBorder={false}
          eyebrow={m.guide_setup_publish_title()}
          description={objective === 'mobile-embed'
              ? m.guide_publish_mobile_description()
              : undefined}
        >
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
                <GuideParagraph>
                  {@html m.guide_setup_mobile_other()}
                  <a
                    class="font-semibold text-secondary underline underline-offset-4"
                    href="/#community"
                    >{@html m.guide_join_community()}</a
                  >.
                </GuideParagraph>
              </GuideCallout>
            {/if}
          {:else}
            {#if hosting === 'cloudflare' || hosting === 'github-pages' || hosting === 'vercel' || hosting === 'netlify'}
              <GuideCreateAMapPublish
                {aiAccess}
                completedRequirements={completedPublishRequirements}
                {hosting}
                {llmMode}
                llmPrompt={progressiveSectionPrompts.publish}
                llmPromptIcon={selectedLlmOption?.icon}
                {operatingSystem}
                {renderer}
                {terminalProjectPath}
                onCompletedRequirementsChange={requirements =>
                  (completedPublishRequirements = requirements)}
                onAccessibleChange={accessible => (isMapAccessible = accessible)}
              />
            {:else if hosting === 'other'}
              <GuideCreateAMapPublishOther
                completedRequirements={completedPublishRequirements}
                {llmMode}
                llmPrompt={progressiveSectionPrompts.publish}
                llmPromptIcon={selectedLlmOption?.icon}
                {terminalProjectPath}
                onCompletedRequirementsChange={requirements =>
                  (completedPublishRequirements = requirements)}
                onAccessibleChange={accessible => (isMapAccessible = accessible)}
              />
            {/if}
          {/if}
        </GuideSection>
      {/if}

      {#if objective === 'web-embed' && websitePlatform && hosting}
        <GuideCreateAMapEmbed
          {hosting}
          platform={websitePlatform}
          platformLabel={selectedWebsitePlatform?.label ?? m.guide_embed_other()}
          published={isMapAccessible}
          {llmGuidanceEnabled}
          llmPromptIcon={selectedLlmOption?.icon}
        />
      {/if}

      {#if dataSource}
        <GuideSection
          id="keep-exploring"
          showBorder={false}
          title={m.guide_data_urban_density_conclusion_title()}
        >
          <div
            class="mt-3 space-y-5 [&_a]:font-semibold [&_a]:text-secondary [&_a]:underline [&_a]:underline-offset-4"
          >
            <GuideParagraph>
              {@html dataSource === 'api'
                ? isMapAccessible
                  ? m.guide_data_urban_density_conclusion_community_phewee_published()
                  : m.guide_data_urban_density_conclusion_community_phewee()
                : isMapAccessible
                  ? m.guide_data_urban_density_conclusion_community_own_data_published()
                  : m.guide_data_urban_density_conclusion_community_own_data()}
            </GuideParagraph>
            {#if dataSource === 'api'}
              <GuideParagraph>
                {@html m.guide_data_urban_density_conclusion_community_complexity()}
              </GuideParagraph>
            {/if}
            <GuideParagraph>
              {@html m.guide_data_urban_density_conclusion_community_continue()}
            </GuideParagraph>
            <GuideParagraph
              >{@html m.guide_data_urban_density_conclusion_explore()}</GuideParagraph
            >
            <nav class="flex flex-wrap gap-2" aria-label={m.guide_share_title()}>
              {#each shareLinks as link}
                <a
                  class="inline-flex size-10 items-center justify-center border border-border-card bg-background text-secondary no-underline transition-colors hover:bg-secondary-container"
                  href={link.href}
                  onclick={() => shareExternalLink(link.icon)}
                  target={link.newWindow === false ? undefined : '_blank'}
                  rel={link.newWindow === false ? undefined : 'noreferrer'}
                  aria-label={link.label}
                  title={link.label}
                >
                  <Icon icon={link.icon} class="size-4.5" aria-hidden="true" />
                </a>
              {/each}
            </nav>
          </div>
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
