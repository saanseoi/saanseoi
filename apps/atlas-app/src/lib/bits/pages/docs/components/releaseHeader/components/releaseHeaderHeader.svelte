<script lang="ts">
type Props = {
  label: string
  statusLabel: string
  statusClass: string
  statusDotClass: string
  showBackground?: boolean
}

let {
  label,
  statusLabel,
  statusClass,
  statusDotClass,
  showBackground = false,
}: Props = $props()
</script>

<div
  class={`border-b border-outline-variant/60 px-6 py-3 dark:border-outline-variant md:px-8 ${showBackground ? 'bg-surface-container-low/60' : 'bg-surface-container-low'}`}
>
  <div class="flex items-center justify-between gap-4">
    <p
      class="font-body text-caption font-semibold uppercase tracking-[0.14em] text-secondary"
    >
      {label}
    </p>
    <span
      class={`inline-flex items-center gap-2 border px-3 py-1 font-body text-label-sm font-semibold capitalize ${statusClass}`}
    >
      <span class={`size-1.5 rounded-full ${statusDotClass}`}></span>
      {statusLabel}
    </span>
  </div>
</div>
