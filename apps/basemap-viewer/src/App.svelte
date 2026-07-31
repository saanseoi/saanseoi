<script lang="ts">
import { Tooltip } from 'bits-ui'
import { writable, type Readable, type Writable } from 'svelte/store'
import { i18n } from './lib/bits/pages/basemapViewer/i18n'
import { orderComparisonReleases } from './lib/release-order'
import * as ViewerDiagnostics from './lib/bits/pages/basemapViewer/components/panels/viewerDiagnostics'
import * as ViewerDiff from './lib/bits/pages/basemapViewer/components/panels/viewerDiff'
import * as ViewerFeatureInspection from './lib/bits/pages/basemapViewer/components/panels/viewerFeatureInspection'
import * as ViewerHeader from './lib/bits/pages/basemapViewer/components/viewerHeader'
import * as ViewerStatus from './lib/bits/pages/basemapViewer/components/viewerStatus'
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
const hasDiagnosticStack = $derived($ui.diagnostics.open && $ui.diagnostics.inspect)
const diagnosticStack = writable<HTMLDivElement | undefined>(undefined)
const diagnosticsPanel = writable<HTMLDivElement | undefined>(undefined)
const inspectionPanel = writable<HTMLDivElement | undefined>(undefined)
const constrainDiagnosticPanels = writable(false)

function captureElement(store: Writable<HTMLDivElement | undefined>) {
  return (node: HTMLDivElement) => {
    store.set(node)
    return { destroy: () => store.set(undefined) }
  }
}

const captureDiagnosticStack = captureElement(diagnosticStack)
const captureDiagnosticsPanel = captureElement(diagnosticsPanel)
const captureInspectionPanel = captureElement(inspectionPanel)

function updateDiagnosticPanelLayout(): void {
  if (!$diagnosticStack || !$diagnosticsPanel || !$inspectionPanel) return
  const availableHeight =
    window.innerHeight - $diagnosticStack.getBoundingClientRect().top - 12
  constrainDiagnosticPanels.set(
    $diagnosticsPanel.scrollHeight + $inspectionPanel.scrollHeight + 12 >
      availableHeight,
  )
}

$effect(() => {
  if (
    !hasDiagnosticStack ||
    !$diagnosticStack ||
    !$diagnosticsPanel ||
    !$inspectionPanel
  ) {
    constrainDiagnosticPanels.set(false)
    return
  }
  const observer = new ResizeObserver(updateDiagnosticPanelLayout)
  observer.observe($diagnosticsPanel)
  observer.observe($inspectionPanel)
  window.addEventListener('resize', updateDiagnosticPanelLayout)
  window.requestAnimationFrame(updateDiagnosticPanelLayout)
  return () => {
    observer.disconnect()
    window.removeEventListener('resize', updateDiagnosticPanelLayout)
  }
})
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
  <ViewerHeader.Root theme={$appState.theme}>
    <ViewerHeader.Controls {callbacks} state={viewerState} {text} {ui} />
    <ViewerHeader.Actions {callbacks} state={viewerState} {text} {ui} />
  </ViewerHeader.Root>

  <ViewerStatus.Root
    {callbacks}
    dismissLabel={text.dismissNotice}
    latest={text.latest}
    notice={$ui.notice}
    noticeId={$ui.noticeId}
    state={viewerState}
  />
  <ViewerDiff.Panel {callbacks} state={viewerState} {text} {ui} />
  {#if $ui.diagnostics.open || $ui.diagnostics.inspect}
    <div
      use:captureDiagnosticStack
      class={`pointer-events-none fixed top-[calc(var(--header-height)+12px)] right-3.5 z-20 w-[min(390px,calc(100vw-28px))] ${$constrainDiagnosticPanels ? 'grid h-[calc(100vh-var(--header-height)-24px)] grid-rows-2 gap-3 overflow-hidden' : 'flex flex-col gap-3'} ${hasDiagnosticStack ? '' : 'max-h-[calc(100vh-var(--header-height)-24px)] overflow-y-auto'}`}
    >
      {#if $ui.diagnostics.open}
        <div
          use:captureDiagnosticsPanel
          class={$constrainDiagnosticPanels ? 'min-h-0 overflow-y-auto' : ''}
        >
          <ViewerDiagnostics.Panel {callbacks} state={viewerState} {text} {ui} />
        </div>
      {/if}
      {#if $ui.diagnostics.inspect}
        <div
          use:captureInspectionPanel
          class={$constrainDiagnosticPanels ? 'min-h-0 overflow-y-auto' : ''}
        >
          <ViewerFeatureInspection.Panel {callbacks} state={viewerState} {text} {ui} />
        </div>
      {/if}
    </div>
  {/if}
</Tooltip.Provider>
