<script lang="ts">
type Props = {
  id: string
  marker: string
}

let { id, marker }: Props = $props()
let expanded = $state(false)

let compactId = $derived(id.length > 13 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id)

function showId(event: PointerEvent) {
  if (event.pointerType === 'mouse') expanded = true
}

function hideId(event: PointerEvent) {
  if (event.pointerType === 'mouse') expanded = false
}

function toggleIdOnTouch(event: PointerEvent) {
  if (event.pointerType !== 'mouse') expanded = !expanded
}

function toggleIdOnKeyboard(event: MouseEvent) {
  if (event.detail === 0) expanded = !expanded
}
</script>

<button
  class="inline-flex min-w-0 max-w-full items-center gap-3 bg-surface-container-low px-3 py-2 font-mono text-body-md leading-6 text-foreground-alt transition hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
  type="button"
  aria-label={id}
  onpointerenter={showId}
  onpointerleave={hideId}
  onpointerup={toggleIdOnTouch}
  onclick={toggleIdOnKeyboard}
>
  <span class={`h-5 w-1.5 shrink-0 ${marker}`} aria-hidden="true"></span>
  <span class="min-w-0 wrap-break-word">{expanded ? id : compactId}</span>
</button>
