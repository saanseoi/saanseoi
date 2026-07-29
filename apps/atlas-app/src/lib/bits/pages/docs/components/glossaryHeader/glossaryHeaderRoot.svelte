<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  actions?: Snippet
  children?: Snippet
  description?: Snippet
  meta?: Snippet
}

let { actions, children, description, meta }: Props = $props()
</script>

<header class="mt-6">
  <div
    class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,32rem)] lg:items-center"
  >
    <div>{@render children?.()}</div>
    <div>{@render actions?.()}</div>
  </div>
  <div class="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,32rem)]">
    <div>{@render description?.()}</div>
    <div>{@render meta?.()}</div>
  </div>
</header>
