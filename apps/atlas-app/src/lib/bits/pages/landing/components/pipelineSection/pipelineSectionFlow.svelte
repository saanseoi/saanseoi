<script lang="ts">
import { onMount } from 'svelte'

import { m } from '$lib/bits/internal/i18n'
import PipelineSectionArrow from './pipelineSectionArrow.svelte'
import PipelineSectionArtefactsApi from './pipelineSectionArtefactsApi.svelte'
import PipelineSectionArtefactsBundle from './pipelineSectionArtefactsBundle.svelte'
import PipelineSectionArtefactsRaw from './pipelineSectionArtefactsRaw.svelte'
import PipelineSectionAnnotation from './pipelineSectionAnnotation.svelte'
import PipelineSectionBlock from './pipelineSectionBlock.svelte'
import PipelineSectionBlockWrapper from './pipelineSectionBlockWrapper.svelte'
import PipelineSectionContent from './pipelineSectionContent.svelte'
import PipelineSectionHeader from './pipelineSectionHeader.svelte'

let pipelineSection = $state<HTMLElement>()
let isPipelineActive = $state(false)
let isPipelineRevealed = $state(false)
let isPipelineWide = $state(false)

onMount(() => {
  if (!pipelineSection) return
  const query = window.matchMedia('(min-width: 768px)')
  const update = () => {
    isPipelineWide = query.matches
  }
  update()
  query.addEventListener('change', update)
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
    query.removeEventListener('change', update)
  }
})
</script>

<div bind:this={pipelineSection}>
  <PipelineSectionContent isActive={isPipelineActive} isRevealed={isPipelineRevealed}>
    <PipelineSectionHeader />
    <PipelineSectionAnnotation />
    <div
      class="pipeline relative isolate mt-[clamp(1rem,4svh,3rem)] py-[clamp(2rem,6svh,4rem)]"
    >
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
      <PipelineSectionBlockWrapper>
        <PipelineSectionBlock
          tone="source"
          href="/sources"
          number="01"
          eyebrow={m.pipeline_sources_eyebrow()}
          title={m.pipeline_sources_title()}
          description={m.pipeline_sources_description()}
        >
          <PipelineSectionArtefactsRaw
            coordinates={m.pipeline_source_artifact_coordinates()}
            referenceSystem={m.pipeline_source_artifact_reference_system()}
            measurements={m.pipeline_source_artifact_measurements()}
          />
        </PipelineSectionBlock>
        <PipelineSectionArrow />
        <PipelineSectionBlock
          tone="release"
          href="/data#releases"
          number="02"
          eyebrow={m.pipeline_releases_eyebrow()}
          title={m.pipeline_releases_title()}
          description={m.pipeline_releases_description()}
        >
          <PipelineSectionArtefactsBundle
            azimuth={m.pipeline_releases_artifact_azimuth()}
          />
        </PipelineSectionBlock>
        <PipelineSectionArrow />
        <PipelineSectionBlock
          tone="api"
          href="/data#apis"
          number="03"
          eyebrow={m.pipeline_apis_eyebrow()}
          title={m.pipeline_apis_title()}
          description={m.pipeline_apis_description()}
        >
          <PipelineSectionArtefactsApi
            latency={m.pipeline_apis_artifact_latency()}
            coordinates={m.pipeline_apis_artifact_coordinates()}
            status={m.pipeline_apis_artifact_status()}
          />
        </PipelineSectionBlock>
      </PipelineSectionBlockWrapper>
    </div>
  </PipelineSectionContent>
</div>
