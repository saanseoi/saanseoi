<script lang="ts">
import { Tooltip } from 'bits-ui'
import ReleaseAuditControlsHeader from './releaseAuditControlsHeader.svelte'
import ReleaseAuditControlsSearch from './releaseAuditControlsSearch.svelte'

type Props = {
  filteredCount: string
  infoDescription: string
  infoLabel: string
  loadError?: boolean
  loading?: boolean
  onRetry?: () => void
  query?: string
  totalCount: string
  placeholder?: string
}

let {
  filteredCount,
  infoDescription,
  infoLabel,
  loadError = false,
  loading = false,
  onRetry,
  query = $bindable(''),
  totalCount,
  placeholder,
}: Props = $props()
</script>

<section class="py-2">
  <Tooltip.Provider>
    <ReleaseAuditControlsHeader
      {filteredCount}
      {infoDescription}
      {infoLabel}
      {loading}
      {totalCount}
    />
  </Tooltip.Provider>
  <ReleaseAuditControlsSearch {loadError} {onRetry} {placeholder} bind:query />
</section>
