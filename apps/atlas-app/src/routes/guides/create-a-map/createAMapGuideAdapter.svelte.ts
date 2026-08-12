import { goto } from '$app/navigation'

import type {
  CreateAMapSelection,
  CreateAMapSelectionQuery,
} from '$lib/guides/createAMapSelections'

import { trackCreateAMapSelection } from './analytics.remote'

type CreateAMapGuideUrlState = CreateAMapSelectionQuery & {
  agenticAiPrimerExpanded: boolean
  basemapApiKeyReady: boolean
  completedDataKey?: string
  completedEditorReadinessKey?: string
  completedLlmReadinessKey?: string
  completedPaymentKey?: string
  mapboxTokenConfigured: boolean
  zedSetupContentExpanded: boolean
  zedSetupExpanded: boolean
}

type Props = {
  getAnalyticsTrackingStarted: () => boolean
  getCurrentUrl: () => URL
  getSelection: () => CreateAMapSelectionQuery
  getUrlState: () => CreateAMapGuideUrlState
}

/**
 * Keeps the create-a-map route's external contracts in one place.
 *
 * The page remains the owner of controlled selection state. This adapter owns
 * the side effects that derive from it: URL persistence and analytics.
 */
export function createCreateAMapGuideAdapter({
  getAnalyticsTrackingStarted,
  getCurrentUrl,
  getSelection,
  getUrlState,
}: Props) {
  $effect(() => {
    const currentUrl = getCurrentUrl()
    const url = new URL(currentUrl)
    const state = getUrlState()
    const query: Record<string, string | undefined> = {
      objective: state.objective,
      os: state.operatingSystem,
      terminal: state.terminalExperience,
      editor: state.codeEditor,
      'llm-mode': state.llmMode,
      'ai-access': state.aiAccess,
      'vpn-access': state.vpnAccess,
      'agent-tool': state.agentTool,
      llm: state.llm,
      hosting: state.hosting,
      website: state.websitePlatform,
      'mobile-library': state.mobileLibrary,
      'mobile-platform': state.mobilePlatform,
      'notebook-library': state.notebookLibrary,
      'notebook-runtime': state.notebookRuntime,
      renderer: state.renderer,
      region: state.region,
      style: state.style,
      data: state.dataSource,
      'basemap-key-ready': state.basemapApiKeyReady ? 'true' : undefined,
      'data-ready': state.completedDataKey,
      'editor-ready': state.completedEditorReadinessKey,
      'llm-ready': state.completedLlmReadinessKey,
      'payment-ready': state.completedPaymentKey,
      'mapbox-token-ready': state.mapboxTokenConfigured ? 'true' : undefined,
      'ai-primer': state.agenticAiPrimerExpanded ? undefined : 'collapsed',
      'zed-setup': state.zedSetupExpanded
        ? state.zedSetupContentExpanded
          ? 'open'
          : 'collapsed'
        : undefined,
    }

    for (const [key, value] of Object.entries(query)) {
      if (value) url.searchParams.set(key, value)
      else url.searchParams.delete(key)
    }

    const target = `${url.pathname}${url.search}${url.hash}`
    if (target !== `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`) {
      void goto(target, { keepFocus: true, noScroll: true, replaceState: true })
    }
  })

  $effect(() => {
    const selection = getSelection()
    const { llmMode, objective } = selection
    if (!getAnalyticsTrackingStarted() || !objective || !llmMode) return

    const trackedSelection: Pick<CreateAMapSelection, 'llmMode' | 'objective'> &
      CreateAMapSelectionQuery = {
      ...selection,
      llmMode,
      objective,
    }
    const timeout = window.setTimeout(() => {
      void trackCreateAMapSelection(trackedSelection).catch(() => {})
    }, 750)

    return () => window.clearTimeout(timeout)
  })
}
