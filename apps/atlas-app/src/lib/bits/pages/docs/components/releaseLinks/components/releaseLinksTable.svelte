<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import ReleaseLinksEmptyState from './releaseLinksEmptyState.svelte'
import ReleaseLinksGroup from './releaseLinksGroup.svelte'
import type { ReleaseLinksProvenancePresentation } from './releaseLinks.types'

type Props = {
  emptyLabel?: string
  presentation: ReleaseLinksProvenancePresentation
}

let { emptyLabel, presentation }: Props = $props()
let groups = $derived(presentation.groups.filter(group => group.entries.length))
</script>

{#if groups.length}
  {#each groups as group}
    <ReleaseLinksGroup
      id={group.id}
      label={group.label}
      title={group.title}
      count={group.entries.length}
    >
      <div class="overflow-x-auto">
        <table class="min-w-full border-collapse text-left font-body text-body-sm">
          <caption class="sr-only">
            {group.label ?? group.title ?? m.pipeline_sources_eyebrow()}
          </caption>
          <thead class="bg-data-surface-container-lowest">
            <tr class="border-b border-data-outline-variant/60">
              <th class="px-5 py-3 font-semibold text-foreground-alt" scope="col">
                {m.source_role()}
              </th>
              <th class="px-5 py-3 font-semibold text-foreground-alt" scope="col">
                {m.source_dataset()}
              </th>
              <th class="px-5 py-3 font-semibold text-foreground-alt" scope="col">
                {m.source_resource_type()}
              </th>
              <th class="px-5 py-3 font-semibold text-foreground-alt" scope="col">
                {m.source_release()}
              </th>
            </tr>
          </thead>
          <tbody>
            {#each group.entries as entry (entry.id ?? entry.href)}
              <tr class="border-b border-data-outline-variant/40 last:border-b-0">
                <td class="px-5 py-4 align-top">
                  {entry.role === 'primary'
                    ? m.source_role_primary()
                    : m.source_role_supporting()}
                </td>
                <td class="px-5 py-4 align-top">
                  <a
                    class="mt-1 block font-mono font-semibold text-primary underline decoration-data-primary/50 underline-offset-4 hover:text-data-primary"
                    href={entry.href}
                  >
                    {entry.datasetName ?? entry.detail ?? entry.title}
                  </a>
                </td>
                <td class="px-5 py-4 align-top text-foreground-alt">
                  {entry.eyebrow}
                </td>
                <td class="px-5 py-4 align-top font-mono text-primary">
                  {#if entry.sourceReleaseCode}
                    <a
                      class="underline decoration-data-primary/50 underline-offset-4 hover:text-data-primary"
                      href={entry.href}
                    >
                      {entry.sourceReleaseCode}
                    </a>
                  {:else}
                    —
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </ReleaseLinksGroup>
  {/each}
{:else if emptyLabel}
  <ReleaseLinksEmptyState label={emptyLabel} />
{/if}
