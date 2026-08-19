<script lang="ts">
import ReleaseAuditSkeleton from '#lib/bits/pages/docs/components/releaseAudit/components/releaseAuditSkeleton.svelte'
import ReleaseDiffSkeleton from '#lib/bits/pages/docs/components/releaseDiff/components/releaseDiffSkeleton.svelte'
import ReleaseLinksSkeleton from '#lib/bits/pages/docs/components/releaseLinks/components/releaseLinksSkeleton.svelte'
import ReleaseNotesSkeleton from '#lib/bits/pages/docs/components/releaseNotes/components/releaseNotesSkeleton.svelte'
import ReleaseStatsSkeleton from '#lib/bits/pages/docs/components/releaseStats/components/releaseStatsSkeleton.svelte'

type Props = { tab: string; diff?: boolean }

let { tab, diff = false }: Props = $props()
</script>

{#if tab === 'notes' && diff}
  <ReleaseDiffSkeleton />
{:else if tab === 'notes'}
  <ReleaseNotesSkeleton />
{:else if tab === 'stats'}
  <ReleaseStatsSkeleton />
{:else if tab === 'samples'}
  <div class="space-y-3" aria-busy="true">
    {#each Array(4) as _}
      <div class="h-28 animate-pulse bg-data-surface-container-low"></div>
    {/each}
  </div>
{:else if tab === 'audit'}
  <ReleaseAuditSkeleton />
{:else}
  <ReleaseLinksSkeleton />
{/if}
