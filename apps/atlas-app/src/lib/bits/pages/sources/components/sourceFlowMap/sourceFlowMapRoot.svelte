<script lang="ts">
import SourceFlowMapLane from './sourceFlowMapLane.svelte'
import type { SourceFlowLane } from './sourceFlowMapTypes'

type Props = {
  lanes: SourceFlowLane[]
  showPlanned?: boolean
  expandAll?: boolean
  sourceFilterActive?: boolean
}

let {
  lanes,
  showPlanned = $bindable(true),
  expandAll = $bindable(false),
  sourceFilterActive = false,
}: Props = $props()
</script>

<div class="source-flow-map grid gap-4">
  {#each lanes as lane, laneIndex (lane.id)}
    <SourceFlowMapLane
      {lane}
      {laneIndex}
      {showPlanned}
      {expandAll}
      {sourceFilterActive}
    />
  {/each}
</div>

<style>
.source-flow-map {
  isolation: isolate;
}
</style>
