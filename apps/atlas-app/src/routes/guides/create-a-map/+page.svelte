<script lang="ts">
import { page } from '$app/state'
import Icon from '@iconify/svelte'
import { onMount, tick } from 'svelte'

import codexCliTrustDirectory from '$lib/assets/guides/codex-cli-trust-directory.png'
import leafletSetupResult from '$lib/assets/guides/leaflet-setup-result.png'
import mapboxSetupResult from '$lib/assets/guides/mapbox-setup-result.png'
import maplibreSetupResult from '$lib/assets/guides/maplibre-setup-result.png'
import {
  Button,
  CreateAMap,
  GuideAgenticAiPrimer,
  GuideCallout,
  GuideChoiceGroup,
  GuideCodeBlock,
  GuideCreateAMapVersionNotice,
  GuideEditorProjectSetupSection,
  GuideEditorReadiness,
  GuideLlmReadiness,
  GuideLlmPromptSection,
  GuideMapboxTokenReadiness,
  GuideManualSetup,
  GuideMissingAnswerReminder,
  GuidePaymentWarning,
  GuidePlatformSelection,
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
  Main,
} from '$lib/bits'
import { getCurrentLocale, m } from '$lib/bits/internal/i18n'
import { scrollToElementBelowHeader } from '$lib/bits/utilities/helpers/scrollToElementBelowHeader'
import {
  createAMapStylePreviewUrl,
  createAMapTileset,
  detectOperatingSystem,
  getCreateAMapQueryChoice,
  type CreateAMapSelectionValue,
} from '$lib/guides/createAMapSelections'
import { mapStyleDefinitions } from '@repo/basemap'

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
  getAgentProjectCommand,
  getChatPricing,
  getSelectedLlmChatUrl,
  llmSetupLinks,
} from './createAMapGuideProviders'
import { createCreateAMapGuidePresentation } from './createAMapGuidePresentation'
import {
  createAMapRendererBasemapCode,
  getCreateAMapRendererReference,
} from './createAMapRendererReference'
import GuideCreateAMapAccountComplete from './guideCreateAMapAccountComplete.svelte'
import GuideCreateAMapApiKeys from './guideCreateAMapApiKeys.svelte'
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
let zedSetupExpanded = $state(page.url.searchParams.has('zed-setup'))
let zedSetupContentExpanded = $state(
  page.url.searchParams.get('zed-setup') !== 'collapsed',
)
let analyticsTrackingStarted = $state(false)
let hasBasemapApiKey = $state(page.url.searchParams.get('basemap-key-ready') === 'true')

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
  const url = new URL(page.url)
  url.searchParams.set('basemap-account', 'complete')
  return `${url.pathname}${url.search}${url.hash}`
})

const completeEditorReadiness = () => {
  completedEditorReadinessKey = editorReadinessKey
}

const completeDataStep = () => {
  if (!dataReadinessKey) return

  completedDataKey = dataReadinessKey
}

const resetDataStep = () => {
  completedDataKey = undefined
}

const completeLlmReadiness = () => {
  if (!llmReadinessKey) return
  if (!isPaymentConfirmed) {
    paymentCompletionWarning = true
    return
  }

  completedLlmReadinessKey = llmReadinessKey
  zedSetupExpanded = false
  zedSetupContentExpanded = true
}

const confirmPaymentSuccessful = () => {
  if (!llmReadinessKey) return

  completedPaymentKey = llmReadinessKey
  paymentCompletionWarning = false
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
}

const resetMapboxToken = () => {
  mapboxTokenConfigured = false
}

