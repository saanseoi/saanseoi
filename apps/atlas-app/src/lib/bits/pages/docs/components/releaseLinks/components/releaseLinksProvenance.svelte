<script lang="ts">
import { Tooltip } from 'bits-ui'

import ReleaseLinksActions from './releaseLinksActions.svelte'
import ReleaseLinksCard from './releaseLinksCard.svelte'
import ReleaseLinksEmptyState from './releaseLinksEmptyState.svelte'
import ReleaseLinksGroup from './releaseLinksGroup.svelte'
import ReleaseLinksProvenanceFactGrid from './releaseLinksProvenanceFactGrid.svelte'
import ReleaseLinksRequestExample from './releaseLinksRequestExample.svelte'
import type {
  ReleaseAnalyticsSurface,
  ReleaseLinksProvenancePresentation,
} from './releaseLinks.types'

type Props = {
  copyRequestLabel?: string
  emptyLabel?: string
  presentation: ReleaseLinksProvenancePresentation
  requestLabel?: string
  analyticsSurface: ReleaseAnalyticsSurface
}

let {
  copyRequestLabel = 'Copy request',
  emptyLabel,
  presentation,
  requestLabel = 'Request',
  analyticsSurface,
}: Props = $props()

let groups = $derived(presentation.groups.filter(group => group.entries.length))
</script>

<Tooltip.Provider delayDuration={200}>
  {#if groups.length}
    {#each groups as group}
      <ReleaseLinksGroup
        id={group.id}
        label={group.label}
        title={group.title}
        count={group.entries.length}
      >
        <div class="relative grid gap-6 p-5 pl-12">
          {#each group.entries as entry, index (entry.id ?? entry.href)}
            <div
              class="relative"
              style:--release-accent={entry.accentColour ?? 'var(--secondary)'}
            >
              {#if index === 0}
                <span
                  class="absolute -top-5 -left-6 h-11.5 border-l border-data-outline-variant/70"
                  aria-hidden="true"
                ></span>
              {/if}
              {#if index < group.entries.length - 1}
                <span
                  class="absolute top-6.5 -bottom-12.5 -left-6 border-l border-data-outline-variant/70"
                  aria-hidden="true"
                ></span>
              {/if}
              <span
                class="absolute top-6.5 -left-6 z-0 h-px w-6 bg-data-outline-variant/70"
                aria-hidden="true"
              ></span>
              <span
                class="absolute top-5.5 left-[-1.65rem] z-10 size-2 rounded-full bg-(--release-accent) ring-4 ring-(--release-list-surface)"
                aria-hidden="true"
              ></span>
              {#if entry.description || entry.request || entry.facts?.length || entry.actions?.length}
                <ReleaseLinksCard {...entry}>
                  <div class="grid gap-5">
                    {#if entry.description}
                      <p
                        class="font-body text-body-sm leading-relaxed text-foreground-alt"
                      >
                        {entry.description}
                      </p>
                    {/if}
                    {#if entry.request}
                      <ReleaseLinksRequestExample
                        request={entry.request}
                        label={entry.requestLabel ?? requestLabel}
                        copyLabel={copyRequestLabel}
                        {analyticsSurface}
                      />
                    {/if}
                    <ReleaseLinksActions {analyticsSurface} actions={entry.actions} />
                    <ReleaseLinksProvenanceFactGrid facts={entry.facts} />
                  </div>
                </ReleaseLinksCard>
              {:else}
                <ReleaseLinksCard {...entry} />
              {/if}
            </div>
          {/each}
        </div>
      </ReleaseLinksGroup>
    {/each}
  {:else if emptyLabel}
    <ReleaseLinksEmptyState label={emptyLabel} />
  {/if}
</Tooltip.Provider>
