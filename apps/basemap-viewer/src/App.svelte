<script lang="ts">
import { Tooltip } from 'bits-ui'
import { fly } from 'svelte/transition'
import type { Readable } from 'svelte/store'
import { i18n } from './lib/bits/pages/basemapViewer/i18n'
import { orderComparisonReleases } from './lib/release-order'
import * as ViewerDiagnostics from './lib/bits/components/panels/viewerDiagnostics'
import * as ViewerDiff from './lib/bits/components/panels/viewerDiff'
import * as ViewerFeatureInspection from './lib/bits/components/panels/viewerFeatureInspection'
import * as ViewerHeader from './lib/bits/components/viewerHeader'
import * as ViewerStatus from './lib/bits/components/viewerStatus'
import { setAppState, type Callbacks, type ViewerUiState } from './lib/ctx/app'
import type { AppState } from './lib/types'

let {
  callbacks,
  state: viewerState,
  ui,
}: {
  callbacks: Callbacks
  state: Readable<AppState>
  ui: Readable<ViewerUiState>
} = $props()

const stateContext: Readable<AppState> = {
  subscribe(run) {
    return viewerState.subscribe(run)
  },
}
setAppState(stateContext)

const appState = stateContext
const text = $derived(i18n[$appState.locale])
const comparisonOrder = $derived.by(() =>
  $appState.comparisonVersion
    ? orderComparisonReleases(
        $appState.version,
        $appState.comparisonVersion,
        $ui.versions,
      )
    : null,
)
let compact = $state(false)
let mobileMenuOpen = $state(false)
let mobileMenuDirty = $state(false)
let mobileMenuSnapshot = $state<string | null>(null)
let diffPanelOpen = $state(true)
let mobilePanelShortcut = $state<'diff' | 'diagnostics' | 'inspection' | null>(null)
let mobilePanelHeight = $state(0)

function reportMobilePanelHeight(node: HTMLElement): { destroy: () => void } {
  const update = () => {
    mobilePanelHeight = compact ? node.getBoundingClientRect().height : 0
  }
  const observer = new ResizeObserver(update)
  observer.observe(node)
  update()

  return {
    destroy() {
      observer.disconnect()
      mobilePanelHeight = 0
    },
  }
}

function openDiagnostics(open: boolean): void {
  if (open) {
    callbacks.onInspect(false)
    if (compact) diffPanelOpen = false
    mobilePanelShortcut = 'diagnostics'
  } else if (mobilePanelShortcut === 'diagnostics') {
    mobilePanelShortcut = null
  }
  callbacks.onDiagnostics(open)
}

function openInspection(open: boolean): void {
  if (open) {
    callbacks.onDiagnostics(false)
    if (compact) diffPanelOpen = false
    mobilePanelShortcut = 'inspection'
  } else if (mobilePanelShortcut === 'inspection') {
    mobilePanelShortcut = null
  }
  callbacks.onInspect(open)
}

function selectComparisonMode(mode: AppState['comparisonMode']): void {
  if (mode === 'diff') {
    if (compact) {
      callbacks.onDiagnostics(false)
      callbacks.onInspect(false)
    }
    diffPanelOpen = true
    mobilePanelShortcut = 'diff'
  } else {
    mobilePanelShortcut = null
  }
  callbacks.onComparisonMode(mode)
}

function selectComparisonVersion(version: string | null): void {
  if (version === null) {
    diffPanelOpen = false
    mobilePanelShortcut = null
  }
  callbacks.onComparisonVersion(version)
}

const panelCallbacks = $derived<Callbacks>({
  ...callbacks,
  onComparisonVersion: selectComparisonVersion,
  onComparisonMode: selectComparisonMode,
  onDiagnostics: openDiagnostics,
  onInspect: openInspection,
})
const mobileMenuFingerprint = $derived.by(() =>
  JSON.stringify({
    comparisonMode: $appState.comparisonMode,
    comparisonVersion: $appState.comparisonVersion,
    diagnosticsOpen: $ui.diagnostics.open,
    diffVisibility: $appState.diffVisibility,
    features: $appState.features,
    inspectionOpen: $ui.diagnostics.inspect,
    labels: $appState.labels,
    locale: $appState.locale,
    regionCode: $appState.regionCode,
    theme: $appState.theme,
    version: $appState.version,
  }),
)

