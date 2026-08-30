<script lang="ts">
import GuideInstructionCallout from '../../components/createAMap/guideInstructionCallout.svelte'

type Props = {
  approachSteps: string[]
  description: string
  introduction: string
  landClippedGeometry: string
  nonLiveableLand: string
  resourceDownloadJsonResult: string
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
  description,
  introduction,
  landClippedGeometry,
  nonLiveableLand,
  resourceDownloadJsonResult,
  explanation,
  resourceExplanation,
  resourceSkipSection,
  resourceTitle,
  tileZoomCalloutDescription,
  tileZoomCalloutLabel,
  tileZoomCalloutTitle,
  turfExplanation,
}: Props = $props()
</script>

<div class="space-y-5">
  <p class="font-body text-body-lg leading-8 text-foreground-alt">
    {@html introduction}
  </p>
  <aside
    class="min-w-0 max-w-full overflow-hidden rounded-sm bg-[repeating-linear-gradient(135deg,var(--secondary)_0_7px,var(--surface-container-high)_7px_14px)] p-3"
  >
    <div
      class="bg-surface-container-low px-6 py-5 font-body text-body-lg leading-8 text-foreground-alt sm:px-10"
    >
      <p
        class="font-display text-title-lg font-bold leading-5 tracking-tight text-secondary"
      >
        {@html resourceTitle}
      </p>
      <p class="mt-2">
        {@html resourceExplanation}
      </p>
      <div class="mt-5 flex flex-wrap justify-end gap-3">
        <a
          class="inline-flex items-center border border-secondary bg-secondary px-4 py-2 font-body text-label-md font-semibold text-on-secondary transition-colors hover:bg-secondary/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          href="#project-liveable-land-result"
        >
          {resourceDownloadJsonResult}
        </a>
        <a
          class="inline-flex items-center border border-secondary px-4 py-2 font-body text-label-md font-semibold text-secondary transition-colors hover:bg-secondary-container/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          href="#project-finalise-map"
        >
          {resourceSkipSection}
        </a>
      </div>
    </div>
  </aside>
  <p class="font-body text-body-lg leading-8 text-foreground-alt">
    {@html description}
  </p>
  <div class="relative lg:-mr-96 lg:w-[calc(100%+24rem)]">
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
    <aside
      class="mt-6 [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] lg:absolute lg:top-0 lg:right-0 lg:left-198 lg:mt-0"
    >
      <GuideInstructionCallout
        label={tileZoomCalloutLabel}
        title={tileZoomCalloutTitle}
        description={tileZoomCalloutDescription}
      />
    </aside>
  </div>
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
