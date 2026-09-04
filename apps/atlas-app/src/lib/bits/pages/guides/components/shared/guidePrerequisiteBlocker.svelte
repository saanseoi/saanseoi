<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  class?: string
  id?: string
}

let { children, class: className = '', id }: Props = $props()
</script>

<aside
  {id}
  class={`min-w-0 max-w-232 overflow-hidden rounded-sm bg-[repeating-linear-gradient(135deg,var(--color-error)_0_7px,var(--color-surface-container-high)_7px_14px)] p-3 ${className}`}
  aria-live="polite"
>
  <div
    class="bg-surface-container-low px-6 py-5 font-body text-body-lg leading-8 text-foreground-alt sm:px-10"
  >
    {@render children?.()}
  </div>
</aside>
