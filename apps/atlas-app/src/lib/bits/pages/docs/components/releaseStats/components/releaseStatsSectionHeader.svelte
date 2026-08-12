<script lang="ts">
let {
  id,
  eyebrow,
  title,
  children,
}: {
  id: string
  eyebrow?: string
  title: string
  children?: import('svelte').Snippet
} = $props()
</script>
<div
  class="border-b border-data-outline-variant/60 bg-data-surface-container-lowest px-5 py-5"
>
  <div class="flex items-center gap-1.5">
    {#if eyebrow}
      <p
        class="font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
      >
        {eyebrow}
      </p>
    {/if}
    {#if children}
      <div class="ml-auto">{@render children()}</div>
    {/if}
  </div>
  <h2 {id} class="mt-1 font-display text-title-lg font-bold text-primary">{title}</h2>
</div>
