<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  title?: string
  children?: Snippet
}

let { title = 'Note', children }: Props = $props()
</script>

<aside
  class="my-5 border-l-4 border-tertiary bg-surface-container-low px-5 py-2 pb-4 font-body text-body-md leading-7 text-foreground-alt"
>
  <p
    class="m-0 text-label-sm leading-none font-bold uppercase tracking-[0.08em] text-primary"
  >
    {title}
  </p>
  <div class="mt-2">{@render children?.()}</div>
</aside>
