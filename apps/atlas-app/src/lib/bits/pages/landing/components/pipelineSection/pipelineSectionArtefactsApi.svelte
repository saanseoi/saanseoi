<script lang="ts">
type Props = { latency: string; coordinates: string; status: string }
let { latency, coordinates, status }: Props = $props()
</script>

<div class="pipeline-artefacts" aria-hidden="true">
  <span class="artefact artefact-api artefact-api-target"></span
  ><span class="artefact artefact-api artefact-api-latency">{latency}</span
  ><span class="artefact artefact-api artefact-api-coord">{@html coordinates}</span
  ><span class="artefact artefact-api artefact-api-status">{status}</span>
</div>
