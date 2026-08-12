<script lang="ts">
import type { ReleaseNotesPresentation } from '../../releaseNotes'
import type { ReleaseDiffChange, ReleaseDiffLabels } from '../releaseDiff.types'
import ReleaseDiffChangeComponent from './releaseDiffChange.svelte'
import ReleaseDiffLegend from './releaseDiffLegend.svelte'

type Props = {
  changes: ReleaseDiffChange[]
  labels: ReleaseDiffLabels
  markdown: ReleaseNotesPresentation
}

let { changes, labels, markdown }: Props = $props()
</script>

<div
  data-release-nav-content-body
  class="mt-6 grid scroll-mt-24 gap-5 lg:scroll-mt-[120px]"
>
  <ReleaseDiffLegend {labels} />
  {#each changes as change}
    <ReleaseDiffChangeComponent {change} {labels} {markdown} />
  {/each}
</div>
