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

function positionConnector(node: HTMLElement) {
  const header = node.querySelector<HTMLElement>('[data-release-link-heading]')
  if (!header) return

  const update = () => {
    const connectorY =
      header.getBoundingClientRect().top -
      node.getBoundingClientRect().top +
      header.getBoundingClientRect().height / 2
    node.style.setProperty('--release-connector-y', `${connectorY}px`)
  }
  const observer = new ResizeObserver(update)
  observer.observe(header)
  update()

  return {
    destroy: () => observer.disconnect(),
  }
}
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
              use:positionConnector
            >
              {#if index === 0}
                <span
                  class="absolute -top-5 -left-6 border-l border-data-outline-variant/70"
                  style="height: calc(var(--release-connector-y, 1.625rem) + 1.25rem)"
                  aria-hidden="true"
                ></span>
              {/if}
              {#if index < group.entries.length - 1}
                <span
                  class="absolute -left-6 border-l border-data-outline-variant/70"
                  style="top: var(--release-connector-y, 1.625rem); bottom: calc(-1.5rem - var(--release-connector-y, 1.625rem))"
                  aria-hidden="true"
                ></span>
              {/if}
              <span
                class="absolute -left-6 z-0 h-px w-6 bg-data-outline-variant/70"
                style="top: var(--release-connector-y, 1.625rem)"
                aria-hidden="true"
              ></span>
              <span
                class="absolute left-[-1.65rem] z-10 size-2 rounded-full bg-(--release-accent) ring-4 ring-(--release-list-surface)"
                style="top: calc(var(--release-connector-y, 1.625rem) - 0.25rem)"
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
