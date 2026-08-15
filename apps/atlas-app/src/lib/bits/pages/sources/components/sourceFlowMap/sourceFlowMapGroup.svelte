<script lang="ts">
import { slide } from 'svelte/transition'

import { m } from '#lib/bits/internal/i18n.js'
import SourceFlowMapConnectors from './sourceFlowMapConnectors.svelte'
import SourceFlowMapInput from './sourceFlowMapInput.svelte'
import SourceFlowMapOutput from './sourceFlowMapOutput.svelte'
import type {
  SourceFlowDomain,
  SourceFlowInput,
  SourceFlowLane,
} from './sourceFlowMapTypes'

type Props = {
  lane: SourceFlowLane
  laneIndex: number
  inputs: SourceFlowInput[]
  groupId: string
  domain?: SourceFlowDomain
  visible: boolean
  isLaneExpanded: boolean
  isDomainExpanded: boolean
  isDefaultInputListExpanded: boolean
  visibleVariantCount: number
  remainingDefaultInputCount: number
  remainingGroupCount: number
  onToggleLane: (laneId: string) => void
  onToggleDomain: (domainId: string) => void
  onToggleDefaultInputList: (laneId: string) => void
}

let {
  lane,
  laneIndex,
  inputs,
  groupId,
  domain,
  visible,
  isLaneExpanded,
  isDomainExpanded,
  isDefaultInputListExpanded,
  visibleVariantCount,
  remainingDefaultInputCount,
  remainingGroupCount,
  onToggleLane,
  onToggleDomain,
  onToggleDefaultInputList,
}: Props = $props()
let groupElement = $state<HTMLElement>()

const groupLabel = (currentLane: SourceFlowLane) =>
  currentLane.groupLabel === 'cohort'
    ? m.sources_flow_cohort()
    : m.sources_flow_domain()
const groupLabels = (currentLane: SourceFlowLane) =>
  currentLane.groupLabel === 'cohort'
    ? m.sources_flow_cohorts()
    : m.sources_flow_domains()

let isPrimaryDefaultGroup = $derived(
  !domain || (lane.defaultGroupExpanded && domain.label === lane.primaryGroupLabel),
)
let shouldShowDomainToggle = $derived(
  Boolean(
    domain?.variants.length &&
      visibleVariantCount &&
      !(lane.defaultGroupExpanded && domain.label === lane.primaryGroupLabel),
  ),
)
let shouldShowDefaultInputToggle = $derived(
  Boolean(
    isPrimaryDefaultGroup &&
      lane.defaultInputLimit &&
      (remainingDefaultInputCount || isDefaultInputListExpanded),
  ),
)
let shouldShowLaneToggle = $derived(
  Boolean(
    !lane.defaultAllGroupsExpanded && isPrimaryDefaultGroup && lane.domains.length > 1,
  ),
)
</script>

