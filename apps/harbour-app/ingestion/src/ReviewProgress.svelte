<script lang="ts">
import ReviewActionIcon from './ReviewActionIcon.svelte'
let {
  approved,
  productionReview,
  canMarkProduction,
  onProduction,
  onReturnToLocal,
  canApprove,
  busy,
  storageError,
  notice,
  onApprove,
  onUndo,
  onNext,
}: {
  productionReview: boolean
  canMarkProduction: boolean
  onProduction: () => void
  onReturnToLocal: () => void
  approved: boolean
  canApprove: boolean
  busy: boolean
  storageError: string
  notice: string
  onApprove: () => void
  onUndo: () => void
  onNext: () => void
} = $props()
const approvalLabel = $derived(approved ? 'Undo sign-off' : 'Sign off and next')
const productionLabel = $derived(
  productionReview ? 'Return to local review' : 'Production review and next',
)
</script>

<div
  class="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-screen-2xl flex-col items-end gap-3 px-4 sm:px-8"
>
  {#if storageError}
    <p
      role="alert"
      class="pointer-events-auto max-w-80 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-sm text-red-700 shadow-lg dark:text-red-400"
    >
      {storageError}
    </p>
  {/if}
  <fieldset
    aria-label="Review actions"
    class="pointer-events-auto flex items-center gap-1 rounded-2xl border border-outline-variant bg-surface-container-lowest/95 p-1.5 text-foreground shadow-lg backdrop-blur-md"
  >
    <button
      type="button"
      class="flex size-12 items-center justify-center rounded-xl text-green-700 dark:text-green-400 transition hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-30"
      class:bg-surface-container-high={approved}
      aria-label={approvalLabel}
      title={approvalLabel}
      aria-pressed={approved}
      disabled={busy || (!approved && (!canApprove || productionReview))}
      onclick={approved ? onUndo : onApprove}
    >
      <ReviewActionIcon kind="approval" />
    </button>
    <button
      type="button"
      class="flex size-12 items-center justify-center rounded-xl text-blue-700 dark:text-blue-400 transition hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-30"
      class:bg-surface-container-high={productionReview}
      aria-label={productionLabel}
      title={productionLabel}
      aria-pressed={productionReview}
      disabled={busy || (!productionReview && !canMarkProduction)}
      onclick={productionReview ? onReturnToLocal : onProduction}
    >
      <ReviewActionIcon kind="production" />
    </button>
    <button
      type="button"
      class="flex size-12 items-center justify-center rounded-xl text-yellow-700 dark:text-yellow-400 transition hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-30"
      aria-label="Next unreviewed view"
      title={notice || 'Next unreviewed view'}
      disabled={busy}
      onclick={onNext}
    >
      <ReviewActionIcon kind="skip" />
    </button>
  </fieldset>
  <span class="sr-only" role="status">{notice}</span>
</div>
