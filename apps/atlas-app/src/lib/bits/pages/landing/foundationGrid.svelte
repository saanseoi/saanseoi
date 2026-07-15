<script lang="ts">
import { onMount } from 'svelte'

import { getCurrentLocale, m } from '$lib/bits/internal/i18n'
import { coastlinePaths, ferryPaths } from './harbourMapData'
import type { HarbourPath } from './harbourMapData'

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

<section
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
</section>

<style>
.foundation-section {
  isolation: isolate;
}

.foundation-map {
  --landing-header-height: 4.5rem;
  --foundation-map-background: #feffeb;
  position: relative;
  min-height: clamp(38rem, 56vw, 47rem);
  height: max(clamp(38rem, 56vw, 47rem), calc(100svh - var(--landing-header-height)));
  overflow: hidden;
  background: var(--foundation-map-background);
}

:global(.dark) .foundation-map {
  --foundation-map-background: var(--surface);
}

.foundation-harbour-map {
  position: absolute;
  inset: -2px;
  width: calc(100% + 4px);
  height: calc(100% + 4px);
}

.map-bg {
  fill: var(--foundation-map-background);
}

.map-noise circle {
  fill: color-mix(in srgb, var(--secondary) 22%, transparent);
  opacity: 0.5;
}

.coastlines {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke: var(--secondary);
  stroke-width: 0.925;
  opacity: 0.64;
}

.motion-paths {
  visibility: hidden;
}

.vessel {
  opacity: 0.72;
}

