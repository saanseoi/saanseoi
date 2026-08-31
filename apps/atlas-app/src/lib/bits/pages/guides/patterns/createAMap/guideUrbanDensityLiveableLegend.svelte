<div
  class="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3 font-mono text-[0.68rem] font-semibold tracking-[0.08em] uppercase"
>
  <p
    class="flex items-center gap-1.5 rounded-sm bg-[#10151a]/90 px-2 py-1 text-[#36a269] shadow-sm"
  >
    <span class="size-2 shrink-0 bg-[#36a269]" aria-hidden="true"></span>
    {m.guide_data_urban_density_liveable_legend_liveable()}
  </p>
  <p
    class="flex items-center gap-1.5 rounded-sm bg-[#10151a]/90 px-2 py-1 text-[#ffad9d] shadow-sm"
  >
    <span class="size-2 shrink-0 bg-[#e76f51]" aria-hidden="true"></span>
    {m.guide_data_urban_density_liveable_legend_excluded()}
  </p>
</div>
<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
</script>
