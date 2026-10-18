<script lang="ts">
let { label }: { label: string } = $props()
</script>

<div
  class="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-outline-variant/60 bg-surface-container-lowest px-6 py-10 text-center"
  role="status"
>
  <p class="max-w-sm font-body text-body-md text-foreground-alt">{label}</p>
</div>
