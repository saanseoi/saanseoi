<script lang="ts">
import type { Callbacks } from '../../../../../ctx/app'

let {
  callbacks,
  dismissLabel,
  notice,
}: {
  callbacks: Callbacks
  dismissLabel: string
  notice: string
} = $props()
</script>

<aside
  aria-live="polite"
  class="fixed bottom-3.5 left-3.5 z-20 flex max-w-[min(420px,calc(100vw-28px))] items-start gap-3 rounded-[7px] border border-[#e5bd62] bg-[rgb(255_248_231/96%)] px-3 py-2.5 text-[13px] text-[#704b10] shadow-[0_4px_16px_rgb(24_33_38/20%)] max-[700px]:bottom-2.5 max-[700px]:left-2.5"
  role="status"
>
  <span>{notice}</span>
  <button
    aria-label={dismissLabel}
    class="-mr-1 -mt-1 grid size-6 shrink-0 place-items-center rounded text-[18px] leading-none text-[#704b10] hover:bg-[#f7dc9c] focus-visible:outline-2 focus-visible:outline-[#704b10]"
    onclick={callbacks.onDismissNotice}
    type="button"
  >
    ×
  </button>
</aside>
