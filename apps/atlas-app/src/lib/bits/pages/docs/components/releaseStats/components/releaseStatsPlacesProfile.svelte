<script lang="ts">
import type { PlaceProfile } from '../placeProfile'
import Coverage from './releaseStatsPlaceCoverage.svelte'
import Languages from './releaseStatsPlaceLanguages.svelte'
let { profile }: { profile: PlaceProfile } = $props()
</script>

{#if profile.metrics.length}
  <Coverage {profile} />
{/if}
<Languages {profile} />
