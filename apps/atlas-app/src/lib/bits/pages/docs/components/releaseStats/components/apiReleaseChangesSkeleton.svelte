<script lang="ts">
import OverviewSkeleton from './releaseStatsOverviewSkeleton.svelte'
import LoadingRows from '#lib/bits/pages/sources/components/sourceRecordChanges/sourceRecordChangesSkeleton.svelte'
</script>

<div class="space-y-2">
  <OverviewSkeleton />
  <LoadingRows label="Loading changes" />
</div>
