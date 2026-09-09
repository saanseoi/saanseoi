<script lang="ts">
let { text }: { text: string } = $props()
</script>

{#each text.split('`') as part, index}
  {#if index % 2}
    <code class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[0.9em] text-emerald-500"
      >{part}</code
    >
  {:else}
    {part}
  {/if}
{/each}
