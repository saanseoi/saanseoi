<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import type { Json } from '@repo/core/provenance'
import { getRetainedAuditDecision } from '#lib/registry/audit.remote.js'
import RetainedAuditFixture from './retainedAuditFixture.svelte'
let {
  releaseId,
  hash,
  actionId,
}: { releaseId: string; hash: string; actionId: string } = $props()
let result = $state<{ declaration: Json; fixture: Json }>()
let failure = $state('')
async function load() {
  try {
    result = await getRetainedAuditDecision({ releaseId, hash, actionId })
    failure = ''
  } catch {
    failure = m.source_audit_load_decision_error()
  }
}
</script>

<details ontoggle={event => { if (event.currentTarget.open && !result) void load() }}>
  <summary class="cursor-pointer">{m.source_audit_declaration_fixture()}</summary>
  <div class="space-y-4 pt-3">
    {#if result}
      <RetainedAuditFixture value={result.declaration} />
      {#if result.fixture !== null}
        <RetainedAuditFixture value={result.fixture} />
      {/if}
    {:else}
      <p>{failure || m.source_audit_loading_decision()}</p>
      {#if failure}
        <button type="button" class="underline" onclick={load}>
          {m.source_audit_retry_decision()}
        </button>
      {/if}
    {/if}
  </div>
</details>
