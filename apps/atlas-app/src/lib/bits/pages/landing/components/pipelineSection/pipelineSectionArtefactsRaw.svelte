<script lang="ts">
type Props = { coordinates: string; referenceSystem: string; measurements: string }
let { coordinates, referenceSystem, measurements }: Props = $props()
</script>

<div class="pipeline-artefacts" aria-hidden="true">
  <span class="artefact artefact-raw artefact-raw-coord">{coordinates}</span
  ><span class="artefact artefact-raw artefact-raw-ref">{referenceSystem}</span
  ><span class="artefact artefact-raw artefact-raw-meter">{measurements}</span>
</div>
