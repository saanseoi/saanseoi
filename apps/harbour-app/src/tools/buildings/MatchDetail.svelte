<script lang="ts">
import type { RecordDetail } from './types'
import { labels } from './types'
let {
  detail,
  active,
  onMatch,
  onDecision,
  decision,
}: {
  detail: RecordDetail
  active: number
  onMatch: (index: number) => void
  onDecision: (value: 'accept' | 'reject' | 'skip') => void
  decision: string
} = $props()
const percent = (n: number) => `${(100 * n).toFixed(3)}%`
</script>
<section class="border-t border-slate-700 p-4" aria-label="Selected building">
  <p class="text-xs uppercase tracking-wider text-slate-400">
    {detail.inventory === 'landsd' ? 'LandsD' : 'Overture'}
    selection
  </p>
  <h2 class="mt-1 text-lg font-semibold">
    {detail.selected.name || 'Unnamed building'}
  </h2>
  <p class="mt-1 break-all font-mono text-xs text-slate-400">{detail.selected.id}</p>
  {#if detail.category}
    <p class="mt-2 text-sm text-cyan-200">{labels[detail.category.status]}</p>
  {/if}
  <p class="mt-3 text-xs text-slate-400">
    Top 10 overlapping counterparts. Coverage is calculated independently in each
    direction.
  </p>
  <div class="mt-3 max-h-[28vh] space-y-2 overflow-auto">
    {#each detail.matches as match, index}
      <button
        type="button"
        onclick={() => onMatch(index)}
        class={`w-full rounded-lg border p-3 text-left ${active === index ? 'border-amber-400 bg-slate-800' : 'border-slate-700 bg-slate-900 hover:bg-slate-800'}`}
      >
        <span class="block text-sm font-medium"
          >{match.name || 'Unnamed counterpart'}</span
        >
        <span class="mt-1 block break-all font-mono text-[11px] text-slate-400"
          >{detail.inventory === 'landsd' ? match.overtureId : match.landsdId}</span
        >
        <span class="mt-2 flex justify-between text-sm"
          ><span class="text-cyan-300">LandsD {percent(match.landsdCoverage)}</span
          ><span class="text-orange-300"
            >Overture {percent(match.overtureCoverage)}</span
          ></span
        >
        <span class="mt-1 block text-xs text-slate-400"
          >IoU {percent(match.iou)} · {Math.round(match.landsdAreaM2)} /
          {Math.round(match.overtureAreaM2)}
          m²</span
        >
        {#if match.landsdCoverage > 0.99 && match.overtureCoverage <= 0.99}
          <span class="mt-1 block text-xs text-amber-300"
            >Partial containment · not equivalent footprints</span
          >
        {/if}
        {#if match.repaired}
          <span class="mt-1 block text-xs text-rose-300"
            >Geometry repaired for analysis; review required</span
          >
        {/if}
      </button>
    {:else}
      <p class="rounded-lg bg-slate-900 p-3 text-sm text-slate-400">
        No positive-area overlap in the other inventory.
      </p>
    {/each}
  </div>
  {#if detail.matches.length}
    <div class="mt-3 grid grid-cols-3 gap-2">
      <button
        type="button"
        class="rounded-lg border border-emerald-700 px-2 py-2 text-sm text-emerald-300 hover:bg-emerald-950"
        onclick={() => onDecision('accept')}
      >
        Accept link
      </button>
      <button
        type="button"
        class="rounded-lg border border-rose-800 px-2 py-2 text-sm text-rose-300 hover:bg-rose-950"
        onclick={() => onDecision('reject')}
      >
        Reject
      </button>
      <button
        type="button"
        class="rounded-lg border border-slate-700 px-2 py-2 text-sm hover:bg-slate-800"
        onclick={() => onDecision('skip')}
      >
        Skip
      </button>
    </div>
    <p class="mt-2 text-xs text-slate-500">
      {decision ? `Saved locally: ${decision}. ` : ''}Review annotations only. No IDs
      are assigned and inventories remain separate.
    </p>
  {/if}
</section>
