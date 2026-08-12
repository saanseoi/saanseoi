<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  aside?: Snippet
  asideClass?: string
  children?: Snippet
  mobileAsideAfter?: boolean
}

let { aside, asideClass = '', children, mobileAsideAfter = false }: Props = $props()
</script>

<div
  class="flow-root border-b border-data-outline-variant/60 bg-data-surface-container-lowest px-5 py-4"
>
  {#if aside && mobileAsideAfter}
    <div class={`float-right mb-3 ml-6 max-w-1/2 max-sm:hidden ${asideClass}`}>
      {@render aside()}
    </div>
    {@render children?.()}
    <div class={`mt-5 hidden max-sm:block ${asideClass}`}>
      {@render aside()}
    </div>
  {:else}
    {#if aside}
      <div
        class={`float-right mb-3 ml-6 max-w-1/2 max-sm:float-none max-sm:ml-0 max-sm:max-w-none ${asideClass}`}
      >
        {@render aside()}
      </div>
    {/if}
    {@render children?.()}
  {/if}
</div>
