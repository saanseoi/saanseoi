<script lang="ts">
import { onDestroy } from 'svelte'
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { m } from '#lib/bits/internal/i18n.js'

type Props = {
  id: string
  marker: string
}

let { id, marker }: Props = $props()
let expanded = $state(false)
let copyStatus = $state('')
let copied = $state(false)
let resetTimer: ReturnType<typeof setTimeout> | undefined
onDestroy(() => clearTimeout(resetTimer))

let compactId = $derived(id.length > 13 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id)

function showId(event: PointerEvent) {
  if (event.pointerType === 'mouse') expanded = true
}

function hideId(event: PointerEvent) {
  if (event.pointerType === 'mouse') expanded = false
}

async function copyId(event: MouseEvent) {
  event.stopPropagation()
  clearTimeout(resetTimer)
  copied = false
  copyStatus = ''
  try {
    await navigator.clipboard.writeText(id)
    copied = true
    copyStatus = m.common_copied()
    resetTimer = setTimeout(() => {
      copied = false
      copyStatus = ''
    }, 2000)
  } catch {
    copyStatus = 'Could not copy ID'
  }
}
</script>

<button
  class="relative inline-flex min-w-0 max-w-full items-center gap-3 bg-surface-container-low px-3 py-2 font-mono text-body-md leading-6 text-foreground-alt transition hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
  data-copied={copied}
  type="button"
  aria-label={id}
  onpointerenter={showId}
  onpointerleave={hideId}
  title="Copy ID"
  onfocus={() => (expanded = true)}
  onblur={() => (expanded = false)}
  onclick={copyId}
>
  <span
    class={`h-5 w-1.5 shrink-0 transition-opacity duration-200 motion-reduce:transition-none ${marker}`}
    class:opacity-0={copied}
    aria-hidden="true"
  ></span>
  <span
    class="min-w-0 wrap-break-word transition-opacity duration-200 motion-reduce:transition-none"
    class:opacity-0={copied}
    >{expanded ? id : compactId}</span
  >
  <span
    class="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-data-success/10 text-data-success ring-1 ring-inset ring-data-success/40 transition-[opacity,transform] duration-200 motion-reduce:transition-none"
    class:opacity-0={!copied}
    class:scale-95={!copied}
    aria-hidden="true"
  >
    <Icon icon="proicons:checkmark" class="size-4 shrink-0" />
    <span>{m.common_copied()}</span>
  </span>
</button>

<span class="sr-only" aria-live="polite">{copyStatus}</span>
