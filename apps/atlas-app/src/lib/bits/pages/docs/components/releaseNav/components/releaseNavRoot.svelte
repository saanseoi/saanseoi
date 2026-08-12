<script lang="ts">
import type { Snippet } from 'svelte'
import { tick } from 'svelte'
import type {
  ReleaseNavAction,
  ReleaseNavOutlineItem,
  ReleaseNavTab,
  ReleaseNavVersion,
} from '../releaseNav.types'
import {
  createNestedContentScroll,
  createReleaseNavigationPersistence,
  getReleaseNavContentTarget,
  observeReleaseNavOutline,
} from '../releaseNavScroll'
import ReleaseNavBar from './releaseNavBar.svelte'
import ReleaseNavContent from './releaseNavContent.svelte'
import ReleaseNavMobileSideNav from './releaseNavMobileSideNav.svelte'
import ReleaseNavSideNav from './releaseNavSideNav.svelte'

type Props = {
  actions?: ReleaseNavAction[]
  activeOutlineId: string | null
  activeTab?: string
  children?: Snippet
  hasContent: boolean
  nestedContent?: boolean
  outline?: ReleaseNavOutlineItem[]
  tabs: ReleaseNavTab[]
  versionTitle: string
  versions: ReleaseNavVersion[]
  currentVersionCode: string
}

let {
  actions = [],
  activeOutlineId,
  activeTab = $bindable('notes'),
  children,
  hasContent,
  nestedContent = false,
  outline = [],
  tabs,
  versionTitle,
  versions,
  currentVersionCode,
}: Props = $props()

let contentPanel = $state<HTMLElement>()
let observedOutlineId = $state<string | null>(null)
const persistence = createReleaseNavigationPersistence({
  getContentTarget: () => getReleaseNavContentTarget(contentPanel),
  getVersions: () => versions,
})
const nestedScroll = createNestedContentScroll({
  getContentTarget: () => getReleaseNavContentTarget(contentPanel),
  isEnabled: () => nestedContent,
  onNavigate: persistence.captureNavigation,
})

async function selectTab(tab: string) {
  activeTab = tab
  await tick()
  const content = getReleaseNavContentTarget(contentPanel)
  if (content && content.getBoundingClientRect().top <= 72) {
    window.dispatchEvent(new Event('app-header:preserve-visibility'))
    content.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

$effect(() => {
  currentVersionCode
  void persistence.restore()
})

$effect(() => {
  currentVersionCode
  observedOutlineId = null
  return observeReleaseNavOutline(outline, id => (observedOutlineId = id))
})
</script>

{#snippet navBar()}
  <ReleaseNavBar
    {actions}
    {activeTab}
    {currentVersionCode}
    onSelectTab={selectTab}
    {tabs}
    {versionTitle}
    {versions}
  />
{/snippet}

{#snippet mobileSideNav()}
  <ReleaseNavMobileSideNav
    activeOutlineId={activeOutlineId ?? observedOutlineId}
    canShowToc={outline.length > 0}
    {currentVersionCode}
    {outline}
    panel={contentPanel}
    {versions}
  />
{/snippet}

{#snippet sideNav()}
  <ReleaseNavSideNav
    activeOutlineId={activeOutlineId ?? observedOutlineId}
    canExpand={nestedContent || outline.length > 0}
    {currentVersionCode}
    {outline}
    panel={contentPanel}
    {versions}
  />
{/snippet}

<ReleaseNavContent
  bind:panel={contentPanel}
  {hasContent}
  {mobileSideNav}
  {navBar}
  scrollAction={nestedScroll}
  showNestedPanel={nestedContent}
  {sideNav}
>
  {@render children?.()}
</ReleaseNavContent>
