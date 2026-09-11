<script lang="ts">
import type { StatisticsProfilePresentation } from '../releaseStats.types'
import type { Snippet } from 'svelte'
import Locale from './releaseStatsStatisticsLocale.svelte'
import Distribution from './releaseStatsProfileDistribution.svelte'
import Availability from './releaseStatsProfileAvailability.svelte'

let {
  profile,
  structural,
}: { profile: StatisticsProfilePresentation; structural?: Snippet } = $props()

let distributionColumns = $derived.by(() => {
  const columns: StatisticsProfilePresentation['distributions'][] = [[], []]
  const heights = [0, 0]
  const tallestFirst = [...profile.distributions].sort(
    (a, b) => b.rows.length - a.rows.length,
  )

  for (const distribution of tallestFirst) {
    const column = heights[0] <= heights[1] ? 0 : 1
    columns[column].push(distribution)
    // Include the shared header, padding and gap as well as the data rows.
    heights[column] += 120 + distribution.rows.length * 32
  }

  return columns
})
</script>

{#if profile.coverage}
  <section class="py-6">
    <h2 id="stats-profile-coverage" class="sr-only">Field coverage</h2>
    <p
      class="flex flex-wrap items-baseline justify-center gap-x-5 gap-y-3 text-center font-body"
    >
      <span class="inline-flex items-baseline gap-2.5 whitespace-nowrap">
        <strong
          class="font-display text-4xl font-semibold leading-none tracking-tight text-primary tabular-nums sm:text-5xl"
          >{profile.coverage.uniform ? profile.coverage.fieldCount : profile.coverage.standardCount}</strong
        >
        <span
          class="text-caption font-medium tracking-[0.12em] text-foreground-alt uppercase"
        >
          {profile.coverage.uniform ? 'fields' : `of ${profile.coverage.fieldCount} fields`}
        </span>
      </span>
      <span class="text-label-md text-foreground-alt">each with</span>
      <span class="inline-flex items-baseline gap-2.5 whitespace-nowrap">
        <strong
          class="font-display text-4xl font-semibold leading-none tracking-tight text-primary tabular-nums sm:text-5xl"
          >{profile.coverage.observations}</strong
        >
        <span
          class="text-caption font-medium tracking-[0.12em] text-foreground-alt uppercase"
          >observations</span
        >
      </span>
    </p>
    {#if profile.coverage.exceptions.length}
      <details class="mt-4 border-t border-data-outline-variant/60 pt-3">
        <summary class="cursor-pointer text-label-md font-semibold text-primary">
          Fields with different coverage ({profile.coverage.exceptions.length})
        </summary>
        <dl class="mt-3 divide-y divide-data-outline-variant/60">
          {#each profile.coverage.exceptions as row}
            <div class="flex items-start justify-between gap-4 py-2">
              <dt class="min-w-0 wrap-break-word text-label-md text-foreground-alt">
                {row.label}
              </dt>
              <dd class="shrink-0 font-mono text-label-md tabular-nums text-primary">
                {row.value}
              </dd>
            </div>
          {/each}
        </dl>
      </details>
    {/if}
  </section>
{/if}

{@render structural?.()}

{#if profile.availability.length}
  <Availability rows={profile.availability} />
{/if}

<div class="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
  {#each distributionColumns as column}
    <div class="grid min-w-0 gap-6">
      {#each column as distribution}
        <Distribution {distribution} />
      {/each}
    </div>
  {/each}
</div>

{#if profile.localeCoverage.length}
  <Locale rows={profile.localeCoverage} />
{/if}
