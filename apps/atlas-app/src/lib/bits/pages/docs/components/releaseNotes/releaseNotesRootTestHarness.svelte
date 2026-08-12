<script lang="ts">
import type { ReleaseNotesPresentation } from './releaseNotes.types'
import Root from './components/releaseNotesRoot.svelte'

type Props = { presentation: ReleaseNotesPresentation }

let { presentation }: Props = $props()
let activeHeadingId = $state<string | null>(null)
</script>

<Root
  markdown={presentation.markdown}
  headings={presentation.headings}
  labels={presentation.labels}
  transclusions={presentation.transclusions}
  bind:activeHeadingId
/>
<output data-testid="active-heading">{activeHeadingId ?? ''}</output>
