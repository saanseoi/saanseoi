<script lang="ts">
type Props = {
  diff?: boolean
  linksVariant?: 'assembly' | 'releases'
  tab: string
}

let { diff = false, linksVariant = 'releases', tab }: Props = $props()
let linksSkeleton = $derived(
  tab === 'sources' || tab === 'assembly'
    ? import('../../releaseLinks/components/releaseLinksSkeleton.svelte')
    : undefined,
)
let skeleton = $derived(
  tab === 'samples' || tab === 'sources' || tab === 'assembly'
    ? undefined
    : tab === 'release' && diff
      ? import('../../releaseDiff/components/releaseDiffSkeleton.svelte')
      : tab === 'notes' || tab === 'release' || tab === 'guide'
        ? import('../../releaseNotes/components/releaseNotesSkeleton.svelte')
        : tab === 'stats'
          ? import('../../releaseStats/components/releaseStatsSkeleton.svelte')
          : import('../../releaseAudit/components/releaseAuditSkeleton.svelte'),
)
</script>

{#if tab === 'samples'}
  <div class="space-y-3" aria-busy="true">
    {#each Array(4) as _}
      <div class="h-28 animate-pulse bg-data-surface-container-low"></div>
    {/each}
  </div>
{:else}
  {#if linksSkeleton}
    {#await linksSkeleton then module}
      {@const ReleaseLinksSkeleton = module.default}
      <ReleaseLinksSkeleton variant={linksVariant} />
    {/await}
  {:else if skeleton}
    {#await skeleton then module}
      {@const Skeleton = module.default}
      <Skeleton />
    {/await}
  {/if}
{/if}
