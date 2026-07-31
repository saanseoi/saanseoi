<script lang="ts">
import type { Snippet } from 'svelte'

let {
  alignmentClass = 'items-start',
  children,
  eyebrow,
  title,
}: {
  alignmentClass?: string
  children?: Snippet
  eyebrow: string
  title: string
} = $props()
</script>

<div class={`flex ${alignmentClass} justify-between gap-3`}>
  <div class="grid gap-0.5">
    <span class="text-[10px] font-bold uppercase tracking-[0.08em] text-(--bar-muted)">
      {eyebrow}
    </span>
    <h2 class="m-0 text-sm font-bold">{title}</h2>
  </div>
  {#if children}
    {@render children()}
  {/if}
</div>
