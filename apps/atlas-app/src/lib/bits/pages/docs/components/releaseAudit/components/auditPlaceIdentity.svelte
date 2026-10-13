<script lang="ts">
import type { Json } from '@repo/core/provenance'
import FixtureDisclosure from './auditFixtureDisclosure.svelte'
const object = (value: Json | undefined): Record<string, Json> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const list = (value: Json | undefined): Json[] => (Array.isArray(value) ? value : [])
const display = (value: Json | undefined): string =>
  value == null || value === '' || (Array.isArray(value) && !value.length)
    ? 'Unknown'
    : Array.isArray(value)
      ? value.map(display).join(' · ')
      : String(value)
let { value }: { value: Json } = $props()
let row = $derived(object(value))
let incoming = $derived(object(row.evidence))
const fields = [
  'sourceId',
  'names',
  'phones',
  'category',
  'hours',
  'socials',
  'websites',
  'emails',
  'attribution',
  'addresses',
  'units',
  'floors',
  'lng',
  'lat',
]
const label = (key: string) =>
  key === 'sourceId'
    ? 'Publisher ID'
    : key === 'hours'
      ? 'Opening hours'
      : key.charAt(0).toUpperCase() + key.slice(1)
</script>

<FixtureDisclosure>
  {#snippet summary()}
    {display(incoming.names)}
    · {row.outcome === 'matched' ? 'ID reused' : 'New ID'} · {display(row.reason)}
  {/snippet}
  <div class="space-y-3 text-sm">
    <p>
      Automatic decision · {display(row.model)} · assignment release
      {display(row.sourceRelease)}
    </p>
    <p>Canonical ID: <code class="break-all">{display(row.id)}</code></p>
    <p>
      Policy threshold: {display(row.threshold)}; required margin:
      {display(row.requiredMargin)}. Scores are policy weights, not probabilities.
    </p>
    <p>
      Alternative margin:
      {row.alternativeMargin == null
        ? 'No eligible alternative'
        : display(row.alternativeMargin)}; competing observation margin:
      {row.rivalMargin == null ? 'No competing observation' : display(row.rivalMargin)}.
    </p>
    {#if !list(row.candidates).length}
      <p>
        No predecessor candidate shares a publisher ID, attribution, phone, social URL
        or email.
      </p>
      <p>Publisher ID: <code>{display(incoming.sourceId)}</code></p>
    {/if}
    {#each list(row.candidates) as candidate}
      {@const prior = object(candidate)}
      {@const before = object(prior.evidence)}
      <div class="space-y-2 border-l border-current/20 pl-3">
        <p class="font-medium">
          {row.outcome === 'matched' && prior.id === row.id
            ? 'Selected predecessor'
            : 'Alternative predecessor'}:
          <code class="break-all">{display(prior.id)}</code>
        </p>
        <p>
          Predecessor release: {display(prior.release)} · score {display(prior.score)} ·
          {display(prior.distanceMetres)}
          m ·
          {prior.eligible
            ? 'Passes evidence requirements'
            : 'Rejected by evidence requirements'}
        </p>
        <p>
          Agreements:
          {list(prior.agreements).length ? display(prior.agreements) : 'None'}.
          Conflicts: {list(prior.conflicts).length ? display(prior.conflicts) : 'None'}.
        </p>
        <table
          class="w-full table-fixed text-left [&_td]:wrap-break-word [&_td]:align-top [&_td]:p-2 [&_th]:p-2"
        >
          <thead>
            <tr>
              <th>Evidence</th>
              <th>Previous</th>
              <th>Incoming</th>
            </tr>
          </thead>
          <tbody>
            {#each fields as field}
              <tr class="border-t border-current/10">
                <th>{label(field)}</th>
                <td>{display(before[field])}</td>
                <td>{display(incoming[field])}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/each}
    {#if list(row.rivals).length}
      <p class="font-medium">Competing incoming observations</p>
      {#each list(row.rivals) as rival}
        <p>
          <code>{display(object(rival).sourceId)}</code>
          · score {display(object(rival).score)}
        </p>
      {/each}
    {/if}
    <p class="opacity-65">
      Unknown means missing evidence, not agreement. Up to five predecessor candidates
      and five competing observations are shown.
    </p>
  </div>
</FixtureDisclosure>
