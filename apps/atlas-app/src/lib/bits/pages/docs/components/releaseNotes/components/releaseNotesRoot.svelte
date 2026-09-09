<script lang="ts">
import { tick } from 'svelte'
import type { MarkdownHeading } from '#lib/registry/markdown.js'

import OutlineTracker from '../../releaseContentOutline/releaseContentOutlineTracker.svelte'
import { releaseNavScrollsIndependently } from '../../releaseNav/releaseNavScroll.js'

import type {
  ReleaseNotesLabels,
  ReleaseNotesTransclusion,
} from '../releaseNotes.types'
import ReleaseNotesArticle from './releaseNotesArticle.svelte'
import ReleaseNotesContent from './releaseNotesContent.svelte'
import ReleaseNotesEmptyState from './releaseNotesEmptyState.svelte'

type Props = {
  markdown: string
  headings: MarkdownHeading[]
  labels: ReleaseNotesLabels
  transclusions: Record<string, ReleaseNotesTransclusion>
  sourceTableColumns?: boolean
  activeHeadingId?: string | null
}

let {
  markdown,
  headings,
  labels,
  transclusions,
  sourceTableColumns = false,
  activeHeadingId = $bindable(null),
}: Props = $props()

let article = $state<HTMLElement>()
let outlineHeadings = $derived(
  headings.map(heading => ({
    id: heading.id,
    level: heading.level,
    label: heading.text,
  })),
)

const releaseNotesHashOffset = 48

function scrollToHashTarget() {
  if (!article || !releaseNavScrollsIndependently(article)) return

  const id = decodeURIComponent(window.location.hash.slice(1))
  if (!id) return

  const target = article.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
  if (!target) return

  const targetTop =
    article.scrollTop +
    target.getBoundingClientRect().top -
    article.getBoundingClientRect().top -
    releaseNotesHashOffset

  article.scrollTo({ top: Math.max(0, targetTop), behavior: 'auto' })
}

$effect(() => {
  if (!article || !markdown) return

  let cancelled = false
  let frame = 0
  const scheduleScroll = () => {
    window.cancelAnimationFrame(frame)
    frame = window.requestAnimationFrame(() => {
      if (!cancelled) scrollToHashTarget()
    })
  }

  void tick().then(scheduleScroll)
  window.addEventListener('hashchange', scheduleScroll)

  return () => {
    cancelled = true
    window.cancelAnimationFrame(frame)
    window.removeEventListener('hashchange', scheduleScroll)
  }
})
</script>

<ReleaseNotesArticle
  bind:element={article}
  hasContent={Boolean(markdown)}
  {sourceTableColumns}
>
  {#if markdown}
    <ReleaseNotesContent {markdown} {labels} {transclusions} />
  {:else}
    <ReleaseNotesEmptyState label={labels.empty} />
  {/if}
</ReleaseNotesArticle>
<OutlineTracker content={article} headings={outlineHeadings} bind:activeHeadingId />
