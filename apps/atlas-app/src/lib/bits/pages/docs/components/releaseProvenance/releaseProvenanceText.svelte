<script lang="ts">
let { text }: { text: string } = $props()
let parts = $derived(text.split(/\b(sourceRecordId|id|ID)\b/g))
</script>
{#each parts as part, index}
  {#if index % 2}
    <code>{part === 'ID' ? 'id' : part}</code>
  {:else}
    {part}
  {/if}
{/each}
