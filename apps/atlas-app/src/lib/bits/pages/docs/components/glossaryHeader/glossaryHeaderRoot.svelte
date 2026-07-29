<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  actions?: Snippet
  children?: Snippet
}

let { actions, children }: Props = $props()
</script>

<header
  class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,32rem)] lg:items-start"
>
  <div>{@render children?.()}</div>
  <div class="lg:pt-1">{@render actions?.()}</div>
</header>
