<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import type { Json } from '@repo/core/provenance'
import { tick } from 'svelte'
import { getLocale } from '@repo/i18n/runtime'
import { translationParentName } from './translationParentName'
import Location from '@iconify-svelte/proicons/location'
import Applications from './retainedAuditApplications.svelte'
import Origin from './retainedAuditTranslationOrigin.svelte'
import { matchesAudit } from './retainedAuditSearch'
let {
  entries,
  references,
  releaseId,
  hash,
  fixtureIndex,
  query = '',
  showHeader = false,
}: {
  entries: Json[]
  references?: Array<{ fixtureIndex: number; entryIndex: number }>
  releaseId?: string
  hash?: string
  fixtureIndex?: number
  query?: string
  showHeader?: boolean
} = $props()
const object = (value: Json | undefined) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const locale = (entry: Json, side: 'source' | 'target') =>
  String(
    side === 'source'
      ? (object(entry).sourceLocale ?? m.source_audit_unrecorded())
      : (object(entry).targetLocale ??
          object(entry).locale ??
          m.source_audit_unrecorded()),
  )
let excludedSource = $state<string[]>([])
let excludedTarget = $state<string[]>([])
let expanded = $state<number[]>([])
let visible = $state(24)
let pendingToggle = $state<string | null>(null)
let scroller: HTMLElement | undefined = $state()
const nextPaint = () =>
  new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
$effect(() => {
  query
  visible = 24
  expanded = []
  scroller?.scrollTo(0, 0)
})
let sourceLocales = $derived(
  [...new Set(entries.map(entry => locale(entry, 'source')))].sort(),
)
let targetLocales = $derived(
  [...new Set(entries.map(entry => locale(entry, 'target')))].sort(),
)
let searched = $derived(
  entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => matchesAudit(query, m.source_audit_translations(), entry)),
)
let matching = $derived(
  searched.filter(
    ({ entry }) =>
      !excludedSource.includes(locale(entry, 'source')) &&
      !excludedTarget.includes(locale(entry, 'target')),
  ),
)
async function toggle(side: 'source' | 'target', value: string) {
  if (pendingToggle) return
  pendingToggle = `${side}:${value}`
  const feedback = new Promise(resolve => setTimeout(resolve, 200))
  await tick()
  await nextPaint()
  await nextPaint()
  try {
    if (side === 'source')
      excludedSource = excludedSource.includes(value)
        ? excludedSource.filter(item => item !== value)
        : [...excludedSource, value]
    else
      excludedTarget = excludedTarget.includes(value)
        ? excludedTarget.filter(item => item !== value)
        : [...excludedTarget, value]
    visible = 24
    expanded = []
    scroller?.scrollTo(0, 0)
    await tick()
    await nextPaint()
    await feedback
  } finally {
    pendingToggle = null
  }
}
</script>

