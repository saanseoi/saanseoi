<script lang="ts">
import type { Json } from '@repo/core/provenance'
let { entries }: { entries: Json[] } = $props()
const object = (v: Json | undefined) =>
  v && typeof v === 'object' && !Array.isArray(v) ? v : {}
</script>

<div class="space-y-3">
  {#each entries as entry}
    {@const row = object(entry)}
    <article class="space-y-1 rounded-lg border border-current/10 p-3 text-sm">
      <div class="flex flex-wrap justify-between gap-2 text-xs uppercase opacity-60">
        <span
          >{String(row.sourceLocale ?? 'Source')}
          → {String(row.targetLocale ?? row.locale ?? 'Target')}</span
        ><span>{String(row.provenance ?? 'Origin unrecorded')}</span>
      </div>
      <p>
        {String(row.sourceText ?? 'Source text unrecorded')}
        → <strong>{String(row.text ?? row.name ?? '')}</strong>
      </p>
      {#each Object.entries(object(row.context)) as [key, value]}
        <p class="opacity-60">
          {key.replaceAll(/([a-z])([A-Z])/g, '$1 $2')}: {String(value ?? '—')}
        </p>
      {/each}
    </article>
  {/each}
</div>
