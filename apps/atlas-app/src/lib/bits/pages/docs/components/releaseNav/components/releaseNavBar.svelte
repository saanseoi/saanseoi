<script lang="ts">
import type {
  ReleaseNavAction,
  ReleaseNavTab,
  ReleaseNavVersion,
  ReleaseNavVersionPreload,
} from '../releaseNav.types'
import type { ReleaseAnalyticsSurface } from '../../releaseLinks/components/releaseLinks.types.js'
import ReleaseNavActions from './releaseNavActions.svelte'
import ReleaseNavTabs from './releaseNavTabs.svelte'
import ReleaseNavVersionControls from './releaseNavVersionControls.svelte'

type Props = {
  actions?: ReleaseNavAction[]
  analyticsSurface: ReleaseAnalyticsSurface
  activeTab: string
  currentVersionCohortKey?: string | null
  currentVersionCode: string
  navigationVersions?: ReleaseNavVersion[]
  onToggleRevisions?: () => void
  onSelectTab: (tab: string) => void
  onVersionPreload?: ReleaseNavVersionPreload
  showAllRevisions?: boolean
  showRevisionToggle?: boolean
  tabs: ReleaseNavTab[]
  versionTitle: string
  versions: ReleaseNavVersion[]
}
let {
  actions,
  analyticsSurface,
  activeTab,
  currentVersionCohortKey,
  currentVersionCode,
  versions,
  navigationVersions = versions,
  onToggleRevisions,
  onSelectTab,
  onVersionPreload,
  showAllRevisions = false,
  showRevisionToggle = false,
  tabs,
  versionTitle,
}: Props = $props()
</script>

<div
  data-release-nav-controls
  class="sticky top-0 z-50 -mx-6 grid w-[calc(100%+3rem)] bg-background/95 px-6 backdrop-blur-sm md:-mx-8 md:w-[calc(100%+4rem)] md:px-8 xl:top-[72px] xl:mx-0 xl:w-auto xl:grid-cols-[1fr_18rem] xl:gap-8 xl:px-0"
>
  <div class="flex min-w-0">
    <ReleaseNavTabs {activeTab} onSelect={onSelectTab} {tabs} />
    <ReleaseNavActions {actions} {analyticsSurface} />
  </div>
  <div class="hidden h-10 items-center justify-between xl:flex">
    <div class="flex items-center gap-2">
      <h2
        class="font-body text-label-md font-semibold uppercase tracking-[0.14em] text-primary"
      >
        {versionTitle}
      </h2>
      {#if showRevisionToggle}
        <button
          class={`inline-flex h-6 items-center rounded-default border px-1.5 font-mono text-label-sm font-semibold transition ${showAllRevisions ? 'border-data-primary bg-data-secondary-container text-data-primary' : 'border-data-outline-variant/60 bg-data-surface-container-lowest text-foreground-alt hover:border-data-primary hover:text-data-primary'}`}
          type="button"
          aria-pressed={showAllRevisions}
          title={showAllRevisions ? 'Show latest revisions only' : 'Show all revisions'}
          onclick={onToggleRevisions}
        >
          REV
        </button>
      {/if}
    </div>
    <ReleaseNavVersionControls
      currentCohortKey={currentVersionCohortKey}
      {currentVersionCode}
      {onVersionPreload}
      versions={navigationVersions}
    />
  </div>
</div>
