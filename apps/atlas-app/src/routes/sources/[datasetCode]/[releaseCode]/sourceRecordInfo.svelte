<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
let { tab, family }: { tab: string; family: string | null } = $props()
</script>

<div class="space-y-3">
  {#if tab === 'schema'}
    <p class="font-body text-body-md leading-relaxed text-foreground-alt">
      {m.source_record_schema_intro()}
    </p>

    <p class="font-body text-body-md leading-relaxed text-foreground-alt">
      {m.source_record_schema_not_one_to_one_before()} <code>properties</code>
      {family === 'streets'
        ? m.source_record_schema_not_one_to_one_after()
        : m.source_record_schema_native_envelope_description()}
    </p>
  {:else}
    <p>{m.source_record_samples_intro()} <code>properties</code>.</p>
  {/if}
</div>