{#if visible}
  <section
    bind:this={groupElement}
    class={`source-flow-lane source-flow-lane-${lane.id}`}
    transition:slide={{ duration: 220, axis: 'y' }}
    style={`--flow-accent: ${lane.accent}; --flow-connector: ${lane.id === 'addresses' ? lane.secondary : lane.accent}; --flow-label: ${lane.id === 'addresses' || lane.id === 'stats' || lane.id === 'streets' ? lane.secondary : lane.accent}; --flow-ink: ${lane.ink}; --flow-index: ${laneIndex}; --visible-source-count: ${inputs.length};`}
    aria-labelledby={`source-flow-${groupId}`}
  >
    <div class="source-flow-inputs">
      {#each inputs as input (input.id)}
        <SourceFlowMapInput {input} />
      {/each}

      {#if shouldShowDomainToggle && domain}
        <button
          class="source-flow-more"
          type="button"
          aria-expanded={isDomainExpanded}
          onclick={() => onToggleDomain(domain.id)}
        >
          {#if isDomainExpanded}
            {m.sources_flow_hide()}
          {:else}
            <span>{m.sources_flow_show()}</span>
            <strong>{visibleVariantCount}</strong>
            <span>{m.sources_flow_more()}</span>
          {/if}
        </button>
      {/if}

      {#if shouldShowDefaultInputToggle}
        <button
          class="source-flow-more"
          type="button"
          aria-expanded={isDefaultInputListExpanded}
          onclick={() => onToggleDefaultInputList(lane.id)}
        >
          {#if isDefaultInputListExpanded}
            {m.sources_flow_hide()}
          {:else}
            <span>{m.sources_flow_show()}</span>
            <strong>{remainingDefaultInputCount}</strong>
            <span>{m.sources_flow_more()}</span>
          {/if}
        </button>
      {/if}

      {#if shouldShowLaneToggle}
        <button
          class="source-flow-more"
          type="button"
          aria-expanded={isLaneExpanded}
          onclick={() => onToggleLane(lane.id)}
        >
          {#if isLaneExpanded}
            {m.sources_flow_hide()} {groupLabels(lane)}
          {:else}
            <span>{m.sources_flow_show()}</span>
            <strong>{remainingGroupCount}</strong>
            <span>{groupLabels(lane)}</span>
          {/if}
        </button>
      {/if}
    </div>

    <dl class="source-flow-gutter">
      <dt>{groupLabel(lane)}</dt>
      <dd>{domain?.label ?? lane.primaryGroupLabel}</dd>
    </dl>

    <SourceFlowMapConnectors {groupElement} {inputs} />
    <SourceFlowMapOutput {lane} {groupId} />
  </section>
{/if}

<style>
.source-flow-lane {
  position: relative;
  display: grid;
  min-height: 9.5rem;
  grid-template-columns: minmax(0, 1.25fr) minmax(8rem, 0.46fr) minmax(14rem, 0.72fr);
  align-items: start;
  gap: 1.25rem;
  padding: 1rem 0;
}
.source-flow-lane:not(:last-child) {
  border-bottom: 1px solid color-mix(in srgb, var(--outline-variant) 82%, transparent);
}
.source-flow-inputs {
  grid-column: 1;
  grid-row: 1;
  display: grid;
  gap: 0.75rem;
}
.source-flow-more {
  justify-self: center;
  display: inline-flex;
  align-items: baseline;
  gap: 0.32rem;
  border: 0;
  background: transparent;
  padding: 0.35rem 0;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--foreground-alt);
  text-transform: uppercase;
  cursor: pointer;
}
.source-flow-more strong {
  color: var(--flow-accent);
  font-size: 1.15rem;
  font-weight: 900;
  line-height: 1;
}
.source-flow-more:hover,
.source-flow-more:focus-visible {
  color: var(--primary);
  outline: none;
  text-decoration: underline;
  text-decoration-color: var(--flow-accent);
  text-underline-offset: 0.28rem;
}
.source-flow-gutter {
  grid-column: 2;
  grid-row: 1;
  z-index: 1;
  display: grid;
  min-height: 5.65rem;
  align-self: start;
  align-content: center;
  gap: 0.18rem;
  margin-top: 9px;
  margin-left: -12px;
  padding: 0;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  text-transform: uppercase;
}
.source-flow-gutter dt {
  font-size: 0.62rem;
  font-weight: 800;
  color: color-mix(in srgb, var(--foreground-alt) 72%, transparent);
}
.source-flow-gutter dd {
  margin: 0;
  font-size: 0.76rem;
  font-weight: 800;
  color: var(--flow-label);
}
:global(.dark) .source-flow-lane-streets .source-flow-gutter dd {
  color: var(--flow-accent);
}
@media (max-width: 900px) {
  .source-flow-lane {
    --stacked-flow-gutter: 1rem;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    padding: 1rem 0 1.25rem;
  }
  .source-flow-inputs,
  .source-flow-gutter {
    position: relative;
    z-index: 1;
    margin-left: var(--stacked-flow-gutter);
  }
  .source-flow-gutter {
    grid-column: 1;
    grid-row: auto;
    min-height: 2.75rem;
    align-content: start;
    gap: 0.1rem;
    padding-top: 0.25rem;
  }
}
</style>
