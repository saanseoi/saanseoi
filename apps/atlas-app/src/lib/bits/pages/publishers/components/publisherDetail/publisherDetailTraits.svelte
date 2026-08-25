<script lang="ts">
import { getCurrentLocale, m } from '#lib/bits/internal/i18n.js'
import type { RegistrySource } from '#lib/registry/types.js'

type Props = {
  sources: RegistrySource[]
}

let { sources }: Props = $props()
let locale = $derived(getCurrentLocale())

const uniqueValues = (values: Array<string | null | undefined>) =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].sort()

const listParts = (values: string[]) =>
  new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).formatToParts(
    values,
  )

const formatList = (values: string[]) =>
  new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(values)

const resourceTypeLabel = (resourceType: string) => {
  const labels: Record<string, () => string> = {
    address: m.publishers_resource_address,
    division: m.publishers_resource_division,
    divisionArea: m.publishers_resource_division_area,
    divisionBoundary: m.publishers_resource_division_boundary,
    divisionStatistic: m.publishers_resource_division_statistic,
    place: m.publishers_resource_place,
    street: m.publishers_resource_street,
  }
  return labels[resourceType]?.() ?? resourceType.replace(/([a-z])([A-Z])/g, '$1 $2')
}

const frequencyLabel = (frequency: string) => {
  const labels: Record<string, () => string> = {
    'as-needed': m.publishers_cadence_as_needed,
    census: m.publishers_cadence_five_yearly,
    'five-yearly': m.publishers_cadence_five_yearly,
    'half-yearly': m.publishers_cadence_half_yearly,
    monthly: m.publishers_cadence_monthly,
    quarterly: m.publishers_cadence_quarterly,
    yearly: m.publishers_cadence_yearly,
  }
  return labels[frequency]?.() ?? frequency.replaceAll('-', ' ')
}

const frequencyRank = (frequency: string) => {
  const ranks: Record<string, number> = {
    monthly: 1,
    quarterly: 2,
    'half-yearly': 3,
    yearly: 4,
    census: 5,
    'five-yearly': 5,
  }
  return ranks[frequency]
}

const frequencyRange = (frequencies: string[]) => {
  const entries = frequencies.map(frequency => ({
    label: frequencyLabel(frequency),
    rank: frequencyRank(frequency),
  }))
  const uniqueEntries = [
    ...new Map(entries.map(entry => [entry.label, entry])).values(),
  ]
  const fixedEntries = uniqueEntries
    .filter(entry => entry.rank !== undefined)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))

  if (fixedEntries.length > 1) {
    return [fixedEntries[0]?.label, fixedEntries.at(-1)?.label].filter(
      (label): label is string => Boolean(label),
    )
  }

  return uniqueEntries.map(entry => entry.label)
}

const regionLabel = (regionCode: string) => {
  if (regionCode === 'hk') return m.postcard_region_hk()
  if (regionCode === 'mo') return m.postcard_region_mo()
  if (regionCode === 'gba') return m.postcard_region_gba()
  return regionCode.toUpperCase()
}

let resourceTypes = $derived(
  uniqueValues(sources.flatMap(source => source.resourceTypes)).map(resourceTypeLabel),
)
let regions = $derived(
  uniqueValues(sources.map(source => source.regionCode)).map(regionLabel),
)
let frequencies = $derived(
  frequencyRange(uniqueValues(sources.map(source => source.releaseFrequency))),
)
let licences = $derived(uniqueValues(sources.map(source => source.license?.code)))
let publishesParts = $derived(
  m
    .publishers_traits_publishes({ resources: '{resources}', regions: '{regions}' })
    .split(/(\{resources\}|\{regions\})/),
)
let resourceListParts = $derived(listParts(resourceTypes))
let frequencySentence = $derived(
  frequencies.length === 0
    ? ''
    : frequencies.length === 1
      ? m.publishers_traits_frequency_single({ frequency: frequencies[0] })
      : m.publishers_traits_frequency_multiple({
          shortest: frequencies[0] ?? '',
          longest: frequencies.at(-1) ?? '',
        }),
)
let licenceMessage = $derived(
  licences.length === 1
    ? m.publishers_traits_license_single({ licence: '{licence}' })
    : m.publishers_traits_license_multiple({ licences: '{licences}' }),
)
let licenceParts = $derived(licenceMessage.split(/(\{licence\}|\{licences\})/))
let licenceListParts = $derived(listParts(licences))
</script>

<p class="mt-3 max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
  {#each publishesParts as part}
    {#if part === '{resources}'}
      {#each resourceListParts as resourcePart}
        {#if resourcePart.type === 'element'}
          <code
            class="rounded-sm bg-secondary/10 px-1.5 py-0.5 font-mono text-[0.9em] font-semibold text-secondary dark:bg-secondary/16"
            >{resourcePart.value}</code
          >
        {:else}
          {resourcePart.value}
        {/if}
      {/each}
    {:else if part === '{regions}'}
      {formatList(regions)}
    {:else}
      {part}
    {/if}
  {/each}
  {' '}{frequencySentence}{' '}
  {#if licences.length === 0}
    {m.publishers_traits_license_unspecified()}
  {:else}
    {#each licenceParts as part}
      {#if part === '{licence}' || part === '{licences}'}
        {#each licenceListParts as licencePart}
          {#if licencePart.type === 'element'}
            <code
              class="rounded-sm bg-secondary/10 px-1.5 py-0.5 font-mono text-[0.9em] font-semibold text-secondary dark:bg-secondary/16"
              >{licencePart.value}</code
            >
          {:else}
            {licencePart.value}
          {/if}
        {/each}
      {:else}
        {part}
      {/if}
    {/each}
  {/if}
</p>
