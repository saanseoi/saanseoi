<script lang="ts">
import { Tooltip } from 'bits-ui'
import type { Readable } from 'svelte/store'
import { i18n } from './lib/bits/pages/basemapViewer/i18n'
import * as ViewerDiagnostics from './lib/bits/pages/basemapViewer/components/viewerDiagnostics'
import * as ViewerHeader from './lib/bits/pages/basemapViewer/components/viewerHeader'
import * as ViewerStatus from './lib/bits/pages/basemapViewer/components/viewerStatus'
import { setAppState, type Callbacks, type ViewerUiState } from './lib/ctx/app'
import type { AppState } from './lib/types'

let {
  callbacks,
  state,
  ui,
}: { callbacks: Callbacks; state: Readable<AppState>; ui: Readable<ViewerUiState> } =
  $props()

const stateContext: Readable<AppState> = {
  subscribe(run) {
    return state.subscribe(run)
  },
}
setAppState(stateContext)

const appState = stateContext
const text = $derived(i18n[$appState.locale])
</script>

<div
  id="map"
  aria-label="山水 | SaanSeoi basemap release map"
  data-map-theme={$appState.theme}
  role="application"
></div>

<Tooltip.Provider>
  <ViewerHeader.Root theme={$appState.theme}>
    <ViewerHeader.Controls {callbacks} {state} {text} {ui} />
    <ViewerHeader.Actions {callbacks} {state} {text} {ui} />
  </ViewerHeader.Root>
</Tooltip.Provider>

<ViewerStatus.Root latest={text.latest} notice={$ui.notice} {state} />
<ViewerDiagnostics.Panel {callbacks} {state} {text} {ui} />
