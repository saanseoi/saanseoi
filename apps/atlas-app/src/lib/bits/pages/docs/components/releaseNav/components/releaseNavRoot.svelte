<script lang="ts">
import type { Snippet } from 'svelte'
import type {
  ReleaseNavAction,
  ReleaseNavDomain,
  ReleaseNavOutlineItem,
  ReleaseNavTab,
  ReleaseNavVersion,
  ReleaseNavVersionPreload,
} from '../releaseNav.types'
import type { ReleaseAnalyticsSurface } from '../../releaseLinks/components/releaseLinks.types.js'
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
  analyticsSurface: ReleaseAnalyticsSurface
  activeOutlineId: string | null
  activeTab?: string
  children?: Snippet
  currentVersionCohortKey?: string | null
  hasContent: boolean
  loading?: boolean
  nestedContent?: boolean
  navigationVersions?: ReleaseNavVersion[]
  onTabChange?: (tab: string) => void
  onToggleRevisions?: () => void
  onVersionPreload?: ReleaseNavVersionPreload
  outline?: ReleaseNavOutlineItem[]
  showAllRevisions?: boolean
  tabs: ReleaseNavTab[]
  versionTitle: string
  versions: ReleaseNavVersion[]
  currentDomainCode?: string
  currentVersionCode: string
  domains?: ReleaseNavDomain[]
  domainTitle?: string
  showRevisionToggle?: boolean
}

let {
  actions = [],
  analyticsSurface,
  activeOutlineId,
  activeTab = $bindable('notes'),
  children,
  currentVersionCohortKey,
  hasContent,
  loading = false,
  nestedContent = false,
  versions,
  navigationVersions = versions,
  onTabChange,
  onToggleRevisions,
  onVersionPreload,
  outline = [],
  showAllRevisions = false,
  tabs,
  versionTitle,
  currentDomainCode,
  currentVersionCode,
  domains = [],
  domainTitle = 'Domains',
  showRevisionToggle = false,
}: Props = $props()

let contentPanel = $state<HTMLElement>()
let observedOutlineId = $state<string | null>(null)
let optimisticVersionCode = $state<string | null>(null)
let committedVersionCode = $state<string | null>(null)
const persistence = createReleaseNavigationPersistence({
  getContentTarget: () => getReleaseNavContentTarget(contentPanel),
  getVersions: () => versions,
  onVersionSelect: versionCode => (optimisticVersionCode = versionCode),
})
let visibleVersionCode = $derived(optimisticVersionCode ?? currentVersionCode)
const nestedScroll = createNestedContentScroll({
  getContentTarget: () => getReleaseNavContentTarget(contentPanel),
  isEnabled: () => nestedContent,
  onNavigate: persistence.captureNavigation,
})

function selectTab(tab: string) {
  activeTab = tab
  onTabChange?.(tab)
}

$effect(() => {
  if (committedVersionCode === null) {
    committedVersionCode = currentVersionCode
    return
  }

  if (currentVersionCode !== committedVersionCode) {
    committedVersionCode = currentVersionCode
    optimisticVersionCode = null
  }
  visibleVersionCode
  void persistence.restore()
})

$effect(() => {
  visibleVersionCode
  observedOutlineId = null
  return observeReleaseNavOutline(outline, id => (observedOutlineId = id))
})
</script>

{#snippet navBar()}
  <ReleaseNavBar
    {actions}
    {analyticsSurface}
    {activeTab}
    {currentVersionCohortKey}
    currentVersionCode={visibleVersionCode}
    {navigationVersions}
    {onToggleRevisions}
    onSelectTab={selectTab}
    {showAllRevisions}
    {showRevisionToggle}
    {tabs}
    {versionTitle}
    {versions}
    {onVersionPreload}
  />
{/snippet}

{#snippet mobileSideNav()}
  <ReleaseNavMobileSideNav
    activeOutlineId={activeOutlineId ?? observedOutlineId}
    canShowToc={outline.length > 0}
    currentVersionCode={visibleVersionCode}
    {loading}
    {outline}
    panel={contentPanel}
    {versions}
    {onVersionPreload}
  />
{/snippet}

{#snippet sideNav()}
  <ReleaseNavSideNav
    activeOutlineId={activeOutlineId ?? observedOutlineId}
    canExpand={nestedContent || outline.length > 0}
    {loading}
    currentVersionCode={visibleVersionCode}
    {currentDomainCode}
    {domains}
    {domainTitle}
    {outline}
    panel={contentPanel}
    {versions}
    {onVersionPreload}
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
