<script lang="ts">
import type { PlaceProfile } from '../placeProfile'
import Coverage from './releaseStatsPlaceCoverage.svelte'
import Languages from './releaseStatsPlaceLanguages.svelte'
import Availability from './releaseStatsPlaceAvailability.svelte'
let { profile }: { profile: PlaceProfile } = $props()
</script>

{#if profile.metrics.length}
  <Coverage {profile} />
{/if}
{#if profile.availability.length}
  <Availability rows={profile.availability} />
{/if}
<Languages {profile} />
