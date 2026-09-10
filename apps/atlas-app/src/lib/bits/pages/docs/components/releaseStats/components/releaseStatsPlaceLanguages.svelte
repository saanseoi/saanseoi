<script lang="ts">
import type { PlaceProfile } from '../placeProfile'
import Section from './releaseStatsSection.svelte'
import Header from './releaseStatsSectionHeader.svelte'
let { profile }: { profile: PlaceProfile } = $props()
let selected = $state('')
let field = $derived(
  profile.fields.find(field => field.code === selected) ?? profile.fields[0],
)
let chartRows = $derived(
  field
    ? [
        field.any,
        ...['en', 'zh-hant', 'zh-hans'].map(
          locale =>
            field.rows.find(row => row.locale === locale) ?? {
              code: locale,
              label: {
                en: 'English',
                'zh-hant': 'Traditional Chinese',
                'zh-hans': 'Simplified Chinese',
              }[locale],
              coverage: 0,
              coverageLabel: '—',
              count: '—',
            },
        ),
      ]
    : [],
)
</script>

{#if field}
  <Section id="stats-place-languages">
    <Header eyebrow="Completeness" title="Language coverage" />
    <div
      class="flex flex-wrap items-center justify-between gap-3 border-b border-data-outline-variant/60 px-5 py-4"
    >
      <label class="flex items-center gap-3 text-label-md font-semibold text-primary">
        Field
        <select
          aria-label="Localised field"
          value={field.code}
          onchange={event => selected = event.currentTarget.value}
          class="rounded border border-data-outline-variant bg-data-surface-container-lowest px-3 py-2 text-primary focus-visible:outline-2 focus-visible:outline-data-primary"
        >
          {#each profile.fields as option}
            <option value={option.code}>{option.label}</option>
          {/each}
        </select>
      </label>
      <p class="text-caption text-foreground-alt">
        Coverage as a percentage of all places
      </p>
    </div>
    <div class="px-5 py-4">
      <div
        class="grid grid-cols-[minmax(0,1fr)_minmax(60px,1fr)_auto] items-center gap-x-4 gap-y-4 sm:grid-cols-[minmax(0,1fr)_minmax(80px,2fr)_auto_auto]"
      >
        <span class="text-caption text-foreground-alt">Language</span>
        <span class="col-span-2 text-right text-caption text-foreground-alt"
          >Coverage</span
        >
        <span class="hidden text-right text-caption text-foreground-alt sm:block"
          >Values</span
        >
        {#each chartRows as row}
          <span class="text-label-md font-semibold text-primary">{row.label}</span>
          <div
            class="h-3 overflow-hidden bg-data-outline-variant/30"
            aria-hidden="true"
          >
            <div
              class="h-full bg-data-success"
              style:width={`${Math.max(0, Math.min(100, row.coverage))}%`}
            ></div>
          </div>
          <span class="font-mono text-label-md tabular-nums text-primary"
            >{row.coverageLabel}</span
          >
          <span
            class="hidden text-right font-mono text-label-md tabular-nums text-foreground-alt sm:block"
            >{row.count}</span
          >
        {/each}
      </div>
    </div>
    <p class="px-5 pb-4 text-caption text-foreground-alt">
      Any counts each place once across all languages.
      {#if !field.any.available}
        Combined coverage is not recorded for this field; — means unavailable.
      {/if}
    </p>
    <details class="border-t border-data-outline-variant/60">
      <summary
        class="cursor-pointer px-5 py-4 text-label-md font-semibold text-primary focus-visible:outline-2 focus-visible:outline-data-primary"
      >
        Provenance and missing values · {field.rows.length} locales
      </summary>
      <p class="px-5 pb-3 text-caption text-foreground-alt">
        Provenance percentages use all places as the denominator. Missing values and
        conflicts are counts.
      </p>
      <div class="overflow-x-auto px-5 pb-5">
        <table class="w-full text-left text-label-md text-primary">
          <thead class="text-caption text-foreground-alt">
            <tr>
              {#each ['Language', 'Coverage', 'Values', 'Provided', 'Inferred', 'AI translated', 'Human translated', 'Missing', 'Conflicts'] as label}
                <th class="px-2 py-2 font-medium whitespace-nowrap">{label}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each field.rows as row}
              <tr class="border-t border-data-outline-variant/40">
                <th class="px-2 py-3 font-medium whitespace-nowrap">{row.label}</th>
                {#each [row.coverageLabel, row.count, row.provided, row.inferred, row.ai, row.human, row.missing, row.conflicts] as value}
                  <td class="px-2 py-3 font-mono tabular-nums whitespace-nowrap">
                    {value}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </details>
    {#if profile.locales.length}
      <details class="border-t border-data-outline-variant/60">
        <summary
          class="cursor-pointer px-5 py-4 text-label-md font-semibold text-primary"
        >
          Localised records by language
        </summary>
        <dl class="grid grid-cols-2 gap-x-6 gap-y-3 px-5 pb-5 sm:grid-cols-3">
          {#each profile.locales as row}
            <div>
              <dt class="text-label-md text-foreground-alt">{row.label}</dt>
              <dd class="font-mono tabular-nums text-primary">{row.value}</dd>
            </div>
          {/each}
        </dl>
      </details>
    {/if}
  </Section>
{/if}
