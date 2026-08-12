<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  id?: string
  number: string
}

let { children, id, number }: Props = $props()
</script>

<h3
  {id}
  class="flex items-center gap-3 font-display text-headline-sm font-bold text-primary"
>
  <span
    class="grid size-9 shrink-0 place-items-center bg-[#7dd3fc]/15 font-mono text-sm text-[#7dd3fc]"
    aria-hidden="true"
    >{number}</span
  >
  <span>{@render children?.()}</span>
</h3>