const openZedSetup = async () => {
  zedSetupExpanded = true
  zedSetupContentExpanded = true
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
    ? m
        .guide_agentic_ai_readiness_chat_description()
        .replace('{name}', selectedLlmReadinessName)
    : agentTool === 'other'
      ? m.guide_agentic_ai_readiness_other_agent_prompt()
      : m
          .guide_agentic_ai_readiness_agent_prompt()
          .replace('{name}', selectedLlmReadinessName),
)
const llmReadinessCompleteDescription = $derived(
  m
    .guide_agentic_ai_readiness_complete_description()
    .replace('{name}', selectedLlmReadinessName),
)
const llmReadinessDetailsDescription = $derived(
  aiAccess === 'web'
    ? m
        .guide_agentic_ai_readiness_chat_description()
        .replace('{name}', selectedLlmReadinessName)
    : m
        .guide_agentic_ai_readiness_description()
        .replace('{name}', selectedLlmReadinessName),
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
      value: 'existing',
      icon: 'proicons:database',
      label: m.guide_data_existing(),
      description: m.guide_data_existing_description(),
    },
    {
      value: 'api',
      icon: 'proicons:api',
      label: m.guide_data_api(),
      description: m.guide_data_api_description(),
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
  if (value === 'handover') llmDialogOpen = true
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

  copiedPromptProvider = provider
  copyPromptFailed = false

  try {
    await navigator.clipboard.writeText(prompt)
  } catch {
    copyPromptFailed = true
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
}

const copyAgenticHandoverPrompt = async () => {
  copiedPromptProvider = 'local'
  copyPromptFailed = false

  try {
    await navigator.clipboard.writeText(agenticHandoverPrompt)
    handoverAgentPromptCopied = true
    window.setTimeout(() => (handoverAgentPromptCopied = false), 1600)
  } catch {
    copyPromptFailed = true
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
    window.setTimeout(() => (guideLinkCopied = false), 1600)
  } catch {
    guideLinkCopyFailed = true
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
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      await copyGuideLink()
    }
  }
}

