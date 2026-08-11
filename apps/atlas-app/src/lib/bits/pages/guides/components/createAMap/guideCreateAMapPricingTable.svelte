<script lang="ts">
type PricingOption = {
  detail?: string
  label: string
  price?: string
}

type Props = {
  options: PricingOption[]
}

let { options }: Props = $props()
</script>

<div class="mt-4 w-full max-w-3xl">
  <div class="flex w-full overflow-hidden border border-[#ef8b88]/40 bg-[#ef8b88]/6">
    <div
      aria-hidden="true"
      class="flex w-20 shrink-0 items-center justify-center bg-white/6"
    >
      <span class="font-display text-[4.125rem] leading-none font-bold text-white/75"
        >$</span
      >
    </div>
    <div class="min-w-0 flex-1 divide-y divide-[#ef8b88]/25">
      {#each options as option}
        <div
          class="flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3"
        >
          <span
            class="font-body text-body-md font-semibold text-foreground-alt uppercase"
            >{@html option.label}</span
          >
          <span
            class="flex min-w-0 flex-wrap items-baseline justify-end gap-x-2 text-right"
          >
            {#if option.price}
              <span
                class="font-display text-title-lg leading-tight font-bold tracking-tight text-white tabular-nums"
                >{@html option.price}</span
              >
            {/if}
            {#if option.detail}
              <span class="font-body text-body-sm leading-5 text-foreground-alt"
                >{@html option.detail}</span
              >
            {/if}
          </span>
        </div>
      {/each}
    </div>
  </div>
</div>
