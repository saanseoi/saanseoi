<script lang="ts">
import GuideInstructionCallout from '../../components/createAMap/guideInstructionCallout.svelte'

import { landAnalysisPath } from './guideUrbanDensityLiveableMap.ts'

type Props = {
  approachSteps: string[]
  closeLabel: string
  description: string
  introduction: string
  landClippedGeometry: string
  nonLiveableLand: string
  resourceDownloadJsonResult: string
  resourceDownloadInstructions: string
  resourceDownloadInstructionsTitle: string
  explanation: string
  resourceExplanation: string
  resourceSkipSection: string
  resourceTitle: string
  tileZoomCalloutDescription: string
  tileZoomCalloutLabel: string
  tileZoomCalloutTitle: string
  turfExplanation: string
}

let {
  approachSteps,
  closeLabel,
  description,
  introduction,
  landClippedGeometry,
  nonLiveableLand,
  resourceDownloadJsonResult,
  resourceDownloadInstructions,
  resourceDownloadInstructionsTitle,
  explanation,
  resourceExplanation,
  resourceSkipSection,
  resourceTitle,
  tileZoomCalloutDescription,
  tileZoomCalloutLabel,
  tileZoomCalloutTitle,
  turfExplanation,
}: Props = $props()

let downloadInstructionsDialog: HTMLDialogElement

const scrollToFinaliseMap = (event: MouseEvent) => {
  event.preventDefault()
  document.getElementById('project-finalise-map')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
  history.pushState(null, '', '#project-finalise-map')
}
</script>

<div class="space-y-5">
  <p class="font-body text-body-lg leading-8 text-foreground-alt">
    {@html introduction}
  </p>
  <aside
    class="min-w-0 max-w-full overflow-hidden rounded-sm bg-[repeating-linear-gradient(135deg,var(--secondary)_0_7px,var(--surface-container-high)_7px_14px)] p-3"
  >
    <div
      class="bg-surface-container-low px-6 py-5 pt-8 font-body text-body-lg leading-8 text-foreground-alt sm:px-10"
    >
      <p
        class="font-display text-title-xl font-bold leading-5 tracking-tight text-secondary"
      >
        {@html resourceTitle}
      </p>
      <p class="mt-2">
        {@html resourceExplanation}
      </p>
      <div class="mt-5 flex flex-wrap justify-end gap-3">
        <a
          class="inline-flex items-center border border-secondary bg-secondary px-4 py-2 font-body text-label-md font-semibold text-on-secondary transition-colors hover:bg-secondary/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          download="land-analysis.json"
          href={landAnalysisPath}
          onclick={() => downloadInstructionsDialog.showModal()}
        >
          {resourceDownloadJsonResult}
        </a>
        <a
          class="inline-flex items-center border border-secondary px-4 py-2 font-body text-label-md font-semibold text-secondary transition-colors hover:bg-secondary-container/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          href="#project-finalise-map"
          onclick={scrollToFinaliseMap}
        >
          {resourceSkipSection}
        </a>
      </div>
    </div>
  </aside>
  <dialog
    bind:this={downloadInstructionsDialog}
    class="m-auto w-[calc(100%-2rem)] max-w-lg border border-border-card bg-surface-container-low p-0 text-foreground shadow-2xl backdrop:bg-black/55"
    aria-labelledby="land-analysis-download-title"
  >
    <form method="dialog" class="p-6 sm:p-8">
      <h2
        id="land-analysis-download-title"
        class="font-display text-title-lg font-bold text-foreground"
      >
        {resourceDownloadInstructionsTitle}
      </h2>
      <p
        class="mt-3 font-body text-body-md leading-7 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-high [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
      >
        {@html resourceDownloadInstructions}
      </p>
      <div class="mt-6 flex justify-end">
        <button
          type="submit"
          class="border border-secondary bg-secondary px-4 py-2 font-body text-label-md font-semibold text-on-secondary transition-colors hover:bg-secondary/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        >
          {closeLabel}
        </button>
      </div>
    </form>
  </dialog>
  <p class="font-body text-body-lg leading-8 text-foreground-alt">
    {@html description}
  </p>
  <div>
    <ul class="grid gap-3 sm:grid-cols-2 lg:max-w-3xl">
      <li
        class="flex items-center gap-3 rounded-sm border border-border-card bg-surface-container-low px-4 py-3 font-body text-body-sm leading-6 text-foreground-alt shadow-card"
      >
        <span
          class="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary-container font-mono text-label-sm font-bold text-secondary"
          >1</span
        >
        <span class="font-semibold text-foreground">{@html nonLiveableLand}</span>
      </li>
      <li
        class="flex items-center gap-3 rounded-sm border border-border-card bg-surface-container-low px-4 py-3 font-body text-body-sm leading-6 text-foreground-alt shadow-card"
      >
        <span
          class="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary-container font-mono text-label-sm font-bold text-secondary"
          >2</span
        >
        <span class="font-semibold text-foreground">{@html landClippedGeometry}</span>
      </li>
    </ul>
  </div>
  <div
    class="grid gap-6 min-[1000px]:-mr-56 min-[1000px]:w-[calc(100%+14rem)] min-[1000px]:grid-cols-[minmax(0,1fr)_24rem] min-[1000px]:items-start"
  >
    <div class="space-y-5">
      <p
        class="font-body text-body-lg leading-8 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
      >
        {@html explanation}
      </p>
      <ol
        class="list-decimal space-y-3 pl-7 font-body text-body-lg leading-8 text-foreground-alt marker:font-semibold marker:text-secondary"
      >
        {#each approachSteps as step}
          <li class="pl-2">{@html step}</li>
        {/each}
      </ol>
      <p
        class="font-body text-body-lg leading-8 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
      >
        {@html turfExplanation}
      </p>
    </div>
    <aside
      class="[&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
    >
      <GuideInstructionCallout
        label={tileZoomCalloutLabel}
        title={tileZoomCalloutTitle}
        description={tileZoomCalloutDescription}
      />
    </aside>
  </div>
</div>
