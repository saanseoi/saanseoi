<script lang="ts">
import { onMount } from 'svelte'

import { getCurrentLocale, m } from '$lib/bits/internal/i18n'
import { coastlinePaths, ferryPaths } from '../../harbourMapData'
import type { HarbourPath } from '../../harbourMapData'

const foundationLabels = [
  {
    number: '01',
    eyebrow: () => m.foundation_humane_tech_eyebrow(),
    tone: 'humane',
    title: () => m.foundation_humane_tech_title(),
    description: () => m.foundation_humane_tech_description(),
    href: '/manifesto',
    cta: () => m.foundation_humane_tech_cta(),
    x: 34,
    y: 21,
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
    x: 78,
    y: 32,
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
    y: 78,
    align: 'left',
  },
] as const

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
const isRightAligned = (align: 'left' | 'right') => align === 'right'

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

<div
  bind:this={foundationSection}
  class="foundation-section"
  class:foundation-section-visible={isFoundationVisible}
>
  <div class="foundation-map">
    <svg
      class="foundation-harbour-map"
      viewBox="281 50 630 399"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-labelledby="foundation-map-title"
    >
      <title id="foundation-map-title">{m.foundation_title()}</title>
      <defs>
        <filter id="harbour-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.1" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id="foundation-map-clip">
          <rect width="1200" height="760" />
        </clipPath>
      </defs>

      <rect class="map-bg" width="1200" height="760" />
      <g class="map-noise" aria-hidden="true">
        {#each Array.from({ length: 112 }) as _, index}
          <circle
            cx={(index * 97) % 1200}
            cy={(index * 53) % 760}
            r={index % 7 === 0 ? 1.2 : 0.65}
          />
        {/each}
      </g>

      <g class="coastlines" filter="url(#harbour-glow)">
        {#each coastlinePaths as path}
          <path d={path.d} />
        {/each}
      </g>

      <g class="motion-paths" clip-path="url(#foundation-map-clip)" aria-hidden="true">
        {#each visibleVesselRoutes as route}
          <path id={route.id} d={route.d} />
        {/each}
        {#each orangeVesselRoutes as route}
          <path id={route.id} d={route.d} />
        {/each}
      </g>

      <g class="vessels" clip-path="url(#foundation-map-clip)" aria-hidden="true">
        {#each starFerryFleet as vessel}
          {#if vessel.route}
            <g class="vessel star-ferry-vessel">
              {#if isFoundationActive}
                <animateMotion
                  dur={`${vessel.duration}s`}
                  begin={`-${vessel.offset}s`}
                  repeatCount="indefinite"
                  rotate="auto"
                >
                  <mpath href={`#${vessel.route.id}`} />
                </animateMotion>
              {/if}
              <g transform={`scale(${vessel.scale})`}>
                <ellipse class="star-ferry-hull" cx="0" cy="0" rx="14" ry="4.8" />
                <ellipse class="star-ferry-top" cx="1.4" cy="0" rx="8.8" ry="2.6" />
              </g>
            </g>
          {/if}
        {/each}

        {#each orangeVesselFleet as vessel}
          {#if vessel.route}
            <g class={`vessel vessel-${vessel.tone}`}>
              {#if isFoundationActive}
                <animateMotion
                  dur={`${vessel.duration}s`}
                  begin={`-${vessel.offset}s`}
                  repeatCount="indefinite"
                  rotate="auto"
                >
                  <mpath href={`#${vessel.route.id}`} />
                </animateMotion>
              {/if}
              <g transform={`scale(${vessel.scale})`}>
                <path class="vessel-hull" d="M -9 -4.2 L 10 0 L -9 4.2 Z" />
              </g>
            </g>
          {/if}
        {/each}
      </g>
    </svg>

    <div class="foundation-center">
      <p class="foundation-eyebrow">What we offer</p>
      <h2>
        {#if getCurrentLocale() === 'en'}
          <span>Foundation for a Smarter,</span>
          <span>Accessible City</span>
        {:else}
          {m.foundation_title()}
        {/if}
      </h2>
    </div>

    <div class="foundation-labels">
      {#each foundationLabels as label}
        {#if label.tone === 'projects'}
          <div
            class={`foundation-label foundation-label-${label.tone}`}
            style={`--label-x: ${label.x}%; --label-y: ${label.y}%`}
            class:foundation-label-right={isRightAligned(label.align)}
          >
            <span class="foundation-label-number">{label.number}</span>
            <div
              class="foundation-label-eyebrow"
              class:foundation-label-eyebrow-cjk={usesCjkEyebrows}
            >
              <span class="foundation-label-eyebrow-number">{label.number}</span>
              <span class="foundation-label-eyebrow-divider">//</span>
              <span>{label.eyebrow()}</span>
            </div>
            <h3>{label.title()}</h3>
            <p><span>{@html label.description()}</span></p>
            <small>{m.foundation_community_apps_coming_soon()}</small>
          </div>
        {:else}
          <a
            class={`foundation-label foundation-label-${label.tone}`}
            href={label.href}
            style={`--label-x: ${label.x}%; --label-y: ${label.y}%`}
            class:foundation-label-right={isRightAligned(label.align)}
          >
            <span class="foundation-label-number">{label.number}</span>
            <div
              class="foundation-label-eyebrow"
              class:foundation-label-eyebrow-cjk={usesCjkEyebrows}
            >
              {#if label.tone === 'data'}
                <span>{label.eyebrow()}</span>
                <span class="foundation-label-eyebrow-divider">//</span>
                <span class="foundation-label-eyebrow-data-number">{label.number}</span>
              {:else}
                <span class="foundation-label-eyebrow-number">{label.number}</span>
                <span class="foundation-label-eyebrow-divider">//</span>
                <span>{label.eyebrow()}</span>
              {/if}
            </div>
            <h3>{label.title()}</h3>
            <p><span>{@html label.description()}</span></p>
            <small>{label.cta()} ↗</small>
          </a>
        {/if}
      {/each}
    </div>
  </div>
</div>
