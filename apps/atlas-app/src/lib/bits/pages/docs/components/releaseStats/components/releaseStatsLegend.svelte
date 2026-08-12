<script lang="ts">
let { items, label }: { items: Array<{ label: string; tone: string }>; label: string } =
  $props()
</script>
<div
  class="hidden items-center gap-3 font-mono text-sm text-foreground-alt sm:flex"
  role="img"
  aria-label={label}
>
  {#each items as item}
    <span class="inline-flex items-center gap-1.5"
      ><span class={`size-2 ${item.tone}`}></span>{item.label}</span
    >
  {/each}
</div>
