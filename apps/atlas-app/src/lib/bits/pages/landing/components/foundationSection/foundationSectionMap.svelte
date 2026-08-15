<script lang="ts">
import { onMount } from 'svelte'

import { getCurrentLocale, m } from '#lib/bits/internal/i18n.js'
import { coastlinePaths, ferryPaths } from '../../harbourMapData'
import type { HarbourPath } from '../../harbourMapData'
import FoundationSectionBaseMap from './foundationSectionBaseMap.svelte'
import FoundationSectionBlock from './foundationSectionBlock.svelte'
import FoundationSectionBlockWrapper from './foundationSectionBlockWrapper.svelte'
import type { FoundationSectionLabel } from './foundationSectionBlock.svelte'
import FoundationSectionCoastlines from './foundationSectionCoastlines.svelte'
import FoundationSectionMotionPaths from './foundationSectionMotionPaths.svelte'
import FoundationSectionNoise from './foundationSectionNoise.svelte'
import FoundationSectionTitle from './foundationSectionTitle.svelte'
import FoundationSectionVessels from './foundationSectionVessels.svelte'

const foundationLabels = [
  {
    number: '01',
    eyebrow: () => m.foundation_humane_tech_eyebrow(),
    tone: 'humane',
    title: () => m.foundation_humane_tech_title(),
    description: () => m.foundation_humane_tech_description(),
    href: '/manifesto',
    cta: () => m.foundation_humane_tech_cta(),
    x: 33,
    y: 14,
    align: 'left',
  },
  {
    number: '02',
    eyebrow: () => m.foundation_public_data_eyebrow(),
    tone: 'data',
    title: () => m.foundation_public_data_title(),
    description: () => m.foundation_public_data_description(),
    href: '/data',
    cta: () => m.foundation_public_data_cta(),
    x: 83,
    y: 27,
    align: 'right',
  },
  {
    number: '03',
    eyebrow: () => m.foundation_community_apps_eyebrow(),
    tone: 'projects',
    title: () => m.foundation_community_apps_title(),
    description: () => m.foundation_community_apps_description(),
    href: '/projects',
    cta: () => m.foundation_community_apps_cta(),
    x: 30,
    y: 63,
    align: 'left',
  },
] as const satisfies readonly FoundationSectionLabel[]

const visibleFerryRouteNames = [
  '香港水上的士 Hong Kong Water Taxi',
  '中環—尖沙咀 Central - Tsim Sha Tsui',
  '灣仔—尖沙咀 Wan Chai - Tsim Sha Tsui',
  '北角—紅磡 North Point - Hung Hom',
  '北角—觀塘 North Point - Kwun Tong',
  '北角—觀塘—啟德 North Point - Kai Tak - Kwun Tong',
  '西灣河—觀塘 Sai Wan Ho - Kwun Tong',
  '中國客運碼頭-港澳碼頭 China Ferry Terminal - Hong Kong-Macao Ferry Terminal',
] as const

const harbourFerryPaths: readonly HarbourPath[] = ferryPaths
const visibleVesselRoutes = visibleFerryRouteNames.flatMap((name, index) => {
  const route = harbourFerryPaths.find(path => path.name === name)

  return route ? [{ id: `visible-ferry-route-${index}`, d: route.d }] : []
})

const orangeVesselRoutes = ferryPaths
  .filter(path => path.length && path.length > 80)
  .slice(0, 28)
  .map((path, index) => ({ id: `orange-ferry-route-${index}`, d: path.d }))

const starFerryFleet = Array.from({ length: 8 }, (_, index) => {
  const route = visibleVesselRoutes[index % visibleVesselRoutes.length]

  return {
    route,
    duration: 36 + (index % 4) * 5,
    offset: (index * 17) % 97,
    scale: 0.24 + (index % 3) * 0.03,
  }
})

const orangeVesselFleet = Array.from({ length: 60 }, (_, index) => {
  const route = orangeVesselRoutes[index % orangeVesselRoutes.length]

  return {
    route,
    duration: Math.round((46 + (index % 9) * 7 + Math.floor(index / 9) * 4) / 0.4875),
    offset: (index * 11) % 103,
    scale: 0.34 + (index % 5) * 0.05,
    tone: index % 7 === 0 ? 'warm' : index % 5 === 0 ? 'dim' : 'light',
  }
})

let foundationSection = $state<HTMLElement>()
let isFoundationVisible = $state(false)
let isFoundationActive = $state(false)
const usesCjkEyebrows = $derived(getCurrentLocale() !== 'en')

onMount(() => {
  if (!foundationSection) return

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry) return

      isFoundationActive =
        entry.isIntersecting &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (entry.isIntersecting) isFoundationVisible = true
    },
    { rootMargin: '20% 0px', threshold: 0.01 },
  )

  observer.observe(foundationSection)

  return () => observer.disconnect()
})
</script>

<div bind:this={foundationSection} class="isolate">
  <FoundationSectionBaseMap>
    {#snippet map()}
      <FoundationSectionNoise />
      <FoundationSectionCoastlines paths={coastlinePaths} />
      <FoundationSectionMotionPaths
        visibleRoutes={visibleVesselRoutes}
        orangeRoutes={orangeVesselRoutes}
      />
      <FoundationSectionVessels
        isActive={isFoundationActive}
        {starFerryFleet}
        {orangeVesselFleet}
      />
    {/snippet}

    <FoundationSectionTitle />

    <FoundationSectionBlockWrapper>
      {#each foundationLabels as label}
        <FoundationSectionBlock
          {label}
          isVisible={isFoundationVisible}
          {usesCjkEyebrows}
        />
      {/each}
    </FoundationSectionBlockWrapper>
  </FoundationSectionBaseMap>
</div>