const shareLinks = $derived.by(() => {
  locale
  const url = encodeURIComponent(guideUrl)
  const text = encodeURIComponent(m.guide_share_description())

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
  return (
    copyPromptFailed ? m.guide_llm_copy_failed() : m.guide_llm_paste_prompt()
  ).replace('{name}', name)
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
    label: m
      .guide_code_editor_readiness_download()
      .replace('{name}', editorDetails.name),
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
      ? m
          .guide_code_editor_readiness_description()
          .replace('{name}', selectedCodeEditor.label)
      : '',
)
const editorReadinessCompleteDescription = $derived(
  codeEditor === 'other'
    ? m.guide_code_editor_readiness_complete_other_description()
    : selectedCodeEditor
      ? m
          .guide_code_editor_readiness_complete_description()
          .replace('{name}', selectedCodeEditor.label)
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

const hostingInstallCode = $derived.by(() => {
  const command =
    hosting === 'cloudflare'
      ? 'bun add -d wrangler'
      : hosting === 'github-pages'
        ? 'bun add -d gh-pages'
        : hosting === 'vercel'
          ? 'bun add -d vercel'
          : hosting === 'netlify'
            ? 'bun add -d netlify-cli'
            : undefined

  return command ?? ''
})
const unixViteCreateCommand = String.raw`printf '\033[B\033[B\r' | bun create vite . --template vanilla-ts --no-immediate --interactive`
const setupCode = $derived(
  (operatingSystem === 'windows'
    ? ['mkdir saanseoi-project', 'cd saanseoi-project']
    : ['mkdir saanseoi-project', 'cd saanseoi-project']
  )
    .concat([
      '# If prompted that the directory is not empty, choose “Ignore files and continue”.',
      ...(operatingSystem === 'windows'
        ? ['bun create vite . --template vanilla-ts --no-immediate']
        : [
            '# This selects “Ignore files and continue” if Vite shows that prompt.',
            unixViteCreateCommand,
          ]),
      'bun install',
    ])
    .join('\n'),
)
const hostingInstallExplanation = $derived(
  m
    .guide_setup_install_hosting_tool_explanation()
    .replace('{host}', selectedHosting?.label ?? ''),
)
const bunInstallExplanation = $derived(
  `${m.guide_setup_install_bun_explanation()}${terminalExperience === 'basic' ? ` ${m.guide_setup_install_bun_alternative_toolchain()}` : ''}`,
)
const setupStartStepNumber = $derived(hostingInstallCode ? 4 : 3)
const setupContinueStepNumber = $derived(hostingInstallCode ? 5 : 4)
const restartProjectCode = $derived(
  operatingSystem === 'windows'
    ? 'cd saanseoi-project\nbun dev'
    : 'cd saanseoi-project && bun dev',
)
const agentProjectCommand = $derived(getAgentProjectCommand(agentTool))
const viteReadyOutput = [
  'VITE v8.2.1  ready in 58 ms',
  '',
  '➜  Local:   http://localhost:5173/',
  '➜  Network: use --host to expose',
  '➜  press h + enter to show help',
].join('\n')
const stopServerModifier = $derived(operatingSystem === 'macos' ? 'Control' : 'Ctrl')
const bunInstallCode = $derived(
  operatingSystem === 'windows'
    ? 'irm bun.sh/install.ps1 | iex'
    : 'curl -fsSL https://bun.sh/install | bash',
)
const notebookSetupCode = $derived(
  operatingSystem === 'windows'
    ? [
        'py -m venv .venv',
        '.venv\\Scripts\\Activate.ps1',
        `py -m pip install jupyterlab ${notebookLibrary === 'maplibre-jupyter' ? 'maplibre' : 'folium'}`,
        'jupyter lab',
      ].join('\n')
    : [
        'python3 -m venv .venv',
        'source .venv/bin/activate',
        `python -m pip install jupyterlab ${notebookLibrary === 'maplibre-jupyter' ? 'maplibre' : 'folium'}`,
        'jupyter lab',
      ].join('\n'),
)
const deploymentCode = $derived(
  hosting === 'cloudflare'
    ? [
        'bun run build',
        'bunx wrangler login',
        'bunx wrangler deploy --assets=dist',
      ].join('\n')
    : hosting === 'github-pages'
      ? [
          'bun run build',
          '# For a project site, set Vite’s base path before building. See the guide below.',
          'bunx gh-pages -d dist',
        ].join('\n')
      : hosting === 'vercel'
        ? ['bun run build', 'bunx vercel --prod'].join('\n')
        : hosting === 'netlify'
          ? ['bunx netlify deploy --build --prod'].join('\n')
          : [
              'bun run build',
              '# Publish the contents of dist/ with your hosting provider.',
            ].join('\n'),
)
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
const iframeCode = [
  '<iframe',
  '  src="https://your-map.example"',
  '  title="My SaanSeoi map"',
  '  width="100%"',
  '  height="600"',
  '  loading="lazy"',
  '></iframe>',
].join('\n')
const notebookCode = $derived(
  notebookLibrary === 'maplibre-jupyter'
    ? [
        'from maplibre import Map, MapOptions',
        '',
        'map_view = Map(MapOptions(center=(114.1694, 22.3193), zoom=11))',
        "map_view.save('map.html', preview=True)",
      ].join('\n')
    : [
        'import folium',
        '',
        'map_view = folium.Map(location=[22.3193, 114.1694], zoom_start=11)',
        'map_view',
      ].join('\n'),
)
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
    ? { name: 'maplibre-gl', pinnedVersion: '6.3.0' }
    : renderer === 'mapbox'
      ? { name: 'mapbox-gl', pinnedVersion: '3.28.1' }
      : { name: 'leaflet', pinnedVersion: '1.9.4' },
)
const rendererTerminalReminder = $derived(
  (operatingSystem === 'windows'
    ? m.guide_renderer_terminal_reminder_windows()
    : m.guide_renderer_terminal_reminder_unix()
  ).replace(
    '{command}',
    operatingSystem === 'windows'
      ? 'Set-Location ~/saanseoi-project'
      : 'cd ~/saanseoi-project',
  ),
)
const rendererEditorPath = 'src/main.ts'
const rendererStylesheetPath = 'src/style.css'
const mapboxTokenCode =
  'bun -e \'import { createInterface } from "node:readline/promises"; const rl=createInterface({input:process.stdin,output:process.stdout}); const token=await rl.question("Paste your public Mapbox token: "); rl.close(); await Bun.write(".env","VITE_MAPBOX_TOKEN="+token.trim()+"\\n")\''
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
const basemapCode = $derived(
  renderer === 'maplibre' || renderer === 'mapbox' || renderer === 'leaflet'
    ? createAMapRendererBasemapCode(renderer, styleUrl, tilejsonUrl)
    : '',
)
const rendererEditorInstruction = $derived(
  m
    .guide_renderer_editor_instruction()
    .replace(
      '{editor}',
      selectedCodeEditor?.label ?? m.guide_setup_editor_your_editor(),
    )
    .replace('{path}', rendererEditorPath),
)
const styleEditCode = $derived(
  [
    '// Before: the style declaration from the basemap step',
    "// const style = await fetch('<existing style URL>').then(response => response.json())",
    '',
    '// After: the selected SaanSeoi style',
    `const style = await fetch('${styleUrl}').then(response => response.json())`,
  ].join('\n'),
)
const styleEditorInstruction = $derived(
  m
    .guide_style_editor_instruction()
    .replace(
      '{editor}',
      selectedCodeEditor?.label ?? m.guide_setup_editor_your_editor(),
    )
    .replace('{path}', rendererEditorPath),
)
const rendererStylesheetInstruction = $derived(
  m.guide_renderer_stylesheet_instruction().replace('{path}', rendererStylesheetPath),
)
const urbanDensityInstallCode = $derived(
  'bun add @turf/area @turf/helpers @turf/intersect @turf/union',
)
const urbanDensityInputsCode = [
  'public/data/districts.geojson',
  '// Polygon or MultiPolygon features with: properties.districtCode',
  '// Use the SaanSeoi district source release and retain its release code in your README.',
  '',
  'public/data/population.geojson',
  '// One feature for each district with: properties.districtCode and',
  '// properties.midYearPopulation. Use one pinned C&SD reference year.',
  '',
  'public/data/landuse.geojson',
  '// Unclipped Polygon or MultiPolygon features with: properties.kind',
  '// Export the land-use source behind the SaanSeoi basemap, not vector tiles.',
].join('\n')
const urbanDensityCalculateCode = [
  "import area from '@turf/area'",
  "import { featureCollection } from '@turf/helpers'",
  "import intersect from '@turf/intersect'",
  "import union from '@turf/union'",
  '',
  "const districts = await Bun.file('public/data/districts.geojson').json()",
  "const population = await Bun.file('public/data/population.geojson').json()",
  "const landuse = await Bun.file('public/data/landuse.geojson').json()",
  '',
  'const regions = {',
  "  'Hong Kong': ['CW', 'EST', 'ILD', 'STH', 'WC'],",
  "  Kowloon: ['KLC', 'KC', 'KT', 'SSP', 'WTS', 'YTM'],",
  "  'New Territories': ['NTH', 'SK', 'ST', 'TP', 'TW', 'TM', 'YL'],",
  '} as const',
  '',
  "const urbanKinds = new Set(['commercial', 'industrial', 'residential', 'retail'])",
  'const populationByDistrict = new Map(',
  '  population.features.map(feature => [',
  '    feature.properties.districtCode,',
  '    feature.properties.midYearPopulation,',
  '  ]),',
  ')',
  '',
  'const rows = []',
  'const urbanAreas = []',
  '',
  'for (const [name, districtCodes] of Object.entries(regions)) {',
  '  const pieces = districts.features.flatMap(district => {',
  '    if (!districtCodes.includes(district.properties.districtCode)) return []',
  '    return landuse.features.flatMap(land => {',
  '      if (!urbanKinds.has(land.properties.kind)) return []',
  '      const clipped = intersect(featureCollection([district, land]))',
  '      return clipped ? [clipped] : []',
  '    })',
  '  })',
  '',
  '  const urbanArea = union(featureCollection(pieces))',
  `  if (!urbanArea) throw new Error(\`No urban land found for \${name}.\`)`,
  '  const urbanLandSqKm = area(urbanArea) / 1_000_000',
  '  const midYearPopulation = districtCodes.reduce(',
  '    (sum, code) => sum + Number(populationByDistrict.get(code) ?? 0),',
  '    0,',
  '  )',
  '',
  '  rows.push({',
  '    name,',
  '    urbanLandSqKm,',
  '    midYearPopulation,',
  '    peoplePerSqKm: midYearPopulation / urbanLandSqKm,',
  '  })',
  '  urbanAreas.push({ ...urbanArea, properties: { name } })',
  '}',
].join('\n')
const urbanDensityWriteCode = [
  "await Bun.write('public/data/urban-density.json', JSON.stringify(rows, null, 2))",
  'await Bun.write(',
  "  'public/data/urban-land.geojson',",
  '  JSON.stringify(featureCollection(urbanAreas)),',
  ')',
].join('\n')
const urbanDensityMapCode = [
  "const urbanLand = await fetch('/data/urban-land.geojson').then(response => response.json())",
  "const metrics = await fetch('/data/urban-density.json').then(response => response.json())",
  '',
  "map.addSource('urban-land', { type: 'geojson', data: urbanLand })",
  'map.addLayer({',
  "  id: 'urban-land-fill',",
  "  type: 'fill',",
  "  source: 'urban-land',",
  "  paint: { 'fill-color': '#d65332', 'fill-opacity': 0.38 },",
  '})',
  'map.addLayer({',
  "  id: 'urban-land-outline',",
  "  type: 'line',",
  "  source: 'urban-land',",
  "  paint: { 'line-color': '#732f20', 'line-width': 1.5 },",
  '})',
].join('\n')
const urbanDensityMetricsCode = [
  "const metricBar = document.createElement('section')",
  "metricBar.id = 'urban-density-metrics'",
  "metricBar.setAttribute('aria-label', 'Urban population density')",
  'metricBar.innerHTML = metrics.map(metric => `',
  '  <article>',
  `    <p>\${metric.name}</p>`,
  `    <strong>\${Math.round(metric.peoplePerSqKm).toLocaleString()}</strong>`,
  `    <span>people per km² · \${metric.urbanLandSqKm.toFixed(1)} km² urban land</span>`,
  '  </article>',
  "`).join('')",
  'document.body.append(metricBar)',
].join('\n')
const urbanDensityMetricsCss = [
  '#urban-density-metrics {',
  '  position: fixed; inset: auto 1.5rem 1.5rem; z-index: 1;',
  '  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px;',
  '  background: #26433d; box-shadow: 0 12px 32px rgb(0 0 0 / 24%);',
  '}',
  '#urban-density-metrics article { padding: 1rem 1.25rem; background: #fff9ed; }',
  '#urban-density-metrics p, #urban-density-metrics span { margin: 0; display: block; }',
  '#urban-density-metrics strong { display: block; margin: .25rem 0; font-size: 2rem; }',
  '@media (max-width: 640px) {',
  '  #urban-density-metrics { grid-template-columns: 1fr; inset: auto 1rem 1rem; }',
  '}',
].join('\n')

const selectedStylePreview = (styleId: string) =>
  createAMapStylePreviewUrl(styleId, region, tileset)
const styleChoices = $derived.by(() =>
  [
    ...mapStyleDefinitions.map(candidate => candidate.id),
    {
      value: 'custom',
      label: m.guide_style_custom(),
      description: m.guide_style_custom_choice_description(),
      imageSlices: mapStyleDefinitions.map(candidate =>
        selectedStylePreview(candidate.id),
      ),
    },
  ].map(choice => {
    if (typeof choice === 'string') {
      const definition = mapStyleDefinitions.find(candidate => candidate.id === choice)

      return {
        value: choice,
        label: definition?.name ?? choice,
        description: '',
        image: selectedStylePreview(choice),
      }
    }

    return choice
  }),
)
</script>

<svelte:head>
  <title>{m.guide_create_map_title()} | SaanSeoi</title>
  <meta name="description" content={m.guide_create_map_meta_description()}>
  <meta name="author" content="Mart van de Ven">
  <meta name="date" content="2026-08-08">
  <meta name="version" content="v1">
  <meta property="article:author" content="https://type.hk">
  <meta property="article:published_time" content="2026-08-08">
  <link rel="author" href="https://type.hk">
</svelte:head>

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
      onOpenHandover={() => (llmDialogOpen = true)}
      onShareGuide={shareGuide}
      {shareLinks}
    />
  </section>

  <div class="mt-14">
    <GuideRoot
      {outline}
      decisions={guideDecisions}
      decisionsLabel={m.guide_decisions_title()}
      tocLabel={m.guide_toc()}
    >
      <GuideSection
        id="prerequisites"
        number={0}
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
                    hint={m.guide_vpn_access_hint().replace('{region}', visitorRegionLabel ?? '')}
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
                    <div id="terminal-introduction" class="mt-6 scroll-mt-28">
                      <GuideTerminalIntroduction {operatingSystem} />
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
                        class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt"
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
                          class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt"
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
                        class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt"
                      >
                        {@html m.guide_setup_agent_codex_app_instruction()}
                      </p>
                    {:else if agentTool === 'claude-cowork'}
                      <p
                        class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt"
                      >
                        {@html m.guide_setup_agent_claude_cowork_instruction()}
                      </p>
                    {:else}
                      <p
                        class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt"
                      >
                        {@html m.guide_setup_agent_other_instruction()}
                      </p>
                    {/if}
                    {#if agentModelSelectionInstruction}
                      <p
                        class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt"
                      >
                        {@html agentModelSelectionInstruction}
                      </p>
                    {/if}
                  </div>
                {/if}
                {#if aiAccess === 'agentic'}
                  {#if agentTool === 'zed'}
                    <p
                      class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt"
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
                      class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt"
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
        </div>
      </GuideSection>

      <GuideSection id="render" number={1} eyebrow={m.guide_render_eyebrow()}>
        <p class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
          {@html m.guide_render_description_before()}
          <GuideReference
            href={`saanseoi:${locale.toLowerCase()}:definition/render/v1`}
            label={m.guide_render_description_link()}
          />{@html m.guide_render_description_after()}
        </p>
        <p class="mt-3 max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
          {@html m.guide_render_project_description_before()}
          <GuideReference
            href={`saanseoi:${locale.toLowerCase()}:note/vite/v1`}
            label={m.reference_vite()}
          />{@html m.guide_render_project_description_after()}
        </p>
        <p
          class="mt-3 max-w-3xl font-body text-body-md leading-7 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-secondary/65 [&_code]:bg-secondary-container/12 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:font-semibold [&_code]:text-secondary"
        >
          {@html m.guide_render_script_tag_note()}
        </p>
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
              noticeLabel={m.guide_renderer_version_notice_label()}
              versionDescription={m.guide_renderer_version_description()}
              minorDifference={m.guide_renderer_version_minor_difference()}
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
              />
            {/if}
            {#if renderer !== 'mapbox' || mapboxTokenConfigured}
              {#if !llmGuidanceEnabled}
                <div class="border-t border-border-card pt-10">
                  <GuideSubSectionHeader
                    eyebrow={m.guide_renderer_prompt_none_eyebrow()}
                    title={m
                      .guide_renderer_package_title()
                      .replace('{library}', selectedRenderer?.label ?? '')}
                  />
                  <p
                    class="mt-3 max-w-3xl font-body text-body-md leading-7 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
                  >
                    {@html rendererTerminalReminder}
                  </p>
                  <div class="mt-6 max-w-2xl">
                    <GuideCodeBlock
                      label={m.guide_renderer_install()}
                      code={rendererInstallCode}
                      language={operatingSystem === 'windows' ? 'powershell' : 'bash'}
                      copyLabel={m.common_copy()}
                      copiedLabel={m.common_copied()}
                    />
                  </div>
                </div>
                <div>
                  <GuideSubSectionHeader
                    eyebrow={rendererCodeLabel}
                    title={m
                      .guide_renderer_code_title()
                      .replace('{library}', selectedRenderer?.label ?? '')}
                  />
                  <div class="mt-6 max-w-2xl">
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
                  <p
                    class="mt-4 max-w-3xl font-body text-body-md leading-7 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
                  >
                    {@html rendererEditorInstruction}
                  </p>
                </div>
                <div>
                  <GuideSubSectionHeader
                    eyebrow={m.guide_renderer_css_code()}
                    title={m.guide_renderer_reset_styles_title()}
                  />
                  <div class="mt-6 max-w-2xl">
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
                  <p
                    class="mt-4 max-w-3xl font-body text-body-md leading-7 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
                  >
                    {@html rendererStylesheetInstruction}
                  </p>
                  {#if renderer === 'maplibre' || renderer === 'mapbox' || renderer === 'leaflet'}
                    <div class="mt-5 max-w-3xl">
                      <GuideScreenshot
                        src={renderer === 'maplibre'
                          ? maplibreSetupResult
                          : renderer === 'mapbox'
                            ? mapboxSetupResult
                            : leafletSetupResult}
                        alt={renderer === 'maplibre'
                            ? m.guide_renderer_maplibre_setup_screenshot_alt()
                            : renderer === 'mapbox'
                              ? m.guide_renderer_mapbox_setup_screenshot_alt()
                              : m.guide_renderer_leaflet_setup_screenshot_alt()}
                      />
                    </div>
                  {/if}
                  <p
                    class="mt-3 max-w-3xl font-body text-body-md leading-7 text-foreground-alt"
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
                        href="/community"
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
              <p class="font-body text-body-md leading-7 text-foreground-alt">
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
              title={m
                .guide_renderer_setup_title()
                .replace('{library}', selectedMapLibrary.label)}
            />
          {/if}
        </div>
      </GuideSection>

      <GuideSection id="basemap" number={2} eyebrow={m.guide_basemap_eyebrow()}>
        <p class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
          {@html m.guide_basemap_description_before()}
          <GuideReference
            href={`saanseoi:${locale.toLowerCase()}:note/basemap/v1`}
            label={m.reference_basemap()}
          />{@html m.guide_basemap_description_after()}
        </p>
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
            />
            <GuideCreateAMapApiKeys
              apiKeyReady={hasBasemapApiKey}
              onApiKeyReadyChange={ready => (hasBasemapApiKey = ready)}
              showHeading={false}
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
                  <GuideCodeBlock
                    label={rendererEditorPath}
                    code={basemapCode}
                    editorIcon={selectedCodeEditor?.icon}
                    copyLabel={m.common_copy()}
                    copiedLabel={m.common_copied()}
                    language="typescript"
                    variant="editor"
                  />
                  <p class="font-body text-body-md leading-7 text-foreground-alt">
                    {@html m
                      .guide_basemap_editor_restart()
                      .replace('{region}', selectedRegion?.label ?? m.guide_basemap_hk())}
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

      <GuideSection id="style" number={3} eyebrow={m.guide_style_eyebrow()}>
        <p class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
          {@html m.guide_style_description()}
        </p>
        <a
          class="mt-4 inline-flex font-body text-label-md font-semibold text-secondary underline underline-offset-4"
          href="/themes"
          >{@html m.guide_style_gallery()}</a
        >
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
            variant="illustrated"
          />
        </div>
        {#if style === 'custom'}
          <GuideCallout class="mt-6" size="generous">
            <h3 class="font-display text-headline-sm font-bold text-primary">
              {@html m.guide_style_custom_title()}
            </h3>
            <p class="mt-3 font-body text-body-md leading-7 text-foreground-alt">
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
          <div class="mt-10 max-w-3xl border-t border-border-card pt-10">
            <GuideSubSectionHeader
              eyebrow={m.guide_basemap_editor_eyebrow()}
              title={m
                .guide_style_editor_title()
                .replace('{library}', selectedRenderer?.label ?? '')}
            />
            <GuideSubSectionBody>
              <GuideCodeBlock
                label={rendererEditorPath}
                code={styleEditCode}
                editorIcon={selectedCodeEditor?.icon}
                language="typescript"
                variant="editor"
                copyLabel={m.common_copy()}
                copiedLabel={m.common_copied()}
              />
              <p
                class="font-body text-body-md leading-7 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
              >
                {@html styleEditorInstruction}
              </p>
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
            title={m.guide_renderer_setup_title().replace(
              '{library}',
              selectedMapLibrary?.label ?? '',
            )}
          />
        {/if}
      </GuideSection>

      <GuideSection
        id="data"
        number={4}
        eyebrow={m.guide_data_eyebrow()}
        title={m.guide_data_title()}
        description={m.guide_data_description()}
      >
        <div id="project-data" class="scroll-mt-28">
          <GuideChoiceGroup
            label={m.guide_data_label()}
            choices={dataChoices}
            bind:value={dataSource}
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
        {:else if dataSource === 'api'}
          <GuideUrbanDensityExample
            calculateCode={urbanDensityCalculateCode}
            inputsCode={urbanDensityInputsCode}
            installCode={urbanDensityInstallCode}
            mapCode={urbanDensityMapCode}
            metricsCode={urbanDensityMetricsCode}
            metricsCss={urbanDensityMetricsCss}
            {operatingSystem}
            writeCode={urbanDensityWriteCode}
          />
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
                  class="mt-2 max-w-3xl font-body text-body-md leading-7 text-foreground-alt"
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
          number={5}
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
                    href="/community"
                    >{@html m.guide_join_community()}</a
                  >.
                </p>
              </GuideCallout>
            {/if}
          {:else}
            <GuideCodeBlock
              label={m.guide_setup_publish_code()}
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
                <p class="mt-3 font-body text-body-md leading-7 text-foreground-alt">
                  {@html m.guide_setup_embed_description().replace(
                      '{provider}',
                      selectedWebsitePlatform?.label ?? '',
                    )}
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
