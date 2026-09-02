<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import Icon from '#lib/bits/primitives/icon/icon.svelte'

type Props = {
  failed: boolean
  loading: boolean
  onLoad: () => Promise<void>
}

let { failed, loading, onLoad }: Props = $props()
let sentinel = $state<HTMLDivElement>()

$effect(() => {
  const element = sentinel
  if (!element) return

  const observer = new IntersectionObserver(
    entries => {
      if (entries.some(entry => entry.isIntersecting) && !loading && !failed) {
        void onLoad()
      }
    },
    { rootMargin: '600px 0px' },
  )
  observer.observe(element)

  return () => observer.disconnect()
})
</script>

<div
  bind:this={sentinel}
  class="flex min-h-10 flex-col items-center justify-center gap-2 px-4 py-2"
  aria-live="polite"
>
  {#if loading}
    <p
      class="inline-flex items-center gap-2 font-body text-label-sm text-foreground-alt"
    >
      <Icon
        icon="ion:sync-outline"
        class="size-4 motion-safe:animate-spin"
        aria-hidden="true"
      />
      {m.source_audit_loading_records()}
    </p>
  {:else if failed}
    <p class="font-body text-label-sm text-data-danger" role="alert">
      {m.source_audit_load_records_error()}
    </p>
    <button
      class="cursor-pointer font-body text-label-sm font-semibold text-data-primary underline underline-offset-4"
      type="button"
      onclick={() => void onLoad()}
    >
      {m.source_retry()}
    </button>
  {/if}
</div>
