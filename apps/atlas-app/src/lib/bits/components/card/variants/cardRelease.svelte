<script lang="ts">
import Icon from '@iconify/svelte'
import { m } from '$lib/bits/internal/i18n'
import topoImage from '$lib/assets/topo.jpg'
import { getApiFamilyTheme } from '$lib/registry/apiFamilyTheme'
type Release = {
  apiFamily: string
  code: string
  status: string
  displayStatus?: string
  schemaVersion: string
}
type Props = {
  release: Release
  index: number
  displayDate: string
  displayCode: string
  records: string | null
  isDragging?: boolean
}
let {
  release,
  index,
  displayDate,
  displayCode,
  records,
  isDragging = false,
}: Props = $props()
let theme = $derived(getApiFamilyTheme(release.apiFamily))
let accent = $derived(theme?.colorway.primary ?? 'var(--secondary)')
let secondary = $derived(theme?.colorway.secondary ?? 'var(--accent)')
let ink = $derived(release.apiFamily === 'streets' ? '#111717' : '#fffaf0')
let lifecycleStatus = $derived(release.displayStatus ?? release.status)
let isCurrent = $derived(lifecycleStatus.toLowerCase() === 'current')
let isDraft = $derived(lifecycleStatus.toLowerCase() === 'draft')
let statusLabel = $derived(
  lifecycleStatus.toLowerCase() === 'revised'
    ? m.api_release_revised()
    : lifecycleStatus.toLowerCase() === 'superseded'
      ? m.api_release_superseded()
      : lifecycleStatus,
)
let cardStyle = $derived(
  `--release-accent: ${accent}; --release-secondary: ${secondary}; --release-ink: ${ink}; --release-topo-image: url('${topoImage}'); --release-topo-x: ${(index % 4) * 25}%; --release-topo-y: ${(Math.floor(index / 4) % 4) * 25}%; --release-topo-scale-x: ${index % 2 === 0 ? 1 : -1}; --release-topo-scale-y: ${index % 3 === 0 ? -1 : 1}; background: var(--release-accent);`,
)
</script>
<a
  class={`group relative grid min-h-69 w-80 shrink-0 isolate overflow-hidden rounded-lg p-5 text-(--release-ink) shadow-[0_1rem_2.5rem_rgb(0_0_0/0.14)] transition-shadow duration-220 before:absolute before:inset-0 before:z-0 before:bg-[radial-gradient(circle_at_45%_42%,color-mix(in_srgb,var(--release-accent)_74%,#fff_26%)_0,transparent_52%),linear-gradient(135deg,color-mix(in_srgb,var(--release-accent)_86%,#000_14%),color-mix(in_srgb,var(--release-accent)_58%,var(--release-secondary)_42%))] before:content-[''] after:absolute after:-right-12 after:-bottom-18 after:z-1 after:size-48 after:rotate-18 after:border after:border-current after:opacity-[0.18] after:content-[''] hover:shadow-[0_1.25rem_3rem_rgb(0_0_0/0.2)] focus-visible:outline-none focus-visible:shadow-[0_1.25rem_3rem_rgb(0_0_0/0.2)] ${isDragging ? 'shadow-[0_1.25rem_3rem_rgb(0_0_0/0.2)]' : ''}`}
  data-carousel-card={release.code}
  style={cardStyle}
  href={`/apis/${release.apiFamily}/${release.code}`}
>
  <span
    class={`absolute inset-[-10%] z-1 bg-(image:--release-topo-image) bg-no-repeat bg-position-[var(--release-topo-x)_var(--release-topo-y)] bg-size-[70rem_auto] opacity-[0.26] mix-blend-screen filter-[saturate(.96)_contrast(1.06)] transform-[scale(var(--release-topo-scale-x),var(--release-topo-scale-y))] transition-[opacity,background-size] duration-220 group-hover:bg-size-[76rem_auto] group-hover:opacity-[0.34] group-focus-visible:bg-size-[76rem_auto] group-focus-visible:opacity-[0.34] ${isDragging ? 'bg-size-[76rem_auto] opacity-[0.34]' : ''}`}
    aria-hidden="true"
  ></span>
  {#if isDraft}
    <span
      class="pointer-events-none absolute inset-0 z-1 rounded-lg bg-[conic-gradient(from_210deg_at_50%_50%,#fb7185,#facc15,#4ade80,#22d3ee,#818cf8,#e879f9,#fb7185)] p-px [mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] mask-exclude [-webkit-mask-composite:xor]"
      aria-hidden="true"
    ></span>
  {/if}
  <span class="relative z-2 flex items-start justify-between gap-4"
    ><span
      ><span
        class="block font-body text-caption font-semibold uppercase tracking-[0.16em] opacity-76"
        >{displayDate}</span
      ><span class="mt-3 block font-display text-[1.65rem] font-bold leading-none"
        >{theme?.name ?? release.apiFamily}</span
      ></span
    ><span
      class={`rounded border px-2 py-1 font-body text-caption font-semibold backdrop-blur ${isCurrent ? 'border-2 border-[#5fe39a] bg-[#0e3d2a]/64 text-[#f0fff7]' : 'border-current/24 bg-white/12'}`}
      >{#if isCurrent}
        <span
          class="mr-1.5 inline-block size-1.5 rounded-full bg-[#a7f3d0] align-middle"
        ></span>
      {/if}
      {statusLabel}</span
    ></span
  >
  <span class="relative z-2 mt-8 block font-mono text-[1.8rem] font-bold leading-[1.02]"
    >v{displayCode}</span
  >
  <span
    class="relative z-2 mt-5 grid grid-cols-[minmax(8.5rem,1.2fr)_minmax(0,0.8fr)] gap-3 font-body text-caption"
    ><span
      class="grid min-h-18 min-w-34 content-center border border-current bg-white/10 p-3 backdrop-blur"
      ><span class="opacity-68">{m.data_schema()}</span
      ><span class="mt-1 font-mono text-[0.95rem] font-bold leading-none"
        >{release.schemaVersion}</span
      ></span
    ><span
      class="grid min-h-18 content-center border border-current bg-white/10 p-3 backdrop-blur"
      ><span class="opacity-68">{m.data_records()}</span
      ><span class="mt-1 font-mono text-[0.95rem] font-bold leading-none"
        >{records ?? m.data_pending()}</span
      ></span
    ></span
  >
  <span
    class="relative z-2 mt-6 inline-flex items-center justify-self-end gap-1 font-body text-label-md font-semibold"
    >{m.data_view_release()}
    <Icon
      icon="proicons:arrow-right"
      class={`size-4 transition group-hover:translate-x-1 ${isDragging ? 'translate-x-1' : ''}`}
    /></span
  >
</a>
