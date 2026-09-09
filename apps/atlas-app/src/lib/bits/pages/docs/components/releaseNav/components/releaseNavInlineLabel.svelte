<script lang="ts">
type Props = { emphasis?: string; label: string }

let { emphasis, label }: Props = $props()

type Segment = { value: string; code: boolean }

const parseInlineCode = (value: string): Segment[] => {
  const segments: Segment[] = []
  const pattern = /`([^`]+)`/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while (true) {
    match = pattern.exec(value)
    if (!match) break
    if (match.index > lastIndex)
      segments.push({ code: false, value: value.slice(lastIndex, match.index) })
    segments.push({ code: true, value: match[1] ?? '' })
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < value.length)
    segments.push({ code: false, value: value.slice(lastIndex) })

  return segments.length ? segments : [{ code: false, value }]
}

let emphasisedPrefix = $derived(
  emphasis && label.startsWith(emphasis) ? emphasis : undefined,
)
let segments = $derived(
  parseInlineCode(emphasisedPrefix ? label.slice(emphasisedPrefix.length) : label),
)
</script>

<span class="min-w-0 -translate-y-px">
  {#if emphasisedPrefix}
    <strong class="font-semibold">{emphasisedPrefix}</strong>
  {/if}
  {#each segments as segment}
    {#if segment.code}
      <code class="font-mono text-[0.9em]">{segment.value}</code>
    {:else}
      {segment.value}
    {/if}
  {/each}
</span>
