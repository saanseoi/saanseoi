<script lang="ts">
import type { ReleaseNotesPresentation } from '../../releaseNotes'
import type { ReleaseDiffChange, ReleaseDiffLabels } from '../releaseDiff.types'
import ReleaseDiffPane from './releaseDiffPane.svelte'

type Props = {
  change: ReleaseDiffChange
  labels: ReleaseDiffLabels
  markdown: ReleaseNotesPresentation
}

let { change, labels, markdown }: Props = $props()
</script>

<section
  class="grid gap-6 overflow-hidden rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-5 dark:border-outline-variant lg:grid-cols-2"
>
  <ReleaseDiffPane
    kind="removed"
    markdown={change.removedMarkdown}
    label={labels.removed}
    notes={markdown}
  />
  <ReleaseDiffPane
    kind="added"
    markdown={change.addedMarkdown}
    label={labels.added}
    notes={markdown}
  />
</section>
