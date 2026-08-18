<script lang="ts">
import type { MeasuresPresentation } from '../releaseStats.types'
import Section from './releaseStatsSection.svelte'

let { measures }: { measures: MeasuresPresentation } = $props()

const unitLabel = (unitCode: string) =>
  unitCode === 'publisher-unknown'
    ? 'Not mapped'
    : unitCode.replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
</script>

<Section class="overflow-hidden">
  <div class="px-5 pb-4 pt-5">
    <h2
      id={measures.id}
      class="font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
    >
      {measures.title}
    </h2>
  </div>
  <div class="overflow-x-auto border-t border-data-outline-variant/60">
    <table class="w-full min-w-4xl border-collapse text-left">
      <thead class="bg-data-surface-container-lowest">
        <tr class="border-b border-data-outline-variant/60">
          <th
            class="px-5 py-3 font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
          >
            Measure
          </th>
          <th
            class="px-5 py-3 font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
          >
            Definition
          </th>
          <th
            class="px-5 py-3 font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
          >
            Unit
          </th>
          <th
            class="px-5 py-3 font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
          >
            Value kind
          </th>
          <th
            class="px-5 py-3 text-right font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
          >
            Observations
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-data-outline-variant/60">
        {#each measures.rows as measure}
          <tr class="align-top bg-data-surface-container-low">
            <th
              scope="row"
              class="px-5 py-4 font-body text-label-md font-semibold text-primary"
            >
              <p>{measure.name}</p>
              <code
                class="mt-1 block font-mono text-caption font-medium text-foreground-alt"
                >{measure.sourceField}</code
              >
            </th>
            <td class="max-w-xl px-5 py-4 font-body text-label-md text-primary">
              {measure.definition ?? 'Definition not yet reviewed'}
            </td>
            <td
              class={`px-5 py-4 font-body text-label-md font-semibold ${measure.unitCode === 'publisher-unknown' ? 'text-data-warning' : 'text-primary'}`}
            >
              {unitLabel(measure.unitCode)}
            </td>
            <td class="px-5 py-4 font-body text-label-md text-primary">
              {measure.valueKind}
            </td>
            <td
              class="px-5 py-4 text-right font-mono text-label-md font-bold tabular-nums text-primary"
            >
              {measure.observationCount}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</Section>
