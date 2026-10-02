<script lang="ts">
let {
  measure,
}: { measure: { issue: string; outcome: string; mode: string; value: string } } =
  $props()
</script>
<div class="flex min-h-28 flex-col bg-data-surface-container-lowest px-4 py-3">
  <div class="flex items-start justify-between gap-4">
    <div class="min-w-0">
      <p
        class="font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
      >
        {measure.issue}
      </p>
      <p class="mt-1 font-body text-label-md font-semibold text-primary">
        {measure.outcome}
      </p>
    </div>
    <p class="shrink-0 font-mono text-label-md font-bold tabular-nums text-primary">
      {measure.value}
    </p>
  </div>
  <p
    class="mt-auto pt-3 text-right font-body text-caption font-semibold uppercase tracking-[0.08em] text-foreground-alt"
  >
    {measure.mode}
  </p>
</div>
