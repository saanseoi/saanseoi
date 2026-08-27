<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import { urbanDensityStatsResponses } from './urbanDensityExampleData.ts'
</script>

<div
  class="flex h-full min-h-0 flex-col overflow-hidden border border-[#596074] bg-[#10151a] font-mono text-sm shadow-inner"
>
  <div class="border-b border-[#596074] bg-[#202633] px-4 py-3 text-[#d6e4ff]">
    <div class="flex items-center justify-between gap-3">
      <span class="font-semibold tracking-[0.08em] uppercase">Statistics API</span>
      <span class="text-xs text-[#80e7c7]">200 OK</span>
    </div>
    <p class="mt-1 text-xs leading-5 text-white/55">GET /stats/v0.1/geographies</p>
  </div>

  <div
    class="grid min-h-0 flex-1 divide-y divide-[#596074] sm:grid-cols-[minmax(13rem,1fr)_auto_minmax(0,2fr)] sm:divide-x sm:divide-y-0"
  >
    <section class="flex min-h-0 flex-col p-4">
      <p class="text-xs font-semibold tracking-[0.08em] text-[#a5d6ff] uppercase">
        {m.guide_data_urban_density_preview_request()}
      </p>
      <dl class="mt-3 space-y-2 text-xs leading-5 text-white/70">
        <div class="flex gap-3">
          <dt class="shrink-0 text-white/45">cohort</dt>
          <dd>2024</dd>
        </div>
        <div class="flex gap-3">
          <dt class="shrink-0 text-white/45">dataset</dt>
          <dd class="break-all">…population-density-district</dd>
        </div>
        <div class="flex gap-3">
          <dt class="shrink-0 text-white/45">fields</dt>
          <dd>populationMidYear, landArea</dd>
        </div>
      </dl>
    </section>

    <div
      class="flex items-center justify-center px-4 py-3 text-[#80e7c7]"
      aria-hidden="true"
    >
      →
    </div>

    <section class="flex min-h-0 flex-col p-4">
      <p class="text-xs font-semibold tracking-[0.08em] text-[#a5d6ff] uppercase">
        {m.guide_data_urban_density_preview_response()}
      </p>
      <div class="mt-3 flex min-h-0 flex-1 flex-col gap-3">
        {#each urbanDensityStatsResponses as response}
          <article
            class="flex min-h-0 flex-1 flex-col overflow-hidden border border-white/10 bg-black/15"
          >
            <p class="border-b border-white/10 px-3 py-2 text-xs text-[#ffd28a]">
              <code>filter[field]={response.field}</code>
            </p>
            <pre
              class="min-h-0 flex-1 overflow-auto p-3 text-[11px] leading-5 text-white/70"
            >{JSON.stringify({ values: response.values }, null, 2)}</pre>
          </article>
        {/each}
      </div>
    </section>
  </div>

  <p
    class="border-t border-[#596074] bg-[#131722] px-4 py-3 text-xs leading-5 text-white/60"
  >
    {m.guide_data_urban_density_stats_preview_description()}
  </p>
</div>
