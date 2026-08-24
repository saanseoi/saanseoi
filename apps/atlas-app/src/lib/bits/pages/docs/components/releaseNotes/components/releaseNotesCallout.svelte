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
  class="my-6 min-w-0 max-w-full rounded-r-sm border border-border-card border-l-[3px] border-l-tertiary bg-surface-container-low px-4 py-3.5 font-body text-body-md leading-7 text-foreground-alt"
>
  {#if title}
    <p class="m-0 font-display text-title-sm font-semibold leading-5 text-primary">
      {title}
    </p>
  {/if}
  <div class:mt-1.5={Boolean(title)}>{@render children?.()}</div>
  {#if actionHref && actionLabel}
    <div class="mt-3 flex justify-end">
      <Button class="no-underline" href={actionHref} size="compact"
        >{actionLabel}</Button
      >
    </div>
  {/if}
</aside>
