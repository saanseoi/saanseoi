<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  count?: number
  id?: string
  label?: string
  title?: string
}

let { children, count, id, label, title }: Props = $props()
</script>

<section
  {id}
  class="overflow-hidden rounded-lg border border-data-outline-variant/60 bg-(--release-list-surface)"
  style="--release-list-surface: color-mix(in srgb, var(--data-surface-container-lowest) 75%, var(--data-surface-container-low));"
>
  {#if label || title || count !== undefined}
    <header
      class="flex items-end justify-between gap-4 bg-data-surface-container-lowest px-5 py-4"
    >
      <div>
        {#if label}
          <p
            class="font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
          >
            {label}
          </p>
        {/if}
        {#if title}
          <h2 class="mt-1 font-display text-title-lg font-bold text-primary">
            {title}
          </h2>
        {/if}
      </div>
      {#if count !== undefined}
        <p class="font-mono text-label-md font-bold tabular-nums text-primary">
          {count}
        </p>
      {/if}
    </header>
  {/if}
  <div class="border-t border-data-outline-variant/60 bg-(--release-list-surface)">
    {@render children?.()}
  </div>
</section>
