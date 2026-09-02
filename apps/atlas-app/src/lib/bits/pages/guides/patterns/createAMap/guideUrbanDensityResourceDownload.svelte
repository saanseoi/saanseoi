<script lang="ts">
import { landAnalysisPath } from './guideUrbanDensityLiveableMap.ts'

type Props = {
  closeLabel: string
  downloadInstructions: string
  downloadInstructionsTitle: string
  downloadLabel: string
  explanation: string
  skipLabel: string
  title: string
}

let {
  closeLabel,
  downloadInstructions,
  downloadInstructionsTitle,
  downloadLabel,
  explanation,
  skipLabel,
  title,
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

<aside
  class="min-w-0 max-w-full overflow-hidden rounded-sm bg-[repeating-linear-gradient(135deg,var(--secondary)_0_7px,var(--surface-container-high)_7px_14px)] p-3"
>
  <div
    class="bg-surface-container-low px-6 py-5 pt-8 font-body text-body-lg leading-8 text-foreground-alt sm:px-10"
  >
    <p
      class="font-display text-title-xl font-bold leading-5 tracking-tight text-secondary"
    >
      {@html title}
    </p>
    <p class="mt-2">
      {@html explanation}
    </p>
    <div class="mt-5 flex flex-wrap justify-end gap-3">
      <a
        class="inline-flex items-center border border-secondary bg-secondary px-4 py-2 font-body text-label-md font-semibold text-on-secondary transition-colors hover:bg-secondary/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        download="land-analysis.json.gz"
        href={landAnalysisPath}
        onclick={() => downloadInstructionsDialog.showModal()}
      >
        {downloadLabel}
      </a>
      <a
        class="inline-flex items-center border border-secondary px-4 py-2 font-body text-label-md font-semibold text-secondary transition-colors hover:bg-secondary-container/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        href="#project-finalise-map"
        onclick={scrollToFinaliseMap}
      >
        {skipLabel}
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
      {downloadInstructionsTitle}
    </h2>
    <p
      class="mt-3 font-body text-body-md leading-7 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-high [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
    >
      {@html downloadInstructions}
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
