<script lang="ts">
let {
  name,
  hasChildren,
  expanded = $bindable(true),
}: {
  name: string
  hasChildren: boolean
  expanded?: boolean
} = $props()
</script>

<span class="flex min-w-0 items-start gap-2">
  {#if hasChildren}
    <button
      class="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm border border-outline-variant/70 font-mono text-caption text-primary transition hover:border-secondary hover:text-secondary focus-visible:outline-2 focus-visible:outline-secondary"
      type="button"
      aria-expanded={expanded}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
      onclick={() => (expanded = !expanded)}
    >
      {expanded ? '−' : '+'}
    </button>
  {:else}
    <span class="mt-0.5 size-5 shrink-0" aria-hidden="true"></span>
  {/if}
  <span class="min-w-0 wrap-break-word">{name}</span>
</span>
