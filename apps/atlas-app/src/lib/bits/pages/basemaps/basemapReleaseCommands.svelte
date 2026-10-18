<script lang="ts">
import { onDestroy } from 'svelte'
import Copy from '@iconify-svelte/proicons/copy'
import Checkmark from '@iconify-svelte/proicons/checkmark'
let { command }: { command: string } = $props()
let status = $state<'idle' | 'copied' | 'error'>('idle')
let resetTimer: ReturnType<typeof setTimeout> | undefined
onDestroy(() => clearTimeout(resetTimer))

/** Copy both build commands exactly, keeping failure feedback available to screen readers. */
async function copyCommands(): Promise<void> {
  clearTimeout(resetTimer)
  try {
    await navigator.clipboard.writeText(command)
    status = 'copied'
    resetTimer = setTimeout(() => (status = 'idle'), 2000)
  } catch {
    status = 'error'
  }
}
</script>
<div class="m-5 overflow-hidden rounded-md bg-data-surface-container-lowest">
  <div class="flex justify-end px-2 pt-2">
    <button
      type="button"
      onclick={copyCommands}
      aria-label="Copy build commands"
      class="inline-flex items-center gap-1.5 rounded px-2 py-1 font-body text-caption text-foreground-alt transition hover:bg-data-surface-container-high hover:text-data-primary focus-visible:outline-2 focus-visible:outline-data-primary"
    >
      {#if status === 'copied'}
        <Checkmark class="size-3.5" aria-hidden="true" />
      {:else}
        <Copy class="size-3.5" aria-hidden="true" />
      {/if}
      {status === 'copied' ? 'Copied' : 'Copy'}
    </button>
  </div>
  <pre
    class="overflow-x-auto px-4 pt-1 pb-4 font-mono text-label-md leading-7 text-foreground-alt"
  ><code>{command}</code></pre>
</div>
<p
  class={status === 'error'
    ? 'px-5 pb-4 font-body text-caption text-foreground-alt'
    : 'sr-only'}
  role="status"
>
  {status === 'copied'
    ? 'Build commands copied.'
    : status === 'error'
      ? 'Could not copy. Select the commands to copy them manually.'
      : ''}
</p>
