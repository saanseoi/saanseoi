<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { onMount } from 'svelte'
import { m } from '#lib/bits/internal/i18n.js'
import { getApiFamilyTheme } from '#lib/registry/apiFamilyTheme.js'
import CardReleaseBackdrop from './cardReleaseBackdrop.svelte'
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
  href?: string
  records: string | null
  isDragging?: boolean
}
let {
  release,
  index,
  displayDate,
  displayCode,
  href,
  records,
  isDragging = false,
}: Props = $props()
let theme = $derived(getApiFamilyTheme(release.apiFamily))
let accent = $derived(theme?.colorway.primary ?? 'var(--secondary)')
let secondary = $derived(theme?.colorway.secondary ?? 'var(--accent)')
let lifecycleStatus = $derived(release.displayStatus ?? release.status)
let isCurrent = $derived(lifecycleStatus.toLowerCase() === 'current')
let isSuperseded = $derived(lifecycleStatus.toLowerCase() === 'superseded')
let isDraft = $derived(lifecycleStatus.toLowerCase() === 'draft')
let ink = $derived(isDraft ? '#3c3028' : '#213238')
let isIntroVisible = $state(false)
let isIntroActive = $state(true)
let statusLabel = $derived(
  isDraft
    ? m.data_coming_soon()
    : isCurrent
      ? m.api_release_current()
      : lifecycleStatus.toLowerCase() === 'revised'
        ? m.api_release_revised()
        : lifecycleStatus.toLowerCase() === 'superseded'
          ? m.api_release_superseded()
          : lifecycleStatus,
)
let cardStyle = $derived(
  `--release-accent: ${accent}; --release-secondary: ${secondary}; --release-ink: ${ink}; background: var(--release-accent); transition-delay: ${isIntroActive ? index * 70 : 0}ms;`,
)

onMount(() => {
  const frame = window.requestAnimationFrame(() => {
    isIntroVisible = true
  })
  const timeout = window.setTimeout(
    () => {
      isIntroActive = false
    },
    index * 70 + 360,
  )

  return () => {
    window.cancelAnimationFrame(frame)
    window.clearTimeout(timeout)
  }
})
</script>
<a
  class={`group relative grid min-h-69 w-80 shrink-0 isolate overflow-hidden rounded-[1.1rem] border-[0.35rem] border-[#fff9ed] p-5 text-(--release-ink) shadow-[0_0.35rem_1rem_rgb(0_0_0/0.1)] transition-[opacity,translate,box-shadow] duration-360 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none before:absolute before:inset-0 before:z-0 before:bg-[linear-gradient(150deg,color-mix(in_srgb,var(--release-accent)_34%,#fff9ed),color-mix(in_srgb,var(--release-secondary)_18%,#fff9ed))] before:content-[''] after:pointer-events-none after:absolute after:inset-2 after:z-1 after:rounded-[0.62rem] after:border after:border-(--release-accent)/32 after:content-[''] hover:shadow-[0_0.6rem_1.4rem_rgb(0_0_0/0.14)] focus-visible:outline-none focus-visible:shadow-[0_0.6rem_1.4rem_rgb(0_0_0/0.14)] ${isIntroVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4.5'} ${isDragging ? 'shadow-[0_0.6rem_1.4rem_rgb(0_0_0/0.14)]' : ''}`}
  data-carousel-card={release.code}
  style={cardStyle}
  href={href ?? `/apis/${release.apiFamily}/${release.code}`}
>
  {#if isDraft}
    <span
      class="pointer-events-none absolute inset-0 z-1 bg-[linear-gradient(180deg,rgb(255_249_237/0.34),rgb(255_249_237/0.16)_48%,rgb(255_249_237/0.3))]"
      aria-hidden="true"
    ></span>
  {/if}
  <CardReleaseBackdrop {accent} {index} muted={isDraft} {isDragging} />
  {#if isDraft}
    <span
      class="pointer-events-none absolute inset-2 z-1 rounded-[0.62rem] border border-[#3c3028]/20"
      aria-hidden="true"
    ></span>
  {/if}
  <span class="relative z-2 flex items-start justify-between gap-4"
    ><span
      ><span
        class={`block font-body text-caption font-semibold uppercase tracking-[0.16em] ${isDraft ? 'text-[#5f4f44]' : 'opacity-76'}`}
        >{displayDate}</span
      ><span class="mt-3 block font-display text-[1.65rem] font-bold leading-none"
        >{theme?.name ?? release.apiFamily}</span
      ></span
    ><span
      class={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-body text-[0.7rem] leading-none font-semibold shadow-[inset_0_1px_rgb(255_255_255/0.3)] ${isCurrent ? 'min-w-20 justify-center border-[#00856a] bg-[#00856a] text-[#effff6]' : isSuperseded ? 'border-[#213238]/18 bg-[#fff9ed]/56 text-[#213238]/68' : isDraft ? 'border-[#3c3028]/28 bg-[#fff9ed]/58 text-[#3c3028]' : 'border-[#213238]/20 bg-[#fff9ed]/48 text-[#213238]/74'}`}
      >{#if isCurrent}
        <span class="size-1.5 rounded-full bg-[#b7f7d6]"></span>
      {/if}
      {statusLabel}</span
    ></span
  >
  <span
    class="relative z-2 mt-8 flex h-[3.7rem] flex-col justify-center font-mono text-[1.8rem] font-bold leading-[1.02]"
    ><span>v{displayCode}</span></span
  >
  <span
    class="relative z-2 mt-5 grid grid-cols-[minmax(8.5rem,1.2fr)_minmax(0,0.8fr)] gap-3 font-body text-caption"
    ><span
      class={`grid min-h-18 min-w-34 content-center border p-3 ${isDraft ? 'border-[#3c3028]/24 bg-[#fff9ed]/38' : 'border-[#213238]/24 bg-[#fff9ed]/42'}`}
      ><span class={isDraft ? 'text-[#3c3028]/72' : 'text-[#213238]/68'}
        >{m.data_schema()}</span
      ><span class="mt-1 font-mono text-[0.95rem] font-bold leading-none"
        >{release.schemaVersion}</span
      ></span
    ><span
      class={`grid min-h-18 content-center border p-3 ${isDraft ? 'border-[#3c3028]/24 bg-[#fff9ed]/38' : 'border-[#213238]/24 bg-[#fff9ed]/42'}`}
      ><span class={isDraft ? 'text-[#3c3028]/72' : 'text-[#213238]/68'}
        >{m.data_records()}</span
      ><span class="mt-1 font-mono text-[0.95rem] font-bold leading-none"
        >{records ?? m.data_pending()}</span
      ></span
    ></span
  >
  <span
    class={`relative z-2 mt-3 inline-flex items-center justify-self-end gap-1 font-body text-label-md font-semibold ${isDraft ? 'rounded border border-[#3c3028]/24 bg-[#fff9ed]/42 px-2 py-1' : ''}`}
    >{m.data_view_release()}
    <Icon
      icon="proicons:arrow-right"
      class={`size-4 transition group-hover:translate-x-1 ${isDragging ? 'translate-x-1' : ''}`}
    /></span
  >
</a>
