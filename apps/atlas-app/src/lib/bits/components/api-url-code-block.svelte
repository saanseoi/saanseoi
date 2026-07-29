<script lang="ts">
type Props = {
  lang?: string
  text: string
}

let { lang, text }: Props = $props()

type UrlToken = {
  kind: 'path' | 'version' | 'family' | 'separator' | 'parameter' | 'value' | 'newline'
  value: string
}

function tokenisePath(value: string): UrlToken[] {
  const match = /^(\/v[^/]+)(\/[^/?]+)?(.*)$/.exec(value)
  if (!match) return [{ kind: 'path', value }]

  const [, version, family, rest] = match
  const tokens: UrlToken[] = [{ kind: 'version', value: version }]

  if (family) tokens.push({ kind: 'family', value: family })
  if (rest) tokens.push({ kind: 'path', value: rest })

  return tokens
}

function tokeniseUrlLine(value: string): UrlToken[] {
  const queryIndex = value.indexOf('?')
  if (queryIndex === -1) return tokenisePath(value)

  const tokens: UrlToken[] = [
    ...tokenisePath(value.slice(0, queryIndex)),
    { kind: 'separator', value: '?' },
  ]

  const query = value.slice(queryIndex + 1)
  for (const [index, parameter] of query.split('&').entries()) {
    if (index > 0) tokens.push({ kind: 'separator', value: '&' })

    const equalsIndex = parameter.indexOf('=')
    if (equalsIndex === -1) {
      tokens.push({ kind: 'parameter', value: parameter })
      continue
    }

    tokens.push({ kind: 'parameter', value: parameter.slice(0, equalsIndex) })
    tokens.push({ kind: 'separator', value: '=' })
    tokens.push({ kind: 'value', value: parameter.slice(equalsIndex + 1) })
  }

  return tokens
}

function tokeniseUrl(value: string): UrlToken[] {
  return value
    .split(/(\r?\n)/)
    .flatMap(line =>
      /\r?\n/.test(line) ? [{ kind: 'newline', value: line }] : tokeniseUrlLine(line),
    )
}

let tokens = $derived(lang === 'url' ? tokeniseUrl(text) : [])
</script>

{#if lang === 'url'}
  <pre
    class="overflow-x-auto rounded-md bg-slate-950 p-4 text-sm leading-6 text-slate-100"
  ><code>{#each tokens as token}<span
        class:font-semibold={token.kind === 'parameter'}
        class:text-violet-300={token.kind === 'version'}
        class:text-emerald-300={token.kind === 'family'}
        class:text-sky-300={token.kind === 'parameter'}
        class:text-slate-500={token.kind === 'separator'}
        class:text-amber-300={token.kind === 'value'}>{token.value}</span
      >{/each}</code
    ></pre>
{:else}
  <pre class={lang}><code>{text}</code></pre>
{/if}
