<script lang="ts">
import type { GenericStatGroupPresentation } from '../releaseStats.types'
import GenericGroup from './releaseStatsGenericGroup.svelte'
let { groups }: { groups: GenericStatGroupPresentation[] } = $props()
</script>
{#each groups as group}
  <GenericGroup {group} />
{/each}
