<script lang="ts">
type Props = { latency: string; coordinates: string; status: string }
let { latency, coordinates, status }: Props = $props()
</script>

<div class="pipeline-artifacts" aria-hidden="true">
  <span class="artifact artifact-api artifact-api-target"></span
  ><span class="artifact artifact-api artifact-api-latency">{latency}</span
  ><span class="artifact artifact-api artifact-api-coord">{@html coordinates}</span
  ><span class="artifact artifact-api artifact-api-status">{status}</span>
</div>
