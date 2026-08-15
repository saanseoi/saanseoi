<script lang="ts">
import type { MarkdownHeading } from '#lib/registry/markdown.js'

import OutlineTracker from '../../releaseContentOutline/releaseContentOutlineTracker.svelte'

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
  activeHeadingId?: string | null
}

let {
  markdown,
  headings,
  labels,
  transclusions,
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
</script>

<ReleaseNotesArticle bind:element={article} hasContent={Boolean(markdown)}>
  {#if markdown}
    <ReleaseNotesContent {markdown} {labels} {transclusions} />
  {:else}
    <ReleaseNotesEmptyState label={labels.empty} />
  {/if}
</ReleaseNotesArticle>
<OutlineTracker content={article} headings={outlineHeadings} bind:activeHeadingId />
