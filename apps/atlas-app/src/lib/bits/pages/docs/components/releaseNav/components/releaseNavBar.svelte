<script lang="ts">
import type {
  ReleaseNavAction,
  ReleaseNavTab,
  ReleaseNavVersion,
} from '../releaseNav.types'
import ReleaseNavActions from './releaseNavActions.svelte'
import ReleaseNavTabs from './releaseNavTabs.svelte'
import ReleaseNavVersionControls from './releaseNavVersionControls.svelte'

type Props = {
  actions?: ReleaseNavAction[]
  activeTab: string
  currentVersionCode: string
  onSelectTab: (tab: string) => void
  tabs: ReleaseNavTab[]
  versionTitle: string
  versions: ReleaseNavVersion[]
}
let {
  actions,
  activeTab,
  currentVersionCode,
  onSelectTab,
  tabs,
  versionTitle,
  versions,
}: Props = $props()
</script>

<div
  data-release-nav-controls
  class="sticky top-0 z-50 -mx-6 grid w-[calc(100%+3rem)] bg-background/95 px-6 backdrop-blur-sm md:-mx-8 md:w-[calc(100%+4rem)] md:px-8 xl:top-[72px] xl:mx-0 xl:w-auto xl:grid-cols-[1fr_18rem] xl:gap-8 xl:px-0"
>
  <div class="flex min-w-0">
    <ReleaseNavTabs {activeTab} onSelect={onSelectTab} {tabs} />
    <ReleaseNavActions {actions} />
  </div>
  <div class="hidden h-10 items-center justify-between xl:flex">
    <h2 class="font-body text-label-md font-semibold text-primary">{versionTitle}</h2>
    <ReleaseNavVersionControls {currentVersionCode} {versions} />
  </div>
</div>
