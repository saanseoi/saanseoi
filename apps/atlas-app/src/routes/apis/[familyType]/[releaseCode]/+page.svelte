<script lang="ts">
import {
  Main,
  ReleaseHeader,
  ReleaseLinks,
  ReleaseNav,
  ReleaseNotes,
  ReleaseStats,
} from '$lib/bits'
import { getCurrentLocale, m } from '$lib/bits/internal/i18n'
import { getMarkdownHeadings, selectLocaleMarkdown } from '$lib/registry/markdown'
import { getApiReleasePageData } from '$lib/registry/meta.remote'

let { params } = $props()
let data = $derived(
  await getApiReleasePageData({
    familyType: params.familyType,
    releaseCode: params.releaseCode,
  }),
)
let locale = $derived(getCurrentLocale())
let notes = $derived(selectLocaleMarkdown(data.release.notes, locale))
let noteHeadings = $derived(
  getMarkdownHeadings(notes).filter(heading => heading.level >= 2),
)
let activeTab = $state('notes')
let activeHeadingId = $state<string | null>(null)
let statsHeadings = $state<typeof noteHeadings>([])
let activeStatsHeadingId = $state<string | null>(null)
let versions = $derived(
  (data.api.releases ?? []).map(release => ({
    code: release.code,
    href: `/apis/${data.api.familyType}/${release.code}`,
    label: release.code,
  })),
)
let sourceGroups = $derived([
  {
    links: (data.release.contributingSources ?? []).map(source => ({
      description: `${source.role} · ${source.resourceType} · ${source.variant}`,
      details: source.sourceCode,
      eyebrow: source.role,
      href: `/sources/${source.sourceCode}/${source.sourceReleaseCode}`,
      title: source.sourceReleaseCode,
    })),
  },
])
let tocHeadings = $derived(activeTab === 'notes' ? noteHeadings : statsHeadings)
let activeTocHeadingId = $derived(
  activeTab === 'notes' ? activeHeadingId : activeStatsHeadingId,
)
let hasContent = $derived(
  activeTab === 'notes'
    ? Boolean(notes.trim())
    : activeTab === 'stats'
      ? Boolean(data.release.stats?.length)
      : Boolean(data.release.contributingSources?.length),
)

$effect(() => {
  data.release.code
  activeTab = 'notes'
  activeHeadingId = null
  activeStatsHeadingId = null
})
</script>

<Main class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-8 md:px-8">
  <ReleaseHeader.ApiVariant api={data.api} release={data.release} {locale} />
  <ReleaseNav.Root
    {versions}
    currentVersionCode={data.release.code}
    headings={tocHeadings}
    activeHeadingId={activeTocHeadingId}
    {hasContent}
    versionTitle={m.api_release_versions()}
    tabs={[
      { id: 'notes', label: m.api_release_notes() },
      { id: 'stats', label: m.api_release_stats() },
      { id: 'sources', label: 'Sources' },
    ]}
    bind:activeTab
  >
    {#if activeTab === 'notes'}
      <ReleaseNotes.Root
        source={notes}
        {locale}
        headings={noteHeadings}
        bind:activeHeadingId
      />
    {:else if activeTab === 'stats'}
      <ReleaseStats.Root
        stats={data.release.stats}
        {locale}
        bind:headings={statsHeadings}
        bind:activeHeadingId={activeStatsHeadingId}
      />
    {:else}
      <ReleaseLinks.Root
        groups={sourceGroups}
        emptyLabel={m.api_release_unavailable()}
      />
    {/if}
  </ReleaseNav.Root>
</Main>
