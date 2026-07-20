<script lang="ts">
import { slide } from 'svelte/transition'
import { m } from '$lib/bits/internal/i18n'

export type SourceFlowInput = {
  id: string
  publisher: string
  source: string
  href?: string
  icon?: string
  fallbackIcon?: string
  accent: string
  iconTone?: 'light' | 'hkgov' | 'diana'
  fields?: Array<{
    label: string
    value: string
  }>
  planned?: boolean
  variant?: string
}

export type SourceFlowDomain = {
  id: string
  label: string
  primary: SourceFlowInput
  variants: SourceFlowInput[]
}

export type SourceFlowLane = {
  id: string
  label: string
  href: string
  accent: string
  secondary: string
  ink: string
  image: string
  primary: SourceFlowInput
  primaryGroupLabel: string
  groupLabel: 'domain' | 'cohort'
  defaultGroupExpanded?: boolean
  defaultAllGroupsExpanded?: boolean
  defaultInputLimit?: number
  domains: SourceFlowDomain[]
}

let {
  lanes,
  showPlanned = $bindable(true),
  expandAll = $bindable(false),
}: {
  lanes: SourceFlowLane[]
  showPlanned?: boolean
  expandAll?: boolean
} = $props()
let expandedLaneIds = $state<string[]>([])
let expandedDomainIds = $state<string[]>([])
let expandedDefaultInputLaneIds = $state<string[]>([])
let laneElements = $state<Record<string, HTMLElement>>({})
let connectorGeometries = $state<
  Record<
    string,
    {
      inputY: number[]
      outputY: number
      lineEnd: number
    }
  >
>({})

const isExpanded = (lane: SourceFlowLane) =>
  lane.defaultAllGroupsExpanded === true || expandedLaneIds.includes(lane.id)
const groupLabel = (lane: SourceFlowLane) =>
  lane.groupLabel === 'cohort' ? m.sources_flow_cohort() : m.sources_flow_domain()
const groupLabels = (lane: SourceFlowLane) =>
  lane.groupLabel === 'cohort' ? m.sources_flow_cohorts() : m.sources_flow_domains()
const isDomainExpanded = (lane: SourceFlowLane, domain: SourceFlowDomain) =>
  lane.defaultGroupExpanded === true && domain.label === lane.primaryGroupLabel
    ? true
    : expandedDomainIds.includes(domain.id)
const isDefaultInputListExpanded = (lane: SourceFlowLane) =>
  expandAll || expandedDefaultInputLaneIds.includes(lane.id)

const isPlanned = (input: SourceFlowInput) => input.planned === true
const isVisible = (input: SourceFlowInput) => showPlanned || !isPlanned(input)
const visibleInputs = (inputs: SourceFlowInput[]) => inputs.filter(isVisible)
const remainingGroupCount = (lane: SourceFlowLane) =>
  lane.defaultGroupExpanded ? lane.domains.length - 1 : lane.domains.length

const fullDomainInputs = (lane: SourceFlowLane, domain: SourceFlowDomain) =>
  visibleInputs([
    domain.primary,
    ...(isDomainExpanded(lane, domain) ? domain.variants : []),
  ])

const visibleDomainInputs = (lane: SourceFlowLane, domain: SourceFlowDomain) => {
  const inputs = fullDomainInputs(lane, domain)
  if (
    lane.defaultInputLimit &&
    domain.label === lane.primaryGroupLabel &&
    !isDefaultInputListExpanded(lane)
  ) {
    return inputs.slice(0, lane.defaultInputLimit)
  }
  return inputs
}

const visibleDefaultInputs = (lane: SourceFlowLane) => {
  const domain = lane.domains[0]
  if (lane.defaultGroupExpanded && domain) {
    return visibleDomainInputs(lane, domain)
  }
  if (lane.domains.length === 1 && domain) return visibleDomainInputs(lane, domain)
  return visibleInputs([lane.primary])
}

