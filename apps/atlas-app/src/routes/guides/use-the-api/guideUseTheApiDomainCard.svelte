<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import topoImage from '#lib/assets/topo.jpg'
import { apiFamilyThemes } from '#lib/registry/apiFamilyTheme.js'
import { getReleaseVersionLabel } from '#lib/registry/releaseCode.js'

type Props = {
  code: string
  description?: string | null
  familyType: keyof typeof apiFamilyThemes
  href: string | null
  isComingSoon: boolean
  latestReleaseCode: string | null
  name: string
}

let {
  code,
  description,
  familyType,
  href,
  isComingSoon,
  latestReleaseCode,
  name,
}: Props = $props()
let theme = $derived(apiFamilyThemes[familyType])
let latestVersion = $derived(
  latestReleaseCode ? getReleaseVersionLabel(latestReleaseCode, familyType) : null,
)
</script>

<article
  class="group relative flex min-h-76 flex-col overflow-hidden rounded-[1.1rem] border-[0.35rem] border-[#fff9ed] p-5 text-(--family-ink) shadow-[0_0.35rem_1rem_rgb(0_0_0/0.1)] transition-shadow duration-250 hover:shadow-[0_0.55rem_1.3rem_rgb(0_0_0/0.14)] focus-within:shadow-[0_0.55rem_1.3rem_rgb(0_0_0/0.14)] before:absolute before:inset-0 before:z-0 before:bg-[linear-gradient(150deg,color-mix(in_srgb,var(--family-accent)_34%,#fff9ed),color-mix(in_srgb,var(--family-secondary)_18%,#fff9ed))] before:content-[''] after:pointer-events-none after:absolute after:inset-2 after:z-1 after:rounded-[0.62rem] after:border after:border-(--family-accent)/32 after:content-['']"
  style={`--family-accent: ${theme.colorway.primary}; --family-secondary: ${theme.colorway.secondary}; --family-ink: ${theme.colorway.ink};`}
>
  <span
    class="domain-card-scene pointer-events-none absolute inset-0 z-1 overflow-hidden"
    aria-hidden="true"
  >
    <span
      class="absolute inset-[-10%] bg-(image:--family-topo-image) bg-size-[44rem_auto] bg-position-[var(--family-topo-x)_var(--family-topo-y)] opacity-[0.14] mix-blend-multiply"
      style={`--family-topo-image: url('${topoImage}'); --family-topo-x: ${(code.length * 13) % 70}%; --family-topo-y: ${(code.length * 19) % 70}%;`}
    ></span>
    <img
      class="domain-card-image absolute right-[-8%] bottom-[-15%] h-[108%] w-[62%] object-cover opacity-30 mix-blend-multiply"
      src={theme.image}
      alt=""
      draggable="false"
    >
  </span>

  <span class="relative z-2 flex items-start justify-between gap-3">
    <span
      class="font-mono text-[0.62rem] font-bold tracking-[0.16em] uppercase opacity-72"
      >{code}</span
    >
    {#if latestVersion}
      <span
        class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#00856a] bg-[#00856a] px-2.5 py-1 font-body text-[0.7rem] leading-none font-semibold text-[#effff6]"
      >
        <span class="size-1.5 rounded-full bg-[#b7f7d6]"></span>
        {latestVersion}
      </span>
    {/if}
  </span>

  <h4 class="relative z-2 mt-3 font-display text-[1.65rem] font-bold leading-none">
    {name}
  </h4>
  {#if description}
    <p
      class="relative z-2 mt-3 max-w-[15rem] font-body text-body-sm leading-6 opacity-78"
    >
      {description}
    </p>
  {/if}

  {#if !isComingSoon}
    <div class="relative z-2 mt-auto flex justify-end pt-6">
      {#if href}
        <a
          class="inline-flex items-center gap-1 font-body text-label-md font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--family-ink)"
          {href}
          >How to use
          <Icon icon="proicons:arrow-right" class="size-4" /></a
        >
      {:else}
        <span class="font-body text-label-md font-semibold opacity-76">
          No published release notes yet.
        </span>
      {/if}
    </div>
  {/if}
</article>

<style>
.domain-card-scene {
  transition: transform 360ms cubic-bezier(0.33, 1, 0.68, 1);
}
.group:hover .domain-card-scene,
.group:focus-within .domain-card-scene {
  transform: scale(1.045);
}
.domain-card-image {
  mask-image:
    linear-gradient(to bottom, transparent 0%, black 36%, black 100%),
    linear-gradient(to right, transparent 0%, black 56%, black 100%);
  mask-composite: intersect;
  -webkit-mask-image:
    linear-gradient(to bottom, transparent 0%, black 36%, black 100%),
    linear-gradient(to right, transparent 0%, black 56%, black 100%);
  -webkit-mask-composite: source-in;
}
</style>
