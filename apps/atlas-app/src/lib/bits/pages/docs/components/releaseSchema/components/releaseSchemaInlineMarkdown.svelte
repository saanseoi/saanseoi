<script lang="ts">
type Props = { value: string }

type Segment = { code: boolean; value: string }

let { value }: Props = $props()

function parseInlineCode(source: string): Segment[] {
  const segments: Segment[] = []
  const pattern = /`([^`]+)`/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while (true) {
    match = pattern.exec(source)
    if (!match) break
    if (match.index > lastIndex)
      segments.push({ code: false, value: source.slice(lastIndex, match.index) })
    segments.push({ code: true, value: match[1] ?? '' })
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < source.length)
    segments.push({ code: false, value: source.slice(lastIndex) })

  return segments.length ? segments : [{ code: false, value: source }]
}

let segments = $derived(parseInlineCode(value))
</script>

{#each segments as segment}
  {#if segment.code}
    <code
      class="inline-flex min-h-[1.55em] items-center justify-center rounded-[0.2rem] border border-secondary/65 border-b-2 bg-secondary-container/12 px-[0.35em] align-[0.06em] font-mono text-[0.78em] font-bold leading-none text-secondary"
      >{segment.value}</code
    >
  {:else}
    {segment.value}
  {/if}
{/each}
