<script lang="ts">
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
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
}
</script>

<details ontoggle={event => { if (event.currentTarget.open && !result) void load() }}>
  <summary class="cursor-pointer">Rule declaration and selected fixture</summary>
  <div class="space-y-4 pt-3">
    {#if result}
      <RetainedAuditFixture value={result.declaration} />
      {#if result.fixture !== null}
        <RetainedAuditFixture value={result.fixture} />
      {/if}
    {:else}
      <p>{failure || 'Loading retained decision…'}</p>
      {#if failure}
        <button type="button" class="underline" onclick={load}>Retry decision</button>
      {/if}
    {/if}
  </div>
</details>
