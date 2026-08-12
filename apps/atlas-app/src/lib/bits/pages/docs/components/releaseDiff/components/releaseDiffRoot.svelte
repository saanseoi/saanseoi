<script lang="ts">
import type { ReleaseNotesPresentation } from '../../releaseNotes'
import type { ReleaseDiffChange, ReleaseDiffLabels } from '../releaseDiff.types'
import ReleaseDiffChangeList from './releaseDiffChangeList.svelte'
import ReleaseDiffEmptyState from './releaseDiffEmptyState.svelte'

type Props = {
  changes: ReleaseDiffChange[]
  labels: ReleaseDiffLabels
  markdown: ReleaseNotesPresentation
}

let { changes, labels, markdown }: Props = $props()
</script>

{#if changes.length === 0}
  <ReleaseDiffEmptyState label={labels.empty} />
{:else}
  <ReleaseDiffChangeList {changes} {labels} {markdown} />
{/if}
