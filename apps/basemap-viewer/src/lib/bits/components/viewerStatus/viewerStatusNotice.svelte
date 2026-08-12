<script lang="ts">
import type { Callbacks } from '../../../ctx/app'

let {
  callbacks,
  dismissLabel,
  inline = false,
  notice,
}: {
  callbacks: Callbacks
  dismissLabel: string
  inline?: boolean
  notice: string
} = $props()
</script>

<aside
  aria-live="polite"
  class={`${inline ? 'absolute top-[59px] right-3 left-3 z-10 flex items-start gap-3 rounded-[5px]' : 'fixed bottom-3.5 left-3.5 z-20 flex max-w-[min(420px,calc(100vw-28px))] items-start gap-3 rounded-[7px] max-[720px]:bottom-2.5 max-[720px]:left-2.5'} border border-(--bar-border) bg-(--bar-control-background) px-3 py-2.5 text-[13px] text-(--bar-text) shadow-[0_4px_16px_var(--bar-shadow)]`}
  role="status"
>
  <span class="min-w-0 flex-1">{notice}</span>
  <button
    aria-label={dismissLabel}
    class="-mr-1 grid size-6 shrink-0 place-items-center rounded text-[18px] leading-none text-(--bar-muted) hover:bg-(--bar-hover-background) focus-visible:outline-2 focus-visible:outline-(--bar-accent)"
    onclick={callbacks.onDismissNotice}
    type="button"
  >
    ×
  </button>
</aside>