.vessel-hull {
  fill: var(--on-tertiary-container);
  stroke: color-mix(in srgb, #0e0e0c 82%, transparent);
  stroke-width: 0.35;
  shape-rendering: geometricPrecision;
}

.star-ferry-hull {
  fill: color-mix(in srgb, var(--secondary-fixed-dim) 72%, #163b2e);
  stroke: color-mix(in srgb, #0e0e0c 86%, transparent);
  stroke-width: 1.15;
}

.star-ferry-top {
  fill: color-mix(in srgb, var(--secondary-fixed-dim) 78%, #ffffff);
  stroke: none;
}

.vessel-warm .vessel-hull {
  fill: var(--tertiary-fixed-dim);
}

.vessel-dim {
  opacity: 0.48;
}

.vessel-dim .vessel-hull {
  fill: color-mix(in srgb, var(--on-tertiary-container) 70%, transparent);
}

.foundation-center {
  position: absolute;
  top: 52%;
  left: 50%;
  z-index: 5;
  width: min(70rem, calc(100% - 3rem));
  text-align: center;
  transform: translate(-50%, -50%);
}

.foundation-center::before {
  display: none;
}

.foundation-eyebrow {
  font-family: var(--font-body);
  font-size: 0.76rem;
  font-weight: 900;
  color: var(--secondary);
  text-transform: uppercase;
  letter-spacing: 0.14em;
}

.foundation-eyebrow span,
.foundation-label-number {
  font-family: var(--font-display);
  font-size: 0.8rem;
  font-weight: 900;
  letter-spacing: 0;
  color: var(--label-accent, var(--secondary-fixed-dim));
}

.foundation-label-number {
  display: inline-block;
}

.foundation-label-eyebrow {
  display: inline-flex;
  gap: 0.25rem;
  align-items: baseline;
  padding: 0.12rem 0.32rem;
  margin-left: 0;
  font-family: var(--font-body);
  font-size: 0.76rem;
  font-weight: 900;
  color: var(--secondary);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  background: var(--foundation-map-background);
}

.foundation-label-eyebrow-cjk {
  translate: 0 -2px;
}

.foundation-label-data .foundation-label-eyebrow {
  margin-left: 0;
  padding-right: 0;
}

.foundation-center h2 {
  margin-inline: auto;
  margin-top: 0.85rem;
  font-family: var(--font-display);
  font-size: clamp(2rem, 5.2vw, 5rem);
  font-weight: 900;
  line-height: 0.92;
  color: var(--primary);
  text-shadow: 0 1px 0 var(--foundation-map-background);
  text-wrap: balance;
}

.foundation-center h2 span {
  display: block;
}

.foundation-center p {
  max-width: 34rem;
  margin: 1.05rem auto 0;
  font-family: var(--font-body);
  font-size: clamp(0.94rem, 1.2vw, 1.06rem);
  line-height: 1.7;
  color: color-mix(in srgb, var(--foreground-alt) 78%, transparent);
}

.foundation-labels {
  position: absolute;
  inset: 0;
  z-index: 4;
}

.foundation-label {
  --label-accent: var(--secondary-fixed-dim);
  position: absolute;
  top: var(--label-y);
  left: var(--label-x);
  display: block;
  width: min(18.5rem, 23vw);
  color: var(--primary);
  text-decoration: none;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition:
    opacity 620ms ease,
    translate 620ms cubic-bezier(0.2, 0.7, 0.2, 1),
    filter 240ms ease;
  translate: 0 0.75rem;
}

.foundation-label::before {
  display: none;
}

.foundation-label-right {
  text-align: right;
}

.foundation-label:hover,
.foundation-label:focus-visible {
  outline: none;
}

.foundation-label-data {
  --label-accent: var(--tertiary-fixed-dim);
}

.foundation-label-humane {
  --label-accent: var(--tertiary-fixed-dim);
}

.foundation-label-projects {
  --label-accent: var(--tertiary-fixed-dim);
}

.foundation-label h3 {
  margin-top: 0.2rem;
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 2.75vw, 3.05rem);
  font-weight: 900;
  line-height: 0.9;
  color: var(--primary);
  text-shadow: 0 1px 0 var(--foundation-map-background);
}

.foundation-label p {
  display: block;
  max-width: 22rem;
  margin-top: 0.8rem;
  font-family: var(--font-body);
  font-size: clamp(0.9rem, 1.1vw, 1.05rem);
  line-height: 1.65;
  text-wrap: balance;
  color: color-mix(in srgb, var(--foreground-alt) 82%, transparent);
  background: transparent;
}

.foundation-label p > span {
  padding: 0.08rem 0.26rem 0.14rem;
  background: color-mix(in srgb, var(--foundation-map-background) 90%, transparent);
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.foundation-label-right p {
  margin-left: auto;
}

.foundation-label small {
  display: block;
  width: fit-content;
  padding: 0.12rem 0.3rem 0.16rem;
  margin-top: 0.65rem;
  font-family: var(--font-body);
  font-size: 0.82rem;
  font-weight: 800;
  color: var(--on-tertiary-container);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: color-mix(in srgb, var(--foundation-map-background) 92%, transparent);
}

.foundation-label-right small {
  margin-left: auto;
}

:global(.dark) .foundation-center h2,
:global(.dark) .foundation-label,
:global(.dark) .foundation-label h3 {
  color: #ffffff;
}

:global(.dark) .foundation-center p,
:global(.dark) .foundation-label p {
  color: rgb(255 255 255 / 0.78);
}

:global(.dark) .foundation-label h3 {
  text-shadow: 0 1px 0 var(--foundation-map-background);
}

:global(.dark) .foundation-label p,
:global(.dark) .foundation-label small {
  background: transparent;
}

:global(.dark) .foundation-label p > span,
:global(.dark) .foundation-label small {
  background: rgb(19 19 17 / 0.86);
}

.foundation-section-visible .foundation-label {
  opacity: 1;
  translate: 0 0;
}

.foundation-section-visible .foundation-label-humane {
  transition-delay: 140ms;
}

.foundation-section-visible .foundation-label-data {
  transition-delay: 240ms;
}

.foundation-section-visible .foundation-label-projects {
  transition-delay: 340ms;
}

@media (min-width: 768px) {
  .foundation-center .foundation-eyebrow,
  .foundation-center p {
    display: none;
  }
}

@media (min-width: 786px) {
  .foundation-label {
    width: min(22rem, 32vw);
  }

  .foundation-label-data {
    width: min(25rem, 39vw);
  }

  .foundation-label-data p {
    max-width: 26rem;
  }

  .foundation-label > .foundation-label-number {
    display: none;
  }
}

@media (min-width: 786px) and (max-width: 1080px) {
  .foundation-label-data {
    right: 5%;
    left: auto;
    transform: translateY(-50%);
  }
}

@media (max-width: 785px) {
  .foundation-map {
    height: auto;
    min-height: auto;
  }

  .foundation-harbour-map {
    position: relative;
    inset: auto;
    width: 100%;
    height: 30rem;
  }

  .foundation-center {
    top: 15rem;
    width: min(32rem, calc(100% - 1rem));
  }

  .foundation-center h2 {
    font-size: clamp(1.35rem, 6.2vw, 2.5rem);
  }

  .foundation-labels {
    position: relative;
    inset: auto;
    display: grid;
    width: min(30rem, calc(100% - 2.5rem));
    gap: 1.25rem;
    justify-items: center;
    margin-inline: auto;
    padding: 0.5rem 1.25rem 2.75rem;
  }

  .foundation-label {
    --mobile-marker-size: 4.25rem;
    position: relative;
    top: auto;
    left: auto;
    width: 100%;
    min-height: 12rem;
    padding: 1.05rem 0 1.05rem calc(var(--mobile-marker-size) + 1rem);
    text-align: left;
    transform: none;
    opacity: 1;
    translate: 0 0;
  }

  .foundation-label:nth-child(2) {
    --mobile-marker-offset: calc(var(--mobile-marker-size) + 0.5rem);
    justify-self: stretch;
    width: 100%;
    padding-right: var(--mobile-marker-offset);
    padding-left: 0;
    text-align: right;
  }

  .foundation-label:nth-child(3) {
    justify-self: stretch;
    width: 100%;
  }

  .foundation-label::before {
    display: none;
  }

  .foundation-label::after {
    position: absolute;
    top: calc(1.05rem + var(--mobile-marker-size));
    left: calc(var(--mobile-marker-size) / 2);
    width: 1px;
    height: calc(100% - 1.1rem);
    content: "";
    background: linear-gradient(
      to bottom,
      color-mix(in srgb, var(--label-accent) 56%, transparent),
      transparent
    );
  }

  .foundation-label:nth-child(2)::after {
    right: calc(var(--mobile-marker-size) / 2);
    left: auto;
  }

  .foundation-label-number {
    position: absolute;
    top: 1.05rem;
    left: 0;
    z-index: 1;
    display: inline-grid;
    width: var(--mobile-marker-size);
    aspect-ratio: 1;
    place-items: center;
    border: 1px solid currentColor;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 11%, var(--surface-container-lowest));
    box-shadow:
      0 0 0 0.34rem color-mix(in srgb, currentColor 7%, transparent),
      0 0.85rem 2rem rgb(0 0 0 / 0.16);
    font-size: 1.45rem;
    line-height: 1;
    transform: none;
  }

  .foundation-label-eyebrow {
    display: block;
    padding: 0;
    margin-left: 0;
    font-size: 0.72rem;
  }

  .foundation-label-eyebrow-number {
    display: none;
  }

  .foundation-label-eyebrow-divider,
  .foundation-label-eyebrow-data-number {
    display: none;
  }

  .foundation-label-number::before {
    position: absolute;
    inset: -0.34rem;
    z-index: -1;
    content: "";
    border: 2px solid currentColor;
    border-radius: inherit;
    opacity: 0.42;
    transform: scale(0.94);
  }

  .foundation-label:nth-child(2) > .foundation-label-number {
    right: 0;
    left: auto;
  }

  .foundation-label h3 {
    margin-top: 0.55rem;
    font-size: clamp(2.05rem, 10.5vw, 3.15rem);
  }

  .foundation-label p {
    display: block;
    width: min(20.5rem, calc(100% + 2rem));
    max-width: none;
    padding: 0;
    margin-top: 0.9rem;
    background: transparent;
  }

  .foundation-label small {
    margin-top: 0.95rem;
    padding: 0;
    background: transparent;
  }

  .foundation-label-right p {
    margin-left: auto;
  }

  .foundation-label-right small {
    margin-left: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .foundation-label {
    opacity: 1;
    translate: 0 0;
    transition: none;
  }
}
</style>
