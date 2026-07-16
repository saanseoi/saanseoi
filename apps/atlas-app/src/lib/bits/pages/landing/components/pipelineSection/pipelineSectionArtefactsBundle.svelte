<script lang="ts">
let { azimuth }: { azimuth: string } = $props()
</script>

<div class="pipeline-artifacts" aria-hidden="true">
  <span class="artifact artifact-release artifact-release-square"></span
  ><span class="artifact artifact-release artifact-release-circle"></span
  ><span class="artifact artifact-release artifact-release-label">{azimuth}</span
  ><span class="artifact artifact-release artifact-release-grid"></span
  ><span class="artifact artifact-release artifact-release-bars"></span>
</div>
