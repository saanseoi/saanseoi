<script lang="ts">
type Props = { coordinates: string; referenceSystem: string; measurements: string }
let { coordinates, referenceSystem, measurements }: Props = $props()
</script>

<div class="pipeline-artifacts" aria-hidden="true">
  <span class="artifact artifact-raw artifact-raw-coord">{coordinates}</span
  ><span class="artifact artifact-raw artifact-raw-ref">{referenceSystem}</span
  ><span class="artifact artifact-raw artifact-raw-meter">{measurements}</span>
</div>