const remainingDefaultInputCount = (lane: SourceFlowLane) => {
  const domain = lane.domains[0]
  if (!domain || !lane.defaultInputLimit || isDefaultInputListExpanded(lane)) return 0
  return Math.max(fullDomainInputs(lane, domain).length - lane.defaultInputLimit, 0)
}

const hasVisibleInputs = (inputs: SourceFlowInput[]) => visibleInputs(inputs).length > 0
const hasVisibleDomain = (domain: SourceFlowDomain) =>
  hasVisibleInputs([domain.primary, ...domain.variants])
const hasVisibleDefault = (lane: SourceFlowLane) => {
  const domain = lane.domains[0]
  return lane.domains.length === 1 && domain
    ? hasVisibleDomain(domain)
    : hasVisibleInputs([lane.primary])
}

const toggleExpanded = (laneId: string) => {
  expandedLaneIds = expandedLaneIds.includes(laneId)
    ? expandedLaneIds.filter(id => id !== laneId)
    : [...expandedLaneIds, laneId]
}

const toggleDomainExpanded = (domainId: string) => {
  expandedDomainIds = expandedDomainIds.includes(domainId)
    ? expandedDomainIds.filter(id => id !== domainId)
    : [...expandedDomainIds, domainId]
}

const toggleDefaultInputListExpanded = (laneId: string) => {
  expandedDefaultInputLaneIds = expandedDefaultInputLaneIds.includes(laneId)
    ? expandedDefaultInputLaneIds.filter(id => id !== laneId)
    : [...expandedDefaultInputLaneIds, laneId]
}

const registerLane = (node: HTMLElement, groupId: string) => {
  laneElements[groupId] = node

  return {
    destroy: () => {
      if (laneElements[groupId] === node) delete laneElements[groupId]
    },
  }
}

const measureConnectorGeometries = () => {
  const next: Record<
    string,
    {
      inputY: number[]
      outputY: number
      lineEnd: number
    }
  > = {}

  for (const [groupId, laneElement] of Object.entries(laneElements)) {
    const connectorElement = laneElement.querySelector<SVGElement>(
      '.source-flow-connectors',
    )
    const inputElements = Array.from(
      laneElement.querySelectorAll<HTMLElement>('.source-flow-input'),
    )

    if (!connectorElement || !inputElements.length) continue

    const connectorRect = connectorElement.getBoundingClientRect()
    if (!connectorRect.height) continue

    const inputRects = inputElements.map(input => input.getBoundingClientRect())
    const inputY = inputRects.map(
      input =>
        ((input.top + input.height / 2 - connectorRect.top) / connectorRect.height) *
        100,
    )
    next[groupId] = {
      inputY,
      outputY: inputY[0] ?? 0,
      lineEnd: 150 - (5 / connectorRect.width) * 150,
    }
  }

  connectorGeometries = next
}

$effect(() => {
  lanes.length
  showPlanned
  expandAll
  Object.keys(laneElements).length

  const frame = requestAnimationFrame(measureConnectorGeometries)
  const observer = new ResizeObserver(measureConnectorGeometries)

  for (const laneElement of Object.values(laneElements)) observer.observe(laneElement)

  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
  }
})

$effect(() => {
  if (expandAll) {
    expandedLaneIds = lanes.filter(lane => lane.domains.length > 1).map(lane => lane.id)
    expandedDomainIds = lanes.flatMap(lane => lane.domains.map(domain => domain.id))
    expandedDefaultInputLaneIds = lanes.map(lane => lane.id)
  } else {
    expandedLaneIds = []
    expandedDomainIds = []
    expandedDefaultInputLaneIds = []
  }
})

const defaultConnectorY = (inputCount: number, inputIndex: number) => {
  const cardHeight = 5.65
  const rowHeight = 6.4
  const flowHeight = Math.max(
    cardHeight,
    inputCount * rowHeight - (rowHeight - cardHeight),
  )
  const outputY = (cardHeight / 2 / flowHeight) * 100
  const inputY = ((cardHeight / 2 + inputIndex * rowHeight) / flowHeight) * 100

  return { inputY, outputY }
}

