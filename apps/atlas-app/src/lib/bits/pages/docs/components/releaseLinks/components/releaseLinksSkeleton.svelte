<script lang="ts">
import ReleaseLinksSkeletonGroup from './releaseLinksSkeletonGroup.svelte'

type Props = { variant?: 'assembly' | 'releases' }

let { variant = 'releases' }: Props = $props()
</script>

<div
  class="grid gap-6"
  aria-busy="true"
  aria-label={variant === 'assembly' ? 'Loading assembly' : 'Loading release links'}
  role="status"
>
  {#if variant === 'assembly'}
    <ReleaseLinksSkeletonGroup entryCount={2} />
    <ReleaseLinksSkeletonGroup entryCount={1} />
  {:else}
    <ReleaseLinksSkeletonGroup expanded entryCount={1} />
  {/if}
</div>
