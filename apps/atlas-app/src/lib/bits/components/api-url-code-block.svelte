<script lang="ts">
type Props = {
  lang?: string
  text: string
}

let { lang, text }: Props = $props()

type UrlToken = {
  kind: 'path' | 'separator' | 'parameter' | 'value'
  value: string
}

function tokeniseUrl(value: string): UrlToken[] {
  const queryIndex = value.indexOf('?')
  if (queryIndex === -1) return [{ kind: 'path', value }]

  const tokens: UrlToken[] = [
    { kind: 'path', value: value.slice(0, queryIndex) },
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

let tokens = $derived(lang === 'url' ? tokeniseUrl(text) : [])
</script>

{#if lang === 'url'}
  <pre
    class="overflow-x-auto rounded-md bg-slate-950 p-4 text-sm leading-6 text-slate-100"
  ><code>{#each tokens as token}<span
        class:font-semibold={token.kind === 'parameter'}
        class:text-sky-300={token.kind === 'parameter'}
        class:text-slate-500={token.kind === 'separator'}
        class:text-amber-300={token.kind === 'value'}>{token.value}</span
      >{/each}</code
    ></pre>
{:else}
  <pre class={lang}><code>{text}</code></pre>
{/if}