$effect(() => {
  if (!mobileMenuOpen || mobileMenuSnapshot === null) return
  mobileMenuDirty = mobileMenuFingerprint !== mobileMenuSnapshot
})

const mobileCallbacks = $derived(panelCallbacks)

function toggleMobileMenu(): void {
  if (mobileMenuOpen) {
    mobileMenuOpen = false
    mobileMenuDirty = false
    mobileMenuSnapshot = null
    return
  }
  mobileMenuSnapshot = mobileMenuFingerprint
  mobileMenuDirty = false
  mobileMenuOpen = true
}
const mobilePanel = $derived(
  mobilePanelShortcut ??
    ($appState.comparisonVersion && $appState.comparisonMode === 'diff'
      ? 'diff'
      : null),
)
const mobilePanelOpen = $derived(
  mobilePanel === 'diff'
    ? $appState.comparisonVersion !== null &&
        $appState.comparisonMode === 'diff' &&
        diffPanelOpen
    : mobilePanel === 'diagnostics'
      ? $ui.diagnostics.open
      : mobilePanel === 'inspection'
        ? $ui.diagnostics.inspect
        : false,
)
const mobileMenuPanel = $derived(
  mobilePanel === 'diagnostics' || mobilePanel === 'inspection' ? mobilePanel : null,
)

function selectMobilePanel(panel: 'diff' | 'diagnostics' | 'inspection'): void {
  if (panel === 'diff') {
    callbacks.onDiagnostics(false)
    callbacks.onInspect(false)
    diffPanelOpen = !diffPanelOpen
    return
  }
  if (panel === 'diagnostics') openDiagnostics(!$ui.diagnostics.open)
  else openInspection(!$ui.diagnostics.inspect)
}
</script>

<div
  id="map"
  aria-label="山水 | SaanSeoi basemap release map"
  data-comparison-active={$appState.comparisonVersion !== null}
  data-comparison-mode={$appState.comparisonMode}
  data-diff-release={comparisonOrder?.newest === 'primary' ? 'newest' : 'oldest'}
  data-map-theme={$appState.theme}
  role="application"
></div>

<div
  id="comparison-map"
  aria-hidden={$appState.comparisonVersion === null}
  aria-label={text.comparisonMapLabel}
  class:hidden={$appState.comparisonVersion === null}
  data-comparison-mode={$appState.comparisonMode}
  data-diff-release={comparisonOrder?.newest === 'comparison' ? 'newest' : 'oldest'}
  data-map-theme={$appState.theme}
  role="application"
></div>

