<script lang="ts">
import GuideReadinessCompleteSummary from './guideReadinessCompleteSummary.svelte'

type Props = {
  description: string
  detailsId: string
  eyebrow: string
  expanded?: boolean
  titleId: string
}

let {
  description,
  detailsId,
  eyebrow,
  expanded = $bindable(false),
  titleId,
}: Props = $props()
</script>

<button
  class="flex w-full cursor-pointer items-start gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
  type="button"
  aria-controls={detailsId}
  aria-expanded={expanded}
  onclick={() => (expanded = !expanded)}
>
  <GuideReadinessCompleteSummary {description} {eyebrow} {titleId} />
</button>
