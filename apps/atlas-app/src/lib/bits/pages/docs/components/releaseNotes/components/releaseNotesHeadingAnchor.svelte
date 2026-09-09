<script lang="ts">
import type { Snippet } from 'svelte'
import { scrollToReleaseNavAnchor } from '../../releaseNav/releaseNavScroll.js'

let { id, children }: { id: string; children?: Snippet } = $props()

function navigateToHeading(event: MouseEvent) {
  void scrollToReleaseNavAnchor({ event, id })
}
</script>

<a
  href={`#${id}`}
  class="source-heading-anchor group block text-inherit no-underline"
  onclick={navigateToHeading}
>
  <span
    aria-hidden="true"
    class="pointer-events-none -ml-3 inline-block w-3 align-middle font-mono text-sm leading-none text-secondary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
    >#</span
  >{@render children?.()}
</a>
