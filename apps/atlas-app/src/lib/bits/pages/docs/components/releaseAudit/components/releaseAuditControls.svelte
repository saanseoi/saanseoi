<script lang="ts">
import ReleaseAuditControlsHeader from './releaseAuditControlsHeader.svelte'
import ReleaseAuditControlsSearch from './releaseAuditControlsSearch.svelte'

type Props = {
  filteredCount: string
  infoDescription: string
  infoLabel: string
  query?: string
  totalCount: string
}

let {
  filteredCount,
  infoDescription,
  infoLabel,
  query = $bindable(''),
  totalCount,
}: Props = $props()
</script>

<section
  class="rounded-lg border border-data-outline-variant/60 bg-data-surface-container-lowest p-5"
>
  <ReleaseAuditControlsHeader
    {filteredCount}
    {infoDescription}
    {infoLabel}
    {totalCount}
  />
  <ReleaseAuditControlsSearch bind:query />
</section>
