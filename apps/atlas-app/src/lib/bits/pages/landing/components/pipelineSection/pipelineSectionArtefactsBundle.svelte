<script lang="ts">
let { azimuth }: { azimuth: string } = $props()
</script>

<div class="pipeline-artefacts" aria-hidden="true">
  <span class="artefact artefact-release artefact-release-square"></span
  ><span class="artefact artefact-release artefact-release-circle"></span
  ><span class="artefact artefact-release artefact-release-label">{azimuth}</span
  ><span class="artefact artefact-release artefact-release-grid"></span
  ><span class="artefact artefact-release artefact-release-bars"></span>
</div>