const connectorPath = (
  inputY: number,
  outputY: number,
  lineEnd: number,
  isPrimary: boolean,
) => {
  if (isPrimary) return `M 0 ${outputY} H ${lineEnd}`

  // Meet the primary (central) line 9% farther to the right so each curved
  // input has a clearer run before joining the shared flow.
  const joinX = 72 + 150 * 0.09
  return `M 0 ${inputY} C 34 ${inputY}, 42 ${outputY}, ${joinX} ${outputY}`
}

const getConnectorGeometry = (groupId: string, inputCount: number) => {
  const measured = connectorGeometries[groupId]
  if (measured) return measured

  return {
    inputY: Array.from(
      { length: inputCount },
      (_, inputIndex) => defaultConnectorY(inputCount, inputIndex).inputY,
    ),
    outputY: defaultConnectorY(inputCount, 0).outputY,
    lineEnd: 145,
  }
}

const stackedFlowPoints = (inputCount: number) => {
  const pointsByCount = {
    1: { inputY: [34], outputY: 76 },
    2: { inputY: [18, 56], outputY: 86 },
    3: { inputY: [13, 39, 65], outputY: 90 },
    4: { inputY: [10, 29, 48, 67], outputY: 92 },
  } as const

  return pointsByCount[Math.min(Math.max(inputCount, 1), 4) as 1 | 2 | 3 | 4]
}

const stackedInputPath = (inputCount: number, inputIndex: number) => {
  const { inputY } = stackedFlowPoints(inputCount)
  const sourceY = inputY[inputIndex] ?? inputY[0]

  return `M 36 ${sourceY} H 14`
}

const stackedTrunkPath = (inputCount: number) => {
  const { inputY, outputY } = stackedFlowPoints(inputCount)

  return `M 14 ${inputY[0]} V ${outputY} H 27.25`
}

const stackedArrowPath = (inputCount: number) => {
  const { outputY } = stackedFlowPoints(inputCount)

  return `M 27.25 ${outputY - 2.625} L 36 ${outputY} L 27.25 ${outputY + 2.625} Z`
}
</script>

