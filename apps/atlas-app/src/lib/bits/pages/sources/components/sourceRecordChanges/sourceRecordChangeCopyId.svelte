<script lang="ts">
import { onDestroy } from 'svelte'
import Icon from '#lib/bits/primitives/icon/icon.svelte'
let {
  id,
  copy,
}: {
  id: string
  copy: { copyId: string; copiedId: string; copyIdError: string }
} = $props()
let status = $state<'idle' | 'copied' | 'error'>('idle')
let resetTimer: ReturnType<typeof setTimeout> | undefined
onDestroy(() => clearTimeout(resetTimer))
async function copyId() {
  try {
    await navigator.clipboard.writeText(id)
    status = 'copied'
    clearTimeout(resetTimer)
    resetTimer = setTimeout(() => (status = 'idle'), 2000)
  } catch {
    status = 'error'
  }
}
</script>

<button
  type="button"
  class="relative my-auto flex h-8 w-10 shrink-0 items-center justify-center rounded font-mono text-caption text-foreground-alt hover:bg-surface-container-high hover:text-primary"
  aria-label={copy.copyId}
  title={id}
  onclick={copyId}
>
  <span
    class="transition-opacity duration-300 motion-reduce:transition-none"
    class:opacity-0={status === 'copied'}
    >ID</span
  >
  <span
    class="absolute flex items-center justify-center text-data-success transition-opacity duration-300 motion-reduce:transition-none"
    class:opacity-0={status !== 'copied'}
    aria-hidden="true"
  >
    <Icon icon="proicons:checkmark" class="size-4" />
  </span>
</button>
<span class="sr-only" role="status"
  >{status === 'copied'
    ? copy.copiedId
    : status === 'error'
      ? copy.copyIdError
      : ''}</span
>
