<script lang="ts">
import { m } from '$lib/bits/internal/i18n'

import ReleaseAuditCardRow from './releaseAuditCardRow.svelte'
import type { AuditBulkMapping } from './releaseAudit.types'

type Props = { mappings?: AuditBulkMapping[] }

let { mappings = [] }: Props = $props()
</script>

{#if mappings.length}
  <div class="divide-y divide-data-outline-variant/60">
    {#each mappings as mapping, index (`${mapping.from}-${mapping.to}-${index}`)}
      <ReleaseAuditCardRow>
        <div class="min-w-0">
          <p
            class="font-mono text-caption font-medium tracking-[0.06em] text-foreground-alt/75"
          >
            {m.source_audit_source()}
          </p>
          <p
            class="mt-1 wrap-break-word font-mono text-label-md font-semibold text-data-primary"
          >
            {mapping.from}
          </p>
        </div>
        <div class="min-w-0 text-left sm:text-right">
          <p
            class="font-mono text-caption font-medium tracking-[0.06em] text-foreground-alt/75"
          >
            {m.source_audit_canonical()}
          </p>
          <p
            class="mt-1 wrap-break-word font-mono text-label-md font-semibold text-primary"
          >
            {mapping.to}
          </p>
        </div>
      </ReleaseAuditCardRow>
    {/each}
  </div>
{/if}
