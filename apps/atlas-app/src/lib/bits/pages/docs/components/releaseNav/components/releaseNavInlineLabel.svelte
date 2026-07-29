<script lang="ts">
type Props = { label: string }

let { label }: Props = $props()

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

let segments = $derived(parseInlineCode(label))
</script>

{#each segments as segment}
  {#if segment.code}
    <code class="font-mono text-[0.9em]">{segment.value}</code>
  {:else}
    {segment.value}
  {/if}
{/each}
