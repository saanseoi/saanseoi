<script lang="ts">
import type { ReleaseDiffLabels } from '../releaseDiff.types'

type Props = { labels: ReleaseDiffLabels }
let { labels }: Props = $props()
</script>

<div class="grid gap-4 lg:grid-cols-2">
  <div
    class="hidden items-center gap-2 border-b border-data-error/35 px-1 pb-2 font-body text-label-sm font-semibold uppercase tracking-[0.08em] text-data-on-tertiary-container lg:flex"
  >
    <span
      class="inline-flex size-5 items-center justify-center rounded-full bg-data-error/15 font-mono text-sm leading-none"
      aria-hidden="true"
      >−</span
    >
    {labels.removed}
  </div>
  <div
    class="hidden items-center gap-2 border-b border-data-success/35 px-1 pb-2 font-body text-label-sm font-semibold uppercase tracking-[0.08em] text-data-on-primary-container lg:flex"
  >
    <span
      class="inline-flex size-5 items-center justify-center rounded-full bg-data-success/15 font-mono text-sm leading-none"
      aria-hidden="true"
      >+</span
    >
    {labels.added}
  </div>
</div>
