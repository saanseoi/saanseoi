<script lang="ts">
import AddressMap from './AddressMap.svelte'
let showHousing = $state(false)
let status = $state('Loading ALS address points…')
let mapError = $state('')
</script>

<AddressMap
  {showHousing}
  onStatus={value => (status = value)}
  onError={value => (mapError = value)}
/>
<section
  class="absolute left-4 top-4 z-10 w-[min(360px,calc(100vw-5rem))] rounded-2xl border border-slate-700 bg-slate-950/95 p-5 shadow-xl"
>
  <a href="/" class="text-xs text-cyan-300 hover:underline">← Harbour</a>
  <h1 class="mt-3 text-xl font-semibold tracking-tight">ALS address points</h1>
  <p class="mt-2 text-sm leading-relaxed text-slate-400">
    All source points across Hong Kong. Zoom in and select a point to inspect its
    bilingual address.
  </p>
  <p role="status" class="mt-4 text-sm text-cyan-200">{status}</p>
  <div class="mt-4 flex items-center gap-2 text-sm">
    <span class="h-2 w-2 rounded-full bg-cyan-300"></span>2D premises · always visible
  </div>
  <label class="mt-3 flex items-start gap-2 text-sm"
    ><input
      class="mt-1 accent-amber-400"
      type="checkbox"
      bind:checked={showHousing}
    >Public rental housing (3D source)</label
  >
  <p class="mt-2 text-xs leading-relaxed text-slate-500">
    3D records share building coordinates; floors and units are counted per source
    point.
  </p>
  {#if mapError}
    <p role="alert" class="mt-3 text-sm text-amber-300">{mapError}</p>
  {/if}
</section>
