<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  description: string
  eyebrow: string
  titleId?: string
}

let { children, description, eyebrow, titleId }: Props = $props()
</script>

<div class="flex items-start gap-3">
  <Icon
    icon="material-symbols-light:warning-rounded"
    class="mt-0.5 size-5 shrink-0 text-[#b42318] dark:text-[#ef8b88]"
    aria-hidden="true"
  />
  <div class="min-w-0 flex-1">
    <p
      id={titleId}
      class="font-body text-label-sm font-semibold uppercase tracking-[0.12em] text-[#b42318] dark:text-[#ffb4b1]"
    >
      {@html eyebrow}
    </p>
    <p class="mt-2 max-w-3xl font-body text-body-lg leading-8 text-foreground-alt">
      {@html description}
    </p>
    {@render children?.()}
  </div>
</div>
