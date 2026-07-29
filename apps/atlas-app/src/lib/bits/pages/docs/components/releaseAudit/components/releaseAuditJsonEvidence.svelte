<script lang="ts">
type JsonToken = {
  tone: 'key' | 'literal' | 'number' | 'punctuation' | 'string' | 'text'
  value: string
}

type Props = {
  evidence: unknown
  viewTransitionName?: string
}

let { evidence, viewTransitionName }: Props = $props()

const tokenClassByTone = {
  key: 'text-secondary',
  literal: 'text-data-error',
  number: 'text-data-warning',
  punctuation: 'text-foreground-alt',
  string: 'text-data-primary',
  text: 'text-foreground-alt',
}

const tokeniseJson = (json: string): JsonToken[] => {
  const tokens: JsonToken[] = []
  const matcher =
    /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])/g
  let cursor = 0

  for (const match of json.matchAll(matcher)) {
    const index = match.index ?? 0
    if (index > cursor) tokens.push({ tone: 'text', value: json.slice(cursor, index) })

    const [value, quoted, colon, number, literal] = match
    tokens.push({
      tone: quoted
        ? colon
          ? 'key'
          : 'string'
        : number
          ? 'number'
          : literal
            ? 'literal'
            : 'punctuation',
      value,
    })
    cursor = index + value.length
  }

  if (cursor < json.length) tokens.push({ tone: 'text', value: json.slice(cursor) })
  return tokens
}

let json = $derived(JSON.stringify(evidence, null, 2))
let tokens = $derived(tokeniseJson(json))
</script>

<pre
  class="w-full font-mono text-caption leading-5 whitespace-pre-wrap wrap-break-word"
  style={viewTransitionName ? `view-transition-name: ${viewTransitionName}` : undefined}
>{#each tokens as token}<span class={tokenClassByTone[token.tone]}>{token.value}</span>{/each}</pre>
