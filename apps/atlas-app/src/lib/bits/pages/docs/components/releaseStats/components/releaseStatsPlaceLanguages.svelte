<script lang="ts">
import type { PlaceProfile } from '../placeProfile'
import Section from './releaseStatsSection.svelte'
import Header from './releaseStatsSectionHeader.svelte'
import CoverageBar from './releaseStatsCoverageBar.svelte'
let { profile }: { profile: PlaceProfile } = $props()
let selected = $state('')
let field = $derived(
  profile.fields.find(field => field.code === selected) ?? profile.fields[0],
)
let chartRows = $derived(
  field
    ? [
        ...(field.any.available
          ? [
              {
                ...field.any,
                segments: [{ tone: 'total' as const, value: field.any.coverage }],
              },
            ]
          : []),
        ...field.rows,
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
          onchange={event => (selected = event.currentTarget.value)}
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
    <div class="px-5 py-5">
      <dl
        class="grid grid-cols-[minmax(0,1fr)_minmax(80px,2fr)] items-center gap-x-4 gap-y-5 sm:grid-cols-[minmax(0,1fr)_minmax(80px,2fr)_auto]"
      >
        <span class="text-caption text-foreground-alt">Language</span>
        <span class="text-caption text-foreground-alt">Coverage</span>
        <span class="hidden text-right text-caption text-foreground-alt sm:block"
          >Values</span
        >
        {#each chartRows as row}
          <dt class="text-label-md font-semibold text-primary">
            {row.label}
            <span
              class="mt-1 block font-mono text-caption font-normal tabular-nums text-foreground-alt sm:hidden"
              >{row.count}
              values</span
            >
          </dt>
          <dd>
            <CoverageBar
              coverage={row.coverage}
              segments={row.segments}
              label={row.coverageLabel}
              ariaLabel={`${row.label}: ${row.coverageLabel}, ${row.count} values`}
            />
          </dd>
          <dd
            class="hidden text-right font-mono text-label-md tabular-nums text-primary sm:block"
          >
            {row.count}
          </dd>
        {/each}
      </dl>
      <ul
        class="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-caption text-foreground-alt"
        aria-label="Language provenance legend"
      >
        {#each [
          { label: 'Provided', tone: 'bg-data-success' },
          { label: 'Inferred', tone: 'bg-data-inferred' },
          { label: 'AI translated', tone: 'bg-data-ai-translated' },
          { label: 'Human translated', tone: 'bg-data-human-translated' },
        ] as item}
          <li class="inline-flex items-center gap-1.5">
            <span class={`size-2 rounded-full ${item.tone}`}></span>{item.label}
          </li>
        {/each}
      </ul>
    </div>
    <p class="px-5 pb-4 text-caption text-foreground-alt">
      {#if field.any.available}
        Any counts each place once across all languages.
      {/if}
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
              {#each [
                'Language',
                'Coverage',
                'Values',
                'Provided',
                'Inferred',
                'AI translated',
                'Human translated',
                'Missing',
                'Conflicts',
              ] as label}
                <th class="px-2 py-2 font-medium whitespace-nowrap">{label}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each field.rows as row}
              <tr class="border-t border-data-outline-variant/40">
                <th class="px-2 py-3 font-medium whitespace-nowrap">{row.label}</th>
                {#each [
                  row.coverageLabel,
                  row.count,
                  row.provided,
                  row.inferred,
                  row.ai,
                  row.human,
                  row.missing,
                  row.conflicts,
                ] as value}
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
