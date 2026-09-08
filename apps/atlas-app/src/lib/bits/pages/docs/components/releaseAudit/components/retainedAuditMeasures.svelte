<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import type { Json } from '@repo/core/provenance'
let { measures }: { measures: Json[] } = $props()
const object = (v: Json) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const locales = ['en', 'zh-hant', 'zh-hans']
</script>
<table class="w-full table-fixed text-left text-sm">
  <thead class="border-b border-current/20 text-xs uppercase opacity-60">
    <tr>
      <th class="w-[19%] p-2">{m.source_audit_code()}</th>
      {#each locales as locale}
        <th class="w-[27%] p-2">{locale}</th>
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each measures as measure}
      {@const row = object(measure)}
      <tr class="border-b border-current/10 align-top">
        <td class="p-2">
          <code
            class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-500 wrap-anywhere"
            >{String(row.measureCode ?? '—')}</code
          >
        </td>
        {#each locales as locale}
          {@const entry = (Array.isArray(row.localisations) ? row.localisations : []).map(object).find(item => String(item.locale).toLowerCase() === locale)}
          <td class="wrap-break-word p-2">
            {#if entry}
              <p class="font-medium">{String(entry.name ?? '')}</p>
              <p class="mt-1 text-xs leading-relaxed opacity-60">
                {String(entry.description ?? '')}
              </p>
            {:else}
              <span class="opacity-40">—</span>
            {/if}
          </td>
        {/each}
      </tr>
    {/each}
  </tbody>
</table>
