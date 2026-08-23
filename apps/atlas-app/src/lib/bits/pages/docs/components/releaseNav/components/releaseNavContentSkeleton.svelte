<script lang="ts">
import { Skeleton as ReleaseAuditSkeleton } from '../../releaseAudit/index.js'
import { Skeleton as ReleaseDiffSkeleton } from '../../releaseDiff/index.js'
import { Skeleton as ReleaseLinksSkeleton } from '../../releaseLinks/index.js'
import { Skeleton as ReleaseNotesSkeleton } from '../../releaseNotes/index.js'
import { Skeleton as ReleaseStatsSkeleton } from '../../releaseStats/index.js'

type Props = {
  diff?: boolean
  linksVariant?: 'assembly' | 'releases'
  tab: string
}

let { diff = false, linksVariant = 'releases', tab }: Props = $props()
</script>

{#if tab === 'release' && diff}
  <ReleaseDiffSkeleton />
{:else if tab === 'release' || tab === 'guide'}
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
  <ReleaseLinksSkeleton variant={linksVariant} />
{/if}
