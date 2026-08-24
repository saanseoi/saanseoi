<script lang="ts">
type Props = {
  centered?: boolean
  label: string
}

let { centered = false, label }: Props = $props()
</script>

<div
  data-release-nav-content-body
  class={`scroll-mt-24 rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-6 py-8 text-center font-body text-body-md text-foreground-alt lg:scroll-mt-[120px] dark:border-outline-variant ${centered ? 'flex min-h-[calc(100svh-14rem)] items-center justify-center' : 'mt-6'}`}
>
  {label}
</div>
