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
let retainedOutlineId = $state<string | null>(null)
let selectedOutlineId = $state<string | null>(null)
let optimisticVersionCode = $state<string | null>(null)
let committedVersionCode = $state<string | null>(null)
let visibleOutlineId = $derived(
  selectedOutlineId ?? activeOutlineId ?? observedOutlineId ?? retainedOutlineId,
)
const persistence = createReleaseNavigationPersistence({
  getContentTarget: () => getReleaseNavContentTarget(contentPanel),
  getVersions: () => versions,
  onVersionSelect: versionCode => (optimisticVersionCode = versionCode),
})
let visibleVersionCode = $derived(optimisticVersionCode ?? currentVersionCode)
const nestedScroll = createNestedContentScroll({
  onNavigate: persistence.captureNavigation,
})

function selectTab(tab: string) {
  selectedOutlineId = null
  activeTab = tab
  onTabChange?.(tab)
}

function selectOutline(id: string) {
  selectedOutlineId = id
}

const scrollingKeys = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
  ' ',
])

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))

function releaseSelectedOutlineFromKey(event: KeyboardEvent) {
  if (scrollingKeys.has(event.key) && !isTypingTarget(event.target)) {
    selectedOutlineId = null
  }
}

$effect(() => {
  if (committedVersionCode === null) {
    committedVersionCode = currentVersionCode
    return
  }

  if (currentVersionCode !== committedVersionCode) {
    committedVersionCode = currentVersionCode
    optimisticVersionCode = null
    selectedOutlineId = null
  }
  visibleVersionCode
  void persistence.restore()
})

$effect(() => {
  visibleVersionCode
  if (loading || nestedContent) return
  return observeReleaseNavOutline(outline, id => (observedOutlineId = id))
})

$effect(() => {
  const activeId = activeOutlineId ?? observedOutlineId
  if (!loading && activeId) retainedOutlineId = activeId
})

$effect(() => {
  if (selectedOutlineId && !outline.some(item => item.id === selectedOutlineId)) {
    selectedOutlineId = null
  }
})

$effect(() => {
  if (!selectedOutlineId) return
  const release = () => (selectedOutlineId = null)
  window.addEventListener('wheel', release, { passive: true })
  window.addEventListener('touchmove', release, { passive: true })
  window.addEventListener('keydown', releaseSelectedOutlineFromKey)
  return () => {
    window.removeEventListener('wheel', release)
    window.removeEventListener('touchmove', release)
    window.removeEventListener('keydown', releaseSelectedOutlineFromKey)
  }
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
    activeOutlineId={visibleOutlineId}
    canShowToc={outline.length > 0}
    currentVersionCode={visibleVersionCode}
    {loading}
    onOutlineSelect={selectOutline}
    {outline}
    panel={contentPanel}
    {versions}
    {onVersionPreload}
  />
{/snippet}

{#snippet sideNav()}
  <ReleaseNavSideNav
    activeOutlineId={visibleOutlineId}
    canExpand={nestedContent || outline.length > 0}
    {loading}
    onOutlineSelect={selectOutline}
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
  hasOutline={outline.length > 0}
  {loading}
  {mobileSideNav}
  {navBar}
  scrollAction={nestedScroll}
  showNestedPanel={nestedContent}
  {sideNav}
>
  {@render children?.()}
</ReleaseNavContent>
