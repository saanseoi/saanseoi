<script lang="ts">
import type { Snippet } from 'svelte'
import { tick } from 'svelte'
import {
  preconnectChoroplethMapOrigins,
  preloadChoroplethMapAssets,
} from '#lib/bits/components/choroplethMap/choroplethMapPreload.js'
import type {
  ReleaseNavAction,
  ReleaseNavDomain,
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
  onTabChange?: (tab: string) => void
  outline?: ReleaseNavOutlineItem[]
  tabs: ReleaseNavTab[]
  versionTitle: string
  versions: ReleaseNavVersion[]
  currentDomainCode?: string
  currentVersionCode: string
  domains?: ReleaseNavDomain[]
  domainTitle?: string
}

let {
  actions = [],
  activeOutlineId,
  activeTab = $bindable('notes'),
  children,
  hasContent,
  nestedContent = false,
  onTabChange,
  outline = [],
  tabs,
  versionTitle,
  versions,
  currentDomainCode,
  currentVersionCode,
  domains = [],
  domainTitle = 'Domains',
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
  onTabChange?.(tab)
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

$effect(() => {
  if (activeTab !== 'notes') return

  const controller = new AbortController()
  const timeout = window.setTimeout(
    () => preloadChoroplethMapAssets(controller.signal),
    250,
  )

  return () => {
    window.clearTimeout(timeout)
    controller.abort()
  }
})
</script>

<svelte:head>
  {#each preconnectChoroplethMapOrigins as origin}
    <link rel="preconnect" href={origin} crossorigin="anonymous">
  {/each}
</svelte:head>

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
    {currentDomainCode}
    {domains}
    {domainTitle}
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
