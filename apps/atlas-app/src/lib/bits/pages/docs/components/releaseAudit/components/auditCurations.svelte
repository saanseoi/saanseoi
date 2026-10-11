<script lang="ts">
import type { Json } from '@repo/core/provenance'
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { auditObject } from './auditDivisionPresentation'
import {
  curationSection,
  curationCategory,
  curationOrigin,
  type CurationCategory,
} from './auditCurationSections'
import CopyRule from './auditCopyRule.svelte'
import Records from './auditDivisionRecords.svelte'
import NameAliasRules from './auditNameAliasRules.svelte'
import ScrollArea from './auditScrollArea.svelte'
let {
  value,
  category,
  query = '',
}: { value: Json; category: CurationCategory; query?: string } = $props()
let expanded = $state<string[]>([])
let sections = $derived.by(() => {
  const rows = auditObject(value).entries
  const groups = new Map<
    string,
    { key: string; title: string; description: string; origin?: string; rows: Json[] }
  >()
  if (Array.isArray(rows))
    for (const entry of rows) {
      if (curationCategory(entry) !== category) continue
      const section = curationSection(entry)
      const origin = category === 'curations' ? curationOrigin(entry) : undefined
      if (origin) section.key += `:${origin}`
      const group = groups.get(section.key) ?? { ...section, origin, rows: [] }
      group.rows.push(entry)
      groups.set(section.key, group)
    }
  const sections = [...groups.values()]
  return sections.sort(
    (a, b) =>
      a.title.localeCompare(b.title, 'en') ||
      (a.origin ?? '').localeCompare(b.origin ?? '', 'en'),
  )
})
$effect(() => {
  expanded = query.trim() ? sections.map(section => section.key) : []
})
</script>
{#each sections as section (section.key)}
  {#if section.key === 'names.nameAliasRules'}
    <NameAliasRules entries={section.rows} {query} />
  {:else}
    <article class="space-y-3" aria-label={section.title}>
      <header class="relative px-1 pr-10">
        <div class="absolute right-0 top-0">
          <CopyRule kind="fixture" getRule={async () => ({ entries: section.rows })} />
        </div>
        <h4
          class="flex items-center gap-2 text-base font-medium"
          data-audit-toc-title={section.title}
        >
          <button
            type="button"
            class="inline-flex cursor-pointer items-center gap-2 text-left"
            aria-expanded={expanded.includes(section.key)}
            onclick={() => {
              expanded = expanded.includes(section.key)
                ? expanded.filter(key => key !== section.key)
                : [...expanded, section.key]
            }}
          >
            <Icon
              icon={expanded.includes(section.key)
                ? 'proicons:chevron-down'
                : 'proicons:chevron-right'}
              class="size-4 shrink-0"
              aria-hidden="true"
            />
            {section.title}
          </button>
          <span class="text-sm tabular-nums opacity-50"
            >{section.rows.length.toLocaleString()}</span
          >
          {#if section.origin}
            <span
              class="rounded border border-current/20 px-1.5 py-0.5 text-xxs font-normal uppercase opacity-60"
              title={section.origin === 'Guard'
                ? 'Decision linked to a retained guard'
                : 'Authored choice with no recorded guard trigger'}
              >{section.origin}</span
            >
          {/if}
        </h4>
        <p class="mt-1 text-sm leading-relaxed opacity-60">{section.description}</p>
      </header>
      {#if expanded.includes(section.key)}
        <ScrollArea
          containerClass="overflow-hidden rounded-xl border border-current/15"
          viewportClass="max-h-[640px] overflow-auto"
        >
          {#snippet children()}
            <Records
              value={{ entries: section.rows }}
              type="curation-definitions"
              showDescription={false}
              framed={false}
            />
          {/snippet}
        </ScrollArea>
      {/if}
    </article>
  {/if}
{/each}
