<script lang="ts">
import { Button } from '#lib/bits/primitives/button/index.js'
import type { Snippet } from 'svelte'

type Props = {
  actionHref?: string
  actionLabel?: string
  title?: string
  children?: Snippet
}

let { actionHref, actionLabel, title = 'Note', children }: Props = $props()
</script>

<aside
  class="my-6 min-w-0 max-w-full overflow-hidden rounded-sm bg-[repeating-linear-gradient(135deg,var(--tertiary)_0_7px,var(--surface-container-high)_7px_14px)] p-3"
>
  <div
    class="bg-surface-container-low px-10 pt-3 pb-5 font-body text-body-md leading-7 text-foreground-alt"
  >
    {#if title}
      <p
        class="m-0 font-display text-title-lg font-bold leading-5 tracking-tight text-tertiary"
      >
        {title}
      </p>
    {/if}
    <div class:mt-1.5={Boolean(title)}>{@render children?.()}</div>
    {#if actionHref && actionLabel}
      <div class="mt-5 flex justify-end">
        <Button
          class="bg-tertiary! text-on-tertiary! shadow-[0_0.25rem_0.8rem_color-mix(in_srgb,var(--tertiary)_35%,transparent)] hover:bg-tertiary-fixed-dim! hover:text-on-tertiary-fixed! no-underline"
          href={actionHref}
          >{actionLabel}</Button
        >
      </div>
    {/if}
  </div>
</aside>
