<script lang="ts">
let {
  approved,
  signedAt,
  canApprove,
  skip,
  busy,
  progress,
  storageError,
  notice,
  onApprove,
  onUndo,
  onNext,
  onSkip,
}: {
  approved: boolean
  signedAt?: string
  canApprove: boolean
  skip: boolean
  busy: boolean
  progress: string
  storageError: string
  notice: string
  onApprove: () => void
  onUndo: () => void
  onNext: () => void
  onSkip: (value: boolean) => void
} = $props()
</script>
<section
  class="flex flex-wrap items-center gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4"
  aria-label="Review progress"
>
  <div class="min-w-48 flex-1">
    <p class="font-semibold">{approved ? 'Signed off' : 'Awaiting sign-off'}</p>
    <p class="text-sm text-foreground-alt">
      {approved && signedAt ? new Date(signedAt).toLocaleString() : progress}
    </p>
  </div>
  {#if approved}
    <button
      type="button"
      class="rounded border border-outline-variant px-3 py-2"
      onclick={onUndo}
    >
      Undo sign-off
    </button>
  {:else}
    <button
      type="button"
      class="rounded bg-primary px-4 py-2 text-surface disabled:opacity-40"
      disabled={!canApprove || busy}
      onclick={onApprove}
    >
      Sign off and next
    </button>
  {/if}
  <button
    type="button"
    class="rounded border border-outline-variant px-3 py-2 disabled:opacity-40"
    disabled={busy}
    onclick={onNext}
  >
    Next unreviewed view
  </button>
  <label class="flex items-center gap-2 text-sm"
    ><input
      type="checkbox"
      checked={skip}
      onchange={e => onSkip(e.currentTarget.checked)}
    >Skip signed-off views</label
  >
  <p class="w-full text-xs text-foreground-alt">
    Sign-offs are saved in this browser for the exact shard, group, table and subset.
    Local database changes make prior sign-offs pending again.
  </p>
  {#if notice}
    <p role="status" class="w-full text-sm">{notice}</p>
  {/if}
  {#if storageError}
    <p role="alert" class="w-full text-sm text-red-700 dark:text-red-400">
      {storageError}
    </p>
  {/if}
</section>
