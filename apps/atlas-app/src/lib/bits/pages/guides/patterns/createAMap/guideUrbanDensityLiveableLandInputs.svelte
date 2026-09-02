<script lang="ts">
import analysisDissolve from '#lib/assets/guides/urban-density-analysis/dissolve.png'
import analysisFindDecode from '#lib/assets/guides/urban-density-analysis/find-decode.png'
import analysisIntersect from '#lib/assets/guides/urban-density-analysis/intersect.png'
import analysisMeasure from '#lib/assets/guides/urban-density-analysis/measure.png'
import analysisMergeClip from '#lib/assets/guides/urban-density-analysis/merge-clip.png'
import analysisSaveJson from '#lib/assets/guides/urban-density-analysis/save-json.png'
import analysisSubtract from '#lib/assets/guides/urban-density-analysis/subtract.png'
import GuideInstructionCallout from '../../components/createAMap/guideInstructionCallout.svelte'
import GuideTextSubHeader from '../../components/shared/guideTextSubHeader.svelte'

type Props = {
  approachSteps: string[]
  description: string
  geospatialToolsTitle: string
  introduction: string
  landClippedGeometry: string
  nonLiveableLand: string
  explanation: string
  tileZoomCalloutDescription: string
  tileZoomCalloutLabel: string
  tileZoomCalloutTitle: string
  turfExplanation: string
}

let {
  approachSteps,
  description,
  geospatialToolsTitle,
  introduction,
  landClippedGeometry,
  nonLiveableLand,
  explanation,
  tileZoomCalloutDescription,
  tileZoomCalloutLabel,
  tileZoomCalloutTitle,
  turfExplanation,
}: Props = $props()

const approachIllustrations = [
  analysisFindDecode,
  analysisMergeClip,
  analysisIntersect,
  analysisDissolve,
  analysisMeasure,
  analysisSubtract,
  analysisSaveJson,
]
</script>

<div class="space-y-5">
  <p class="font-body text-body-lg leading-8 text-foreground-alt">
    {@html introduction}
  </p>
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
      <ol class="grid gap-x-10 gap-y-10 sm:grid-cols-2 sm:gap-y-4 pt-12">
        {#each approachSteps as step, index}
          <li class="sm:even:translate-y-16 sm:even:mb-16 sm:odd:-translate-y-6 mb-8">
            <div
              class={`flex min-w-0 items-center gap-4 ${index % 2 === 1 ? 'flex-row-reverse' : ''}`}
            >
              <img
                alt=""
                aria-hidden="true"
                class="size-28 shrink-0 object-contain sm:size-32"
                src={approachIllustrations[index]}
              >
              <div class="min-w-0 flex-1">
                <div class="flex items-start gap-3">
                  <span
                    class="flex size-10 shrink-0 items-center justify-center bg-secondary font-mono text-label-md font-semibold text-on-secondary"
                    >{index + 1}</span
                  >
                  <span class="mt-5 h-px flex-1 bg-border-card"></span>
                </div>
                <p class="mt-3 font-body text-body-lg leading-8 text-foreground-alt">
                  {@html step}
                </p>
              </div>
            </div>
          </li>
        {/each}
      </ol>
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
  <div class="space-y-3">
    <GuideTextSubHeader title={geospatialToolsTitle} />
    <p
      class="font-body text-body-lg leading-8 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
    >
      {@html turfExplanation}
    </p>
  </div>
</div>