{#if searched.length}
  <section class="space-y-3" aria-label={m.source_audit_translations()}>
    {#if showHeader}
      <header class="flex flex-wrap items-start justify-between gap-4 px-2">
        <h3 class="text-lg font-medium">
          {m.source_audit_translations()}
          <span class="ml-1 text-sm font-normal opacity-45"
            >{matching.length.toLocaleString()}</span
          >
        </h3>
        <div class="flex flex-wrap gap-x-6 gap-y-3">
          {#each [{ side: 'source' as const, title: m.source_audit_translation_source(), locales: sourceLocales, excluded: excludedSource }, { side: 'target' as const, title: m.source_audit_target(), locales: targetLocales, excluded: excludedTarget }] as control}
            <fieldset class="flex flex-wrap items-center gap-2">
              <legend
                class="mr-1 text-xs font-medium uppercase tracking-wide opacity-50"
              >
                {control.title}
              </legend>
              {#each control.locales as value}
                <button
                  type="button"
                  class={['cursor-pointer rounded-md border px-2 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2', pendingToggle === `${control.side}:${value}` && 'motion-safe:animate-pulse', control.excluded.includes(value) ? 'border-current/10 bg-current/5 text-current/40 hover:text-current/65' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20']}
                  aria-pressed={!control.excluded.includes(value)}
                  aria-label={m.source_audit_locale_filter({ side: control.title, locale: value })}
                  aria-busy={pendingToggle === `${control.side}:${value}`}
                  disabled={pendingToggle !== null}
                  onclick={event => { if (event.detail < 2) void toggle(control.side, value) }}
                >
                  {value}
                </button>
              {/each}
            </fieldset>
          {/each}
        </div>
      </header>
    {/if}
    <section
      class="max-h-[calc(48rem+10px)] overflow-y-auto overscroll-contain rounded-xl border border-current/15"
      bind:this={scroller}
      aria-busy={pendingToggle !== null}
      onscroll={event => { const element = event.currentTarget; if (!pendingToggle && element.scrollHeight - element.scrollTop - element.clientHeight < 200) visible = Math.min(visible + 24, matching.length) }}
      aria-label={m.source_audit_translation_entries()}
    >
      {#each matching.slice(0, visible) as { entry, index } (index)}
        {@const row = object(entry)}
        {@const parentName = translationParentName(row.context, getLocale())}
        {@const reference = references?.[index] ?? (fixtureIndex !== undefined ? { fixtureIndex, entryIndex: index } : undefined)}
        <details
          class="border-b border-current/10 last:border-b-0"
          open={expanded.includes(index)}
          ontoggle={event => { if (event.currentTarget.open && !expanded.includes(index)) expanded = [...expanded, index]; else if (!event.currentTarget.open && expanded.includes(index)) expanded = expanded.filter(value => value !== index) }}
        >
          <summary
            class="flex h-24 list-none cursor-pointer items-center gap-3 pl-4 pr-8 py-3 hover:bg-current/5 [&::-webkit-details-marker]:hidden"
          >
            <Origin origin={String(row.provenance ?? row.authority ?? '')} />
            <span
              class="grid h-full min-w-0 flex-1 grid-cols-[minmax(8rem,1fr)_minmax(0,2fr)] items-center gap-3"
            >
              <span class="min-w-0 space-y-2">
                <span class="flex items-center gap-1 text-[10px] sm:text-xs">
                  <span class="rounded bg-current/5 px-1.5 py-0.5 text-current/60"
                    >{locale(entry, 'source')}</span
                  >
                  <span class="opacity-30">→</span>
                  <span class="rounded bg-current/5 px-1.5 py-0.5 text-current/60"
                    >{locale(entry, 'target')}</span
                  >
                </span>
                {#if parentName}
                  <span class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span
                      role="img"
                      aria-label={m.source_audit_parent_context()}
                      title={m.source_audit_parent_division_context()}
                      class="shrink-0 opacity-40"
                      ><Location class="size-4" /></span
                    >
                    <span
                      class="min-w-0 truncate text-sm font-medium sm:text-base"
                      title={parentName}
                      >{parentName}</span
                    >
                  </span>
                {/if}
              </span>
              <span
                class="line-clamp-3 wrap-break-word text-right text-base sm:text-lg"
                title={`${String(row.sourceText ?? '')} → ${String(row.text ?? row.name ?? '')}`}
                >{String(row.sourceText ?? m.source_audit_source_text_missing())}
                <span class="opacity-40">→</span>
                <strong class="font-medium"
                  >{String(row.text ?? row.name ?? '')}</strong
                ></span
              >
            </span>
          </summary>
          <div class="border-t border-current/10 bg-current/2.5 p-4">
            {#if expanded.includes(index) && releaseId && hash && reference}
              <Applications
                {releaseId}
                {hash}
                fixtureIndex={reference.fixtureIndex}
                entryIndex={reference.entryIndex}
              />
            {:else}
              <p class="text-sm">
                {String(row.sourceText ?? '')}
                → {String(row.text ?? row.name ?? '')}
              </p>
            {/if}
          </div>
        </details>
      {/each}
      {#if !matching.length}
        <p class="p-4 text-sm opacity-60">
          {m.source_audit_no_locale_matches()}
        </p>
      {/if}
    </section>
  </section>
{/if}
