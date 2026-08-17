<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'

type Props = {
  model: string
}

let { model }: Props = $props()
</script>

<div class="mt-4 w-full max-w-3xl">
  <div class="flex w-full overflow-hidden border border-[#ef8b88]/40 bg-[#ef8b88]/6">
    <div
      aria-hidden="true"
      class="flex w-20 shrink-0 flex-col items-center justify-center gap-1 bg-white/6 px-2"
    >
      <Icon
        icon="material-symbols-light:smart-toy-outline-rounded"
        class="size-7 text-white/75"
      />
    </div>
    <div class="min-w-0 flex-1">
      <div
        class="flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3"
      >
        <span
          class="font-body text-body-md font-semibold text-foreground-alt uppercase"
        >
          MODEL
        </span>
        <span
          class="font-display text-title-lg leading-tight font-bold tracking-tight text-white"
        >
          {@html model}
        </span>
      </div>
    </div>
  </div>
</div>
