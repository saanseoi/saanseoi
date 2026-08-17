<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'

type Props = {
  description: string
  eyebrow: string
  titleId: string
}

let { description, eyebrow, titleId }: Props = $props()
</script>

<Icon
  icon="material-symbols-light:check-circle-rounded"
  class="mt-0.5 size-5 shrink-0 text-[#6fdec9]"
  aria-hidden="true"
/>
<span class="min-w-0 flex-1">
  <span
    id={titleId}
    class="block font-body text-label-sm font-semibold uppercase tracking-[0.12em] text-[#6fdec9]"
  >
    {@html eyebrow}
  </span>
  <span
    class="mt-2 block max-w-3xl font-body text-body-md leading-7 text-foreground-alt"
  >
    {@html description}
  </span>
</span>
