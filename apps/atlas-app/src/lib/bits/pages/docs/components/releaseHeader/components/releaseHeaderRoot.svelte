<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  class?: string
  backgroundImage?: string
}

let { children, class: className = '', backgroundImage }: Props = $props()
</script>

<section
  class={`relative isolate overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest dark:border-outline-variant ${className}`}
>
  {#if backgroundImage}
    <div class="absolute inset-x-0 top-0 h-64 md:h-72" aria-hidden="true">
      <div
        class="absolute inset-0 bg-cover bg-position-[center_42%] opacity-85"
        style={`background-image: url('${backgroundImage}')`}
      ></div>
      <div class="header-image-gradient absolute inset-0"></div>
    </div>
  {/if}
  <div class="relative z-10">{@render children?.()}</div>
</section>

<style>
.header-image-gradient {
  background:
    linear-gradient(to bottom, transparent 14%, var(--surface-container-lowest) 100%),
    linear-gradient(
      132deg,
      color-mix(in srgb, var(--surface-container-lowest) 64%, transparent) 0%,
      color-mix(in srgb, var(--surface-container-lowest) 28%, transparent) 54%,
      color-mix(in srgb, var(--surface-container-lowest) 8%, transparent) 100%
    );
}
</style>