<Tooltip.Provider>
  <ViewerHeader.Root
    bind:compact
    comparisonActive={$appState.comparisonVersion !== null}
    theme={$appState.theme}
  >
    <ViewerHeader.Controls callbacks={panelCallbacks} state={viewerState} {text} {ui} />
    <ViewerHeader.Actions callbacks={panelCallbacks} state={viewerState} {text} {ui} />
  </ViewerHeader.Root>

  {#if compact && mobileMenuOpen}
    <ViewerHeader.MobileMenu
      callbacks={mobileCallbacks}
      selectedPanel={mobileMenuPanel}
      state={viewerState}
      {text}
      {ui}
    />
  {/if}

  <ViewerStatus.Root
    callbacks={panelCallbacks}
    {compact}
    dismissLabel={text.dismissNotice}
    latest={text.latest}
    notice={$ui.notice}
    noticeId={$ui.noticeId}
    panelOpen={($appState.comparisonVersion !== null &&
        $appState.comparisonMode === 'diff' &&
        diffPanelOpen) ||
      $ui.diagnostics.open ||
      $ui.diagnostics.inspect}
    panelHeight={mobilePanelHeight}
    state={viewerState}
    suppressNotice={$ui.diagnostics.open}
    versions={$ui.versions}
  />
  {#if !compact}
    <ViewerDiff.Panel
      callbacks={panelCallbacks}
      open={diffPanelOpen}
      state={viewerState}
      {text}
      {ui}
    />
  {/if}
  {#if !compact && $ui.diagnostics.open}
    <div
      use:reportMobilePanelHeight
      in:fly={{ x: compact ? 0 : 24, y: compact ? -120 : 0, duration: 180 }}
      out:fly={{ x: compact ? 0 : 24, y: compact ? -120 : 0, duration: 160 }}
      class={`fixed top-[calc(var(--header-height)+10px)] right-2.5 z-20 w-[min(390px,calc(100vw-20px))] max-h-[calc(100vh-var(--header-height)-20px)] overflow-y-auto ${compact ? '!top-0 !right-0 !bottom-auto !w-full !max-h-[50dvh] rounded-none [&>aside]:rounded-none [&>aside]:border-x-0' : ''}`}
    >
      <ViewerDiagnostics.Panel
        callbacks={panelCallbacks}
        dismissLabel={text.dismissNotice}
        notice={$ui.notice}
        state={viewerState}
        {text}
        {ui}
      />
    </div>
  {/if}
  {#if !compact && $ui.diagnostics.inspect}
    <div
      use:reportMobilePanelHeight
      in:fly={{ x: compact ? 0 : 24, y: compact ? -120 : 0, duration: 180 }}
      out:fly={{ x: compact ? 0 : 24, y: compact ? -120 : 0, duration: 160 }}
      class={`fixed top-[calc(var(--header-height)+10px)] right-2.5 z-20 w-[min(390px,calc(100vw-20px))] max-h-[calc(100vh-var(--header-height)-20px)] overflow-y-auto ${compact ? '!top-0 !right-0 !bottom-auto !w-full !max-h-[50dvh] rounded-none [&>aside]:rounded-none [&>aside]:border-x-0' : ''}`}
    >
      <ViewerFeatureInspection.Panel
        callbacks={panelCallbacks}
        state={viewerState}
        {text}
        {ui}
      />
    </div>
  {/if}
  {#if compact && mobilePanelOpen}
    <div
      class="fixed top-0 right-0 z-20 w-full overflow-hidden transition-[height] duration-180 ease-out"
      style:height={`${mobilePanelHeight}px`}
    >
      <div
        use:reportMobilePanelHeight
        class="max-h-[50dvh] overflow-y-auto [&>aside]:rounded-none [&>aside]:border-x-0"
      >
        {#if mobilePanel === 'diff'}
          <ViewerDiff.Panel
            callbacks={panelCallbacks}
            compact
            mobileHosted
            onClose={() => (diffPanelOpen = false)}
            open={diffPanelOpen}
            state={viewerState}
            {text}
            {ui}
          />
        {:else if mobilePanel === 'diagnostics'}
          <ViewerDiagnostics.Panel
            callbacks={panelCallbacks}
            dismissLabel={text.dismissNotice}
            notice={$ui.notice}
            state={viewerState}
            {text}
            {ui}
          />
        {:else if mobilePanel === 'inspection'}
          <ViewerFeatureInspection.Panel
            callbacks={panelCallbacks}
            state={viewerState}
            {text}
            {ui}
          />
        {/if}
      </div>
    </div>
  {/if}
  {#if compact}
    <ViewerHeader.MobileBar
      active={mobilePanel}
      dirty={mobileMenuDirty}
      menuOpen={mobileMenuOpen}
      onMenu={toggleMobileMenu}
      onPanel={selectMobilePanel}
      panelOpen={mobilePanelOpen}
      {text}
      theme={$appState.theme}
    />
  {/if}
</Tooltip.Provider>
