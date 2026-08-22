<script lang="ts">
import { apiFamilyThemes } from '#lib/registry/apiFamilyTheme.js'

type Props = {
  familyType: keyof typeof apiFamilyThemes
  href: string
  isComingSoon: boolean
}

let { familyType, href, isComingSoon }: Props = $props()
let theme = $derived(apiFamilyThemes[familyType])
</script>

<a
  class="group relative flex min-h-28 items-center justify-between overflow-hidden rounded-lg border border-border-card px-5 py-5 text-(--family-ink) shadow-card transition-shadow duration-200 hover:shadow-[0_0.5rem_1.2rem_rgb(0_0_0/0.14)] focus-visible:outline-none focus-visible:shadow-[0_0.5rem_1.2rem_rgb(0_0_0/0.14)] sm:px-6"
  style={`--family-accent: ${theme.colorway.primary}; --family-ink: ${theme.colorway.ink};`}
  {href}
>
  <span class="absolute inset-0 bg-(--family-accent)" aria-hidden="true"></span>
  <img
    class="pointer-events-none absolute top-1/2 right-[-8%] h-[145%] w-[70%] -translate-y-1/2 object-cover opacity-70 mix-blend-luminosity mask-l-from-15% mask-l-to-90%"
    src={theme.image}
    alt=""
    draggable="false"
  >
  <span
    class="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,var(--family-accent)_0%,color-mix(in_srgb,var(--family-accent)_56%,transparent)_40%,transparent_78%)]"
    aria-hidden="true"
  ></span>
  <span class="relative z-1 grid gap-1.5 text-white">
    <span class="font-display text-headline-sm font-bold leading-none"
      >{theme.name}</span
    >
    <span
      class="font-mono text-[0.72rem] font-bold tracking-[0.14em] uppercase opacity-85"
      >API FAMILY</span
    >
  </span>
  {#if isComingSoon}
    <span
      class="relative z-1 shrink-0 rounded-full border border-white/32 bg-white/18 px-2.5 py-1 font-body text-[0.7rem] font-semibold text-white"
      >Coming soon</span
    >
  {/if}
</a>
