<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

type Props = {
  hosting: 'cloudflare' | 'github-pages' | 'netlify' | 'vercel'
  renderer?: 'leaflet' | 'mapbox' | 'maplibre'
}

let { hosting, renderer = 'maplibre' }: Props = $props()

const hostLabel = $derived(
  hosting === 'cloudflare'
    ? m.guide_host_cloudflare()
    : hosting === 'github-pages'
      ? m.guide_host_github_pages()
      : hosting === 'netlify'
        ? m.guide_host_netlify()
        : m.guide_host_vercel(),
)
const rendererLabel = $derived(
  renderer === 'leaflet'
    ? 'Leaflet'
    : renderer === 'mapbox'
      ? 'Mapbox GL JS'
      : 'MapLibre',
)
const badge = $derived(
  hosting === 'netlify'
    ? 'netlify'
    : hosting === 'vercel'
      ? '▲ Vercel'
      : hosting === 'github-pages'
        ? 'GitHub Pages'
        : 'Cloudflare Workers',
)
</script>

<div
  class="relative h-full min-h-64 overflow-hidden bg-[#e9f0e8] font-body text-[#13261f]"
>
  <div
    class="absolute inset-0 opacity-80 bg-[linear-gradient(28deg,transparent_47%,#a7c3af_48%,transparent_49%),linear-gradient(118deg,transparent_45%,#b7d1b7_46%,transparent_47%),radial-gradient(circle_at_63%_48%,#75b89f_0_9%,transparent_9.5%)]"
  ></div>
  <div
    class="absolute inset-x-0 top-[42%] h-8 -rotate-6 bg-[#5d9cc9]/70 shadow-[0_0_0_8px_rgb(255_255_255/18%)]"
  ></div>
  <header
    class="absolute inset-x-0 top-0 flex items-center justify-between border-b border-[#13261f]/15 bg-white/92 px-4 py-3 text-xs font-semibold backdrop-blur"
  >
    <span>{m.guide_publish_preview_map_title()}</span>
    <span class="rounded-full bg-[#153d30] px-2 py-1 text-white">{rendererLabel}</span>
  </header>
  <section class="absolute inset-x-4 bottom-4 grid grid-cols-3 gap-2">
    {#each ['Hong Kong Island', 'Kowloon', 'New Territories'] as area}
      <article class="bg-[#10251d]/92 p-2 text-white shadow-lg sm:p-3">
        <p class="text-[0.6rem] text-white/70 sm:text-xs">{area}</p>
        <strong class="mt-1 block text-sm sm:text-lg"
          >{area === 'Kowloon' ? '45,780' : '19,420'}</strong
        >
        <span class="text-[0.55rem] text-white/60 sm:text-[0.65rem]"
          >{m.guide_data_urban_density_people_per_square_kilometre()}</span
        >
      </article>
    {/each}
  </section>
  <span
    class="absolute right-3 bottom-28 rounded bg-white/95 px-2 py-1 text-[0.65rem] font-bold shadow-sm"
  >
    {badge}
  </span>
  <span class="absolute right-3 bottom-3 text-[0.6rem] text-[#13261f]/70"
    >{m.guide_publish_preview_public_map({ host: hostLabel })}</span
  >
</div>
