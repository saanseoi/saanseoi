<script lang="ts">
import ChangesSkeleton from '../../releaseStats/components/apiReleaseChangesSkeleton.svelte'
import ReleaseSchemaSkeleton from '../../releaseSchema/components/releaseSchemaSkeleton.svelte'
import ReleaseSamplesSkeleton from '../../releaseSamples/components/releaseSamplesSkeleton.svelte'

type Props = {
  diff?: boolean
  linksVariant?: 'assembly' | 'releases'
  tab: string
}

let { diff = false, linksVariant = 'releases', tab }: Props = $props()
let linksSkeleton = $derived(
  tab === 'sources' || tab === 'usage' || tab === 'assembly'
    ? import('../../releaseLinks/components/releaseLinksSkeleton.svelte')
    : undefined,
)
let skeleton = $derived(
  tab === 'changes' ||
    tab === 'samples' ||
    tab === 'sources' ||
    tab === 'usage' ||
    tab === 'assembly'
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

{#if tab === 'changes'}
  <ChangesSkeleton />
{:else if tab === 'schema'}
  <ReleaseSchemaSkeleton />
{:else if tab === 'samples'}
  <ReleaseSamplesSkeleton showDescription />
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
