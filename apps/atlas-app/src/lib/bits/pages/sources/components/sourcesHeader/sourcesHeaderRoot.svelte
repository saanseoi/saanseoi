<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  actions?: Snippet
  children?: Snippet
}

let { actions, children }: Props = $props()
</script>

<section class="flex flex-wrap items-end justify-between gap-6">
  <div>
    {@render children?.()}
  </div>
  {@render actions?.()}
</section>
