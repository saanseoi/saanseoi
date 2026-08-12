<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  marker: string
}

let { children, marker }: Props = $props()
</script>

<h4 class="flex items-center gap-3 font-display text-title-lg font-bold text-primary">
  <span class="font-mono text-sm text-[#7dd3fc]" aria-hidden="true">{marker}</span>
  <span>{@render children?.()}</span>
</h4>
