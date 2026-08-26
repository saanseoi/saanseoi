<script lang="ts">
import { urbanDensityDivisionsResponse } from './urbanDensityExampleData.ts'
</script>

<div
  class="flex h-full min-h-0 flex-col overflow-hidden border border-[#596074] bg-[#10151a] font-mono text-sm shadow-inner"
>
  <div class="border-b border-[#596074] bg-[#202633] px-4 py-3 text-[#d6e4ff]">
    <div class="flex items-center justify-between gap-3">
      <span class="font-semibold tracking-[0.08em] uppercase">Divisions API</span>
      <span class="text-xs text-[#80e7c7]">200 OK</span>
    </div>
    <p class="mt-1 text-xs leading-5 text-white/55">GET /divisions/v0</p>
  </div>

  <div
    class="grid min-h-0 flex-1 divide-y divide-[#596074] sm:grid-cols-[minmax(13rem,1fr)_auto_minmax(0,2fr)] sm:divide-x sm:divide-y-0"
  >
    <section class="p-4">
      <p class="text-xs font-semibold tracking-[0.08em] text-[#a5d6ff] uppercase">
        Request
      </p>
      <dl class="mt-3 space-y-2 text-xs leading-5 text-white/70">
        <div class="flex gap-3">
          <dt class="shrink-0 text-white/45">filter[level]</dt>
          <dd>2</dd>
        </div>
        <div class="flex gap-3">
          <dt class="shrink-0 text-white/45">include</dt>
          <dd>hierarchy</dd>
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
        Response
      </p>
      <p class="mt-3 text-xs leading-5 text-white/55">
        Districts carry their curated code and Area hierarchy item. That is enough to
        group the population and published land-area values from the Statistics API.
      </p>
      <pre
        class="mt-3 min-h-0 flex-1 overflow-auto border border-white/10 bg-black/15 p-3 text-[11px] leading-5 text-white/70"
      >{JSON.stringify(urbanDensityDivisionsResponse, null, 2)}</pre>
    </section>
  </div>
</div>