{#snippet flowGroup(
  lane: SourceFlowLane,
  laneIndex: number,
  inputs: SourceFlowInput[],
  groupId: string,
  domain?: SourceFlowDomain,
)}
  {@const geometry = getConnectorGeometry(groupId, inputs.length)}
  <section
    class={`source-flow-lane source-flow-lane-${lane.id}`}
    use:registerLane={groupId}
    transition:slide={{ duration: 220, axis: 'y' }}
    style={`--flow-accent: ${lane.accent}; --flow-connector: ${lane.id === 'addresses' ? lane.secondary : lane.accent}; --flow-label: ${lane.id === 'addresses' || lane.id === 'stats' || lane.id === 'streets' ? lane.secondary : lane.accent}; --flow-ink: ${lane.ink}; --flow-index: ${laneIndex}; --visible-source-count: ${inputs.length};`}
    aria-labelledby={`source-flow-${groupId}`}
  >
    <div class="source-flow-inputs">
      {#each inputs as input (input.id)}
        <svelte:element
          this={input.href ? 'a' : 'div'}
          class="source-flow-input group"
          style={`--source-accent: ${input.accent};`}
          href={input.href}
          aria-label={input.href ? `${input.publisher}: ${input.source}` : undefined}
          transition:slide={{ duration: 180, axis: 'y' }}
        >
          <span
            class={`source-flow-icon ${
              input.iconTone ? `source-flow-icon-${input.iconTone}` : ''
            }`}
            aria-hidden="true"
          >
            {#if input.icon}
              <img src={input.icon} alt="">
            {:else}
              <span>{input.fallbackIcon ?? input.publisher.slice(0, 2)}</span>
            {/if}
          </span>
          <span class="min-w-0">
            <span class="source-flow-source">{input.source}</span>
            <span class="source-flow-publisher">{input.publisher}</span>
            {#if input.fields?.length}
              <span class="source-flow-fields">
                {#each input.fields as field}
                  <span class="source-flow-field">
                    <span class="source-flow-field-label">{field.label}</span>
                    <span class="source-flow-field-value">{field.value}</span>
                  </span>
                {/each}
              </span>
            {/if}
          </span>
          {#if input.planned || input.variant}
            <span class="source-flow-statuses">
              {#if input.planned}
                <span class="source-flow-status">PLANNED</span>
              {/if}
              {#if input.variant}
                <span class="source-flow-status source-flow-status-variant"
                  >{input.variant}</span
                >
              {/if}
            </span>
          {/if}
        </svelte:element>
      {/each}
      {#if domain?.variants.some(isVisible) &&
        !(lane.defaultGroupExpanded && domain.label === lane.primaryGroupLabel)}
        <button
          class="source-flow-more"
          type="button"
          aria-expanded={isDomainExpanded(lane, domain)}
          onclick={() => toggleDomainExpanded(domain.id)}
        >
          {#if isDomainExpanded(lane, domain)}
            {m.sources_flow_hide()}
          {:else}
            <span>{m.sources_flow_show()}</span>
            <strong>{visibleInputs(domain.variants).length}</strong>
            <span>{m.sources_flow_more()}</span>
          {/if}
        </button>
      {/if}
      {#if (!domain || (lane.defaultGroupExpanded && domain.label === lane.primaryGroupLabel)) && lane.defaultInputLimit &&
        (remainingDefaultInputCount(lane) || isDefaultInputListExpanded(lane))}
        <button
          class="source-flow-more"
          type="button"
          aria-expanded={isDefaultInputListExpanded(lane)}
          onclick={() => toggleDefaultInputListExpanded(lane.id)}
        >
          {#if isDefaultInputListExpanded(lane)}
            {m.sources_flow_hide()}
          {:else}
            <span>{m.sources_flow_show()}</span>
            <strong>{remainingDefaultInputCount(lane)}</strong>
            <span>{m.sources_flow_more()}</span>
          {/if}
        </button>
      {/if}
      {#if !lane.defaultAllGroupsExpanded &&
        (!domain || lane.defaultGroupExpanded) && lane.domains.length > 1}
        <button
          class="source-flow-more"
          type="button"
          aria-expanded={isExpanded(lane)}
          onclick={() => toggleExpanded(lane.id)}
        >
          {#if isExpanded(lane)}
            {m.sources_flow_hide()} {groupLabels(lane)}
          {:else}
            <span>{m.sources_flow_show()}</span>
            <strong>{remainingGroupCount(lane)}</strong>
            <span>{groupLabels(lane)}</span>
          {/if}
        </button>
      {/if}
    </div>

    <dl class="source-flow-gutter">
      <dt>{groupLabel(lane)}</dt>
      <dd>{domain?.label ?? lane.primaryGroupLabel}</dd>
    </dl>

    <svg
      class="source-flow-connectors"
      viewBox="0 0 150 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {#each inputs as input, inputIndex (input.id)}
        <path
          class="source-flow-path"
          d={connectorPath(
            geometry.inputY[inputIndex] ?? geometry.outputY,
            geometry.outputY,
            geometry.lineEnd,
            inputIndex === 0,
          )}
        ></path>
      {/each}
    </svg>

    <svg
      class="source-flow-stacked-connectors"
      viewBox="0 0 36 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {#each inputs as input, inputIndex (input.id)}
        <path
          class="source-flow-stacked-input"
          d={stackedInputPath(inputs.length, inputIndex)}
        ></path>
      {/each}
      <path
        class="source-flow-stacked-trunk"
        d={stackedTrunkPath(inputs.length)}
      ></path>
      <path
        class="source-flow-stacked-arrow"
        d={stackedArrowPath(inputs.length)}
      ></path>
    </svg>

    <span class="source-flow-arrow-head" aria-hidden="true"></span>

    <a class="source-flow-output group" href={lane.href} id={`source-flow-${groupId}`}>
      <span class="source-flow-output-image" aria-hidden="true">
        <img src={lane.image} alt="">
      </span>
      <span class="source-flow-output-label">
        <span class="font-display text-2xl font-bold leading-none">{lane.label}</span>
        <span class="source-flow-output-subtitle">{m.sources_flow_api_family()}</span>
      </span>
    </a>
  </section>
{/snippet}

<div class="source-flow-map grid gap-4">
  {#each lanes as lane, laneIndex (lane.id)}
    {#if !isExpanded(lane)}
      {#if hasVisibleDefault(lane)}
        {@render flowGroup(
          lane,
          laneIndex,
          visibleDefaultInputs(lane),
          lane.id,
          lane.domains.length === 1 ? lane.domains[0] : undefined,
        )}
      {/if}
    {:else}
      {#each lane.domains as domain (domain.id)}
        {#if hasVisibleDomain(domain)}
          {@render flowGroup(
            lane,
            laneIndex,
            visibleDomainInputs(lane, domain),
            domain.id,
            domain,
          )}
        {/if}
      {/each}
    {/if}
  {/each}
</div>

<style>
.source-flow-map {
  isolation: isolate;
}

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
  margin-top: 9px;
  margin-left: -12px;
  align-self: start;
  display: grid;
  gap: 0.18rem;
  min-height: 5.65rem;
  align-content: center;
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

.source-flow-input,
.source-flow-output {
  border: 1px solid color-mix(in srgb, var(--outline-variant) 78%, transparent);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--surface-container-low) 88%, transparent);
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.source-flow-input {
  position: relative;
  display: grid;
  min-height: 5.65rem;
  grid-template-columns: 4rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  overflow: hidden;
  padding: 0.9rem 1rem;
  background: var(--surface-container-low);
  color: var(--primary);
}

.source-flow-input::before {
  position: absolute;
  inset: 0;
  content: "";
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--source-accent) 72%, var(--surface-container-low)) 0%,
    color-mix(in srgb, var(--source-accent) 42%, var(--surface-container-low)) 36%,
    color-mix(in srgb, var(--source-accent) 18%, var(--surface-container-low)) 72%,
    color-mix(in srgb, var(--source-accent) 6%, var(--surface-container-low)) 100%
  );
  opacity: 0.44;
}

.source-flow-input::after {
  position: absolute;
  inset: 0;
  content: "";
  opacity: 0.14;
  background-image:
    linear-gradient(var(--source-accent) 1px, transparent 1px),
    linear-gradient(90deg, var(--source-accent) 1px, transparent 1px);
  background-size: 1rem 1rem;
  mask-image: linear-gradient(
    90deg,
    rgb(0 0 0 / 0.88) 0 6.25rem,
    rgb(0 0 0 / 0.32) 18rem,
    transparent 78%
  );
}

.source-flow-input:hover,
.source-flow-input:focus-visible {
  border-color: color-mix(in srgb, var(--source-accent) 72%, var(--outline-variant));
  outline: none;
}

.source-flow-output:hover,
.source-flow-output:focus-visible {
  border-color: color-mix(in srgb, var(--flow-accent) 72%, var(--outline-variant));
  outline: none;
}

.source-flow-icon {
  position: relative;
  z-index: 1;
  display: inline-flex;
  width: 4rem;
  height: 4rem;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 0.35rem;
  border: 1px solid color-mix(in srgb, var(--source-accent) 42%, transparent);
  background: color-mix(in srgb, var(--surface-container-high) 82%, #000 18%);
  color: var(--source-accent);
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 800;
}

.source-flow-icon-light {
  background: color-mix(in srgb, #fff 78%, var(--source-accent) 22%);
}

.source-flow-icon-hkgov {
  background: #fff7f4;
}

.source-flow-icon-diana {
  background: #dff0d6;
}

.source-flow-icon img {
  width: 2.75rem;
  height: 2.75rem;
  object-fit: contain;
}

.source-flow-publisher,
.source-flow-source,
.source-flow-field-value {
  position: relative;
  z-index: 1;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-flow-publisher {
  margin-top: 0.18rem;
  font-family: var(--font-body);
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--foreground-alt);
}

.source-flow-source {
  font-family: var(--font-display);
  font-size: 1.08rem;
  font-weight: 800;
  color: var(--primary);
}

.source-flow-fields {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.65rem;
  margin-top: 0.58rem;
}

.source-flow-field {
  display: inline-flex;
  align-items: baseline;
  gap: 0.22rem;
  min-width: 0;
  font-family: var(--font-body);
  font-size: 0.68rem;
  color: var(--foreground-alt);
}

.source-flow-field-label {
  font-weight: 760;
  color: color-mix(in srgb, var(--foreground-alt) 72%, transparent);
  text-transform: lowercase;
}

.source-flow-field-value {
  max-width: 12.5rem;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.72rem;
  font-weight: 750;
  color: var(--primary);
  text-transform: uppercase;
}

.source-flow-status {
  position: relative;
  z-index: 1;
  border: 1px solid color-mix(in srgb, var(--source-accent) 42%, transparent);
  border-radius: 0.25rem;
  background: color-mix(in srgb, var(--source-accent) 12%, transparent);
  padding: 0.22rem 0.42rem;
  font-family: var(--font-body);
  font-size: 0.68rem;
  font-weight: 800;
  color: var(--source-accent);
  text-transform: uppercase;
}

.source-flow-statuses {
  position: absolute;
  inset: 0.72rem;
  z-index: 1;
  pointer-events: none;
}

.source-flow-status-variant {
  border-color: color-mix(in srgb, #fff 65%, transparent);
  background: rgb(255 255 255 / 0.08);
  color: #fff;
}

.source-flow-statuses .source-flow-status {
  position: absolute;
  right: 0;
  bottom: 0;
}

.source-flow-statuses .source-flow-status-variant {
  top: 0;
  bottom: auto;
}

.source-flow-connectors {
  grid-column: 2;
  grid-row: 1;
  z-index: 0;
  align-self: start;
  width: calc(100% + 1.25rem);
  margin-left: -1.25rem;
  height: max(5.65rem, calc(var(--visible-source-count) * 6.4rem - 0.75rem));
  overflow: visible;
}

.source-flow-stacked-connectors {
  display: none;
}

.source-flow-arrow-head {
  grid-column: 3;
  grid-row: 1;
  z-index: 2;
  align-self: start;
  justify-self: start;
  width: 0;
  height: 0;
  margin-left: calc(-0.5rem - 16px);
  border-top: 0.4rem solid transparent;
  border-bottom: 0.4rem solid transparent;
  border-left: 0.5rem solid var(--flow-connector);
  transform: translateY(2.95rem);
  pointer-events: none;
  filter: drop-shadow(
    0 0 0.2rem color-mix(in srgb, var(--flow-connector) 32%, transparent)
  );
}

.source-flow-path,
.source-flow-stacked-input,
.source-flow-stacked-trunk {
  fill: none;
  stroke: var(--flow-connector);
  stroke-width: 1.55;
  stroke-linecap: round;
  stroke-dasharray: 6 8;
  opacity: 0.78;
  animation: source-flow-dash 3.8s linear infinite;
  animation-delay: calc(var(--flow-index) * -360ms);
  filter: drop-shadow(
    0 0 0.35rem color-mix(in srgb, var(--flow-connector) 22%, transparent)
  );
}

.source-flow-path {
  vector-effect: non-scaling-stroke;
}

.source-flow-stacked-input,
.source-flow-stacked-trunk,
.source-flow-stacked-arrow {
  display: none;
}

.source-flow-stacked-input,
.source-flow-stacked-trunk {
  stroke: var(--flow-connector);
  vector-effect: non-scaling-stroke;
  filter: drop-shadow(
    0 0 0.35rem color-mix(in srgb, var(--flow-connector) 22%, transparent)
  );
}

.source-flow-stacked-arrow {
  fill: var(--flow-connector);
  filter: drop-shadow(
    0 0 0.2rem color-mix(in srgb, var(--flow-connector) 32%, transparent)
  );
}

.source-flow-output {
  grid-column: 3;
  grid-row: 1;
  align-self: start;
  position: relative;
  display: flex;
  min-height: 5.65rem;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
  padding: 1.25rem 1.3rem;
  color: var(--flow-ink);
  transform: translateY(0.5rem);
}

.source-flow-output::before {
  position: absolute;
  inset: 0;
  content: "";
  background: color-mix(in srgb, var(--flow-accent) 82%, #000 18%);
  opacity: 1;
}

.source-flow-output::after {
  position: absolute;
  inset: 0;
  content: "";
  opacity: 0.18;
  background-image:
    linear-gradient(var(--flow-accent) 1px, transparent 1px),
    linear-gradient(90deg, var(--flow-accent) 1px, transparent 1px);
  background-size: 1.15rem 1.15rem;
  mask-image: linear-gradient(
    90deg,
    rgb(0 0 0 / 0.9),
    rgb(0 0 0 / 0.14) 62%,
    transparent
  );
}

.source-flow-output-image {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
}

.source-flow-output-image::before {
  position: absolute;
  inset: 0;
  z-index: 1;
  content: "";
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--flow-accent) 82%, #000 18%) 0%,
    color-mix(in srgb, var(--flow-accent) 58%, transparent) 35%,
    transparent 74%
  );
}

.source-flow-output-image img {
  position: absolute;
  top: 50%;
  right: -15%;
  width: 78%;
  height: 135%;
  object-fit: cover;
  opacity: 0.72;
  transform: translateY(-50%) scale(1.02);
  mask-image: linear-gradient(
    90deg,
    transparent 0%,
    rgb(0 0 0 / 0.08) 18%,
    rgb(0 0 0 / 0.96) 68%
  );
  transition:
    opacity 180ms ease,
    transform 220ms ease;
}

.source-flow-output-label {
  position: relative;
  z-index: 2;
}

.source-flow-output-label {
  display: grid;
  gap: 0.34rem;
}

.source-flow-output-subtitle {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.72rem;
  font-weight: 780;
  color: color-mix(in srgb, var(--flow-ink) 74%, transparent);
  text-transform: uppercase;
}

.source-flow-output:hover .source-flow-output-image img,
.source-flow-output:focus-visible .source-flow-output-image img {
  opacity: 0.86;
  transform: translateY(-50%) scale(1.07);
}

@keyframes source-flow-dash {
  to {
    stroke-dashoffset: -28;
  }
}

@keyframes source-flow-arrow-bob {
  to {
    transform: translateX(2px);
  }
}

@media (max-width: 900px) {
  .source-flow-lane {
    --stacked-flow-gutter: 1rem;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    padding: 1rem 0 1.25rem;
  }

  .source-flow-inputs,
  .source-flow-output,
  .source-flow-gutter {
    position: relative;
    z-index: 1;
    margin-left: var(--stacked-flow-gutter);
  }

  .source-flow-gutter {
    grid-column: 1;
    grid-row: auto;
    padding-top: 0.5;
  }

  .source-flow-connectors {
    display: none;
  }

  .source-flow-arrow-head {
    display: none;
  }

  .source-flow-stacked-connectors {
    position: absolute;
    top: 0;
    bottom: 0;
    left: -1.25rem;
    z-index: 0;
    display: block;
    width: 2.25rem;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .source-flow-path {
    display: none;
  }

  .source-flow-stacked-input,
  .source-flow-stacked-trunk {
    display: block;
    stroke-width: 3;
  }

  .source-flow-stacked-arrow {
    display: block;
    animation: source-flow-arrow-bob 1.2s ease-in-out infinite alternate;
    transform-box: fill-box;
    transform-origin: center;
  }
}

@media (max-width: 640px) {
  .source-flow-input {
    grid-template-columns: 3.4rem minmax(0, 1fr);
  }

  .source-flow-icon {
    width: 3.4rem;
    height: 3.4rem;
  }

  .source-flow-icon img {
    width: 2.35rem;
    height: 2.35rem;
  }
}
</style>
