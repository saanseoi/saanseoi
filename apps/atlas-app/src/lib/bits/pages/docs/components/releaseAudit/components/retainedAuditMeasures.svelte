<script lang="ts">
import type { Json } from '@repo/core/provenance'
let { measures }: { measures: Json[] } = $props()
const object = (v: Json) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
</script>

<div class="space-y-4">
  {#each measures as measure}
    {@const row = object(measure)}
    <article class="rounded-lg border border-current/10 p-3">
      <h4 class="font-medium">{String(row.measureCode ?? 'Measure')}</h4>
      {#if Array.isArray(row.localisations)}
        <dl class="mt-2 grid grid-cols-[5rem_1fr] gap-2 text-sm">
          {#each row.localisations as item}
            {@const label = object(item)}
            <dt class="opacity-60">{String(label.locale ?? '')}</dt>
            <dd>
              {String(label.name ?? '')}
              <p class="opacity-60">{String(label.description ?? '')}</p>
              <p class="text-xs opacity-50">
                {String(label.origin ?? 'Origin unrecorded')}
              </p>
            </dd>
          {/each}
        </dl>
      {/if}
    </article>
  {/each}
</div>
