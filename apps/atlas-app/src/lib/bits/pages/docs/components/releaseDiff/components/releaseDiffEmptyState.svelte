<script lang="ts">
type Props = { label: string }
let { label }: Props = $props()
</script>

<div
  data-release-nav-content-body
  class="mt-6 scroll-mt-24 rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-6 py-8 text-center font-body text-body-md text-foreground-alt lg:scroll-mt-[120px] dark:border-outline-variant"
>
  {label}
</div>
