<script lang="ts">
import Icon from '@iconify/svelte'
import { onMount } from 'svelte'

import { m } from '$lib/bits/internal/i18n'

let pipelineSection = $state<HTMLElement>()
let isPipelineActive = $state(false)
let isPipelineRevealed = $state(false)
let isPipelineWide = $state(false)

onMount(() => {
  if (!pipelineSection) return

  const pipelineWidthQuery = window.matchMedia('(min-width: 768px)')
  const updatePipelineWidth = () => {
    isPipelineWide = pipelineWidthQuery.matches
  }

  updatePipelineWidth()
  pipelineWidthQuery.addEventListener('change', updatePipelineWidth)

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry) return

      isPipelineActive =
        entry.isIntersecting &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (entry.isIntersecting) isPipelineRevealed = true
    },
    { rootMargin: '20% 0px', threshold: 0.01 },
  )

  observer.observe(pipelineSection)

  return () => {
    observer.disconnect()
    pipelineWidthQuery.removeEventListener('change', updatePipelineWidth)
  }
})
</script>

<div
  bind:this={pipelineSection}
  class="landing-pipeline"
  class:landing-pipeline-active={isPipelineActive}
  class:landing-pipeline-revealed={isPipelineRevealed}
>
  <div class="pipeline-panel">
    <div class="landing-section-header">
      <div>
        <h2>{m.pipeline_title()}</h2>
        <p>{m.pipeline_description()}</p>
      </div>
    </div>

    <div class="pipeline">
      <div class="pipeline-wave-field" aria-hidden="true"></div>
      {#if isPipelineWide}
        <svg
          class="pipeline-arc"
          viewBox="0 0 1000 240"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="pipeline-arc-arrow"
              viewBox="0 0 10 10"
              refX="7.2"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z"></path>
            </marker>
          </defs>
          <path
            id="pipeline-arc-left-path"
            class="pipeline-arc-left"
            d="M166.667 157 C278 20 403 20 500 210"
          ></path>
          <path
            id="pipeline-arc-right-path"
            class="pipeline-arc-right"
            d="M500 210 C597 20 722 20 833.333 157"
          ></path>
          <circle class="pipeline-traveler pipeline-traveler-source" r="6">
            {#if isPipelineActive}
              <animateMotion
                dur="6s"
                repeatCount="indefinite"
                keyPoints="0;0;1;1"
                keyTimes="0;0.12;0.47;1"
                keySplines="0 0 1 1; 0.2 0.7 0.2 1; 0 0 1 1"
                calcMode="spline"
              >
                <mpath href="#pipeline-arc-left-path" />
              </animateMotion>
            {/if}
          </circle>
          <circle class="pipeline-traveler pipeline-traveler-release" r="6">
            {#if isPipelineActive}
              <animateMotion
                dur="6s"
                repeatCount="indefinite"
                keyPoints="0;0;1;1"
                keyTimes="0;0.47;0.82;1"
                keySplines="0 0 1 1; 0.2 0.7 0.2 1; 0 0 1 1"
                calcMode="spline"
              >
                <mpath href="#pipeline-arc-right-path" />
              </animateMotion>
            {/if}
          </circle>
        </svg>
      {/if}

      <div class="pipeline-stages">
        <a class="pipeline-stage pipeline-stage-source relative py-8" href="/sources">
          <div class="pipeline-artifacts" aria-hidden="true">
            <span class="artifact artifact-raw artifact-raw-coord">
              {m.pipeline_source_artifact_coordinates()}
            </span>
            <span class="artifact artifact-raw artifact-raw-ref"
              >{m.pipeline_source_artifact_reference_system()}</span
            >
            <span class="artifact artifact-raw artifact-raw-meter">
              {m.pipeline_source_artifact_measurements()}
            </span>
          </div>
          <span
            class="pipeline-number pipeline-number-source text-(--pipeline-source)"
            aria-hidden="true"
          >
            01
          </span>
          <p
            class="mt-5 font-body text-label-md font-semibold uppercase tracking-[0.18em] text-(--pipeline-source)"
          >
            {m.pipeline_sources_eyebrow()}
          </p>
          <h2 class="mt-1 font-display text-headline-md font-bold text-primary">
            {m.pipeline_sources_title()}
          </h2>
          <p class="mt-2 max-w-xs font-body text-body-md leading-6 text-foreground-alt">
            {m.pipeline_sources_description()}
          </p>
        </a>
        <div
          class="pipeline-arrow hidden items-center px-2 text-3xl font-bold text-foreground-alt"
          aria-hidden="true"
        >
          <Icon icon="proicons:arrow-right" class="size-8" />
        </div>
        <a
          class="pipeline-stage pipeline-stage-release relative py-8"
          href="/data#releases"
        >
          <div class="pipeline-artifacts" aria-hidden="true">
            <span class="artifact artifact-release artifact-release-square"></span>
            <span class="artifact artifact-release artifact-release-circle"></span>
            <span class="artifact artifact-release artifact-release-label">
              {m.pipeline_releases_artifact_azimuth()}
            </span>
            <span class="artifact artifact-release artifact-release-grid"></span>
            <span class="artifact artifact-release artifact-release-bars"></span>
          </div>
          <span
            class="pipeline-number pipeline-number-release text-tertiary"
            aria-hidden="true"
          >
            02
          </span>
          <p
            class="mt-5 font-body text-label-md font-semibold uppercase tracking-[0.18em] text-tertiary"
          >
            {m.pipeline_releases_eyebrow()}
          </p>
          <h2 class="mt-1 font-display text-headline-md font-bold text-primary">
            {m.pipeline_releases_title()}
          </h2>
          <p class="mt-2 max-w-xs font-body text-body-md leading-6 text-foreground-alt">
            {m.pipeline_releases_description()}
          </p>
        </a>
        <div
          class="pipeline-arrow hidden items-center px-2 text-3xl font-bold text-foreground-alt"
          aria-hidden="true"
        >
          <Icon icon="proicons:arrow-right" class="size-8" />
        </div>
        <a class="pipeline-stage pipeline-stage-api relative py-8" href="/data#apis">
          <div class="pipeline-artifacts" aria-hidden="true">
            <span class="artifact artifact-api artifact-api-target"></span>
            <span class="artifact artifact-api artifact-api-latency">
              {m.pipeline_apis_artifact_latency()}
            </span>
            <span class="artifact artifact-api artifact-api-coord">
              {@html m.pipeline_apis_artifact_coordinates()}
            </span>
            <span class="artifact artifact-api artifact-api-status"
              >{m.pipeline_apis_artifact_status()}</span
            >
          </div>
          <span
            class="pipeline-number pipeline-number-api text-secondary"
            aria-hidden="true"
          >
            03
          </span>
          <p
            class="mt-5 font-body text-label-md font-semibold uppercase tracking-[0.18em] text-secondary"
          >
            {m.pipeline_apis_eyebrow()}
          </p>
          <h2 class="mt-1 font-display text-headline-md font-bold text-primary">
            {m.pipeline_apis_title()}
          </h2>
          <p class="mt-2 max-w-xs font-body text-body-md leading-6 text-foreground-alt">
            {m.pipeline_apis_description()}
          </p>
        </a>
      </div>
    </div>
  </div>
</div>
