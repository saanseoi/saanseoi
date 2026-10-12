<script lang="ts">
import type { Json } from '@repo/core/provenance'
import FixtureDisclosure from './auditFixtureDisclosure.svelte'
let { value }: { value: Record<string, Json> } = $props()
</script>

<FixtureDisclosure>
  {#snippet summary()}
    Identity evidence ledger · {String(value.sourceRelease ?? 'Unknown release')}
  {/snippet}
  <dl class="space-y-2 text-sm [&_dd]:break-all">
    <dt class="font-medium">Evidence storage</dt>
    <dd>Immutable R2 audit partitions</dd>
    <dt class="font-medium">Ledger SHA-256</dt>
    <dd><code>{String(value.hash)}</code></dd>
    <dt class="font-medium">Policy SHA-256</dt>
    <dd><code>{String(value.policyHash)}</code></dd>
    <dt class="font-medium">Implementation SHA-256</dt>
    <dd><code>{String(value.implementationHash)}</code></dd>
    <dt class="font-medium">Predecessor snapshot</dt>
    <dd>{String(value.predecessorSnapshotId ?? 'No predecessor recorded')}</dd>
  </dl>
</FixtureDisclosure>
