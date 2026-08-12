<script lang="ts">
import SourceFlowMapGroup from './sourceFlowMapGroup.svelte'
import type {
  SourceFlowDomain,
  SourceFlowInput,
  SourceFlowLane,
} from './sourceFlowMapTypes'

type Props = {
  lane: SourceFlowLane
  laneIndex: number
  showPlanned: boolean
  expandAll: boolean
}

let { lane, laneIndex, showPlanned, expandAll }: Props = $props()
let expanded = $state(false)
let expandedDomainIds = $state<string[]>([])
let defaultInputListExpanded = $state(false)

const isPlanned = (input: SourceFlowInput) => input.planned === true
const visibleInputs = (inputs: SourceFlowInput[]) =>
  inputs.filter(input => showPlanned || !isPlanned(input))
const isDomainExpanded = (domain: SourceFlowDomain) =>
  (lane.defaultGroupExpanded === true && domain.label === lane.primaryGroupLabel) ||
  expandedDomainIds.includes(domain.id)
const fullDomainInputs = (domain: SourceFlowDomain) =>
  visibleInputs([domain.primary, ...(isDomainExpanded(domain) ? domain.variants : [])])
const visibleDomainInputs = (domain: SourceFlowDomain) => {
  const inputs = fullDomainInputs(domain)
  return lane.defaultInputLimit &&
    domain.label === lane.primaryGroupLabel &&
    !defaultInputListExpanded
    ? inputs.slice(0, lane.defaultInputLimit)
    : inputs
}
const visibleDefaultInputs = () => {
  const domain = lane.domains[0]
  if ((lane.defaultGroupExpanded || lane.domains.length === 1) && domain) {
    return visibleDomainInputs(domain)
  }
  return visibleInputs([lane.primary])
}
const hasVisibleDomain = (domain: SourceFlowDomain) =>
  visibleInputs([domain.primary, ...domain.variants]).length > 0
const hasVisibleDefault = () => {
  const domain = lane.domains[0]
  return lane.domains.length === 1 && domain
    ? hasVisibleDomain(domain)
    : visibleInputs([lane.primary]).length > 0
}
const remainingDefaultInputCount = () => {
  const domain = lane.domains[0]
  if (!domain || !lane.defaultInputLimit || defaultInputListExpanded) return 0
  return Math.max(fullDomainInputs(domain).length - lane.defaultInputLimit, 0)
}
const remainingGroupCount = () =>
  lane.defaultGroupExpanded ? lane.domains.length - 1 : lane.domains.length
const visibleVariantCount = (domain: SourceFlowDomain) =>
  visibleInputs(domain.variants).length

const toggleLane = () => {
  expanded = !expanded
}
const toggleDomain = (domainId: string) => {
  expandedDomainIds = expandedDomainIds.includes(domainId)
    ? expandedDomainIds.filter(id => id !== domainId)
    : [...expandedDomainIds, domainId]
}
const toggleDefaultInputList = () => {
  defaultInputListExpanded = !defaultInputListExpanded
}

$effect(() => {
  if (expandAll) {
    expanded = lane.domains.length > 1
    expandedDomainIds = lane.domains.map(domain => domain.id)
    defaultInputListExpanded = true
  } else {
    expanded = false
    expandedDomainIds = []
    defaultInputListExpanded = false
  }
})

let isExpanded = $derived(lane.defaultAllGroupsExpanded === true || expanded)
let primaryDomain = $derived(lane.domains[0])
let primaryGroupDomain = $derived(
  isExpanded ? primaryDomain : lane.domains.length === 1 ? primaryDomain : undefined,
)
let primaryGroupInputs = $derived(
  isExpanded && primaryDomain
    ? visibleDomainInputs(primaryDomain)
    : visibleDefaultInputs(),
)
let isPrimaryGroupVisible = $derived(
  isExpanded && primaryDomain ? hasVisibleDomain(primaryDomain) : hasVisibleDefault(),
)
</script>

<SourceFlowMapGroup
  {lane}
  {laneIndex}
  inputs={primaryGroupInputs}
  groupId={isExpanded && primaryDomain ? primaryDomain.id : lane.id}
  domain={primaryGroupDomain}
  visible={isPrimaryGroupVisible}
  isLaneExpanded={isExpanded}
  isDomainExpanded={lane.domains[0] ? isDomainExpanded(lane.domains[0]) : false}
  isDefaultInputListExpanded={defaultInputListExpanded}
  visibleVariantCount={lane.domains[0] ? visibleVariantCount(lane.domains[0]) : 0}
  remainingDefaultInputCount={remainingDefaultInputCount()}
  remainingGroupCount={remainingGroupCount()}
  onToggleLane={toggleLane}
  onToggleDomain={toggleDomain}
  onToggleDefaultInputList={toggleDefaultInputList}
/>

{#each lane.domains as domain (domain.id)}
  {#if domain !== primaryDomain}
    <SourceFlowMapGroup
      {lane}
      {laneIndex}
      inputs={visibleDomainInputs(domain)}
      groupId={domain.id}
      {domain}
      visible={isExpanded && hasVisibleDomain(domain)}
      isLaneExpanded={isExpanded}
      isDomainExpanded={isDomainExpanded(domain)}
      isDefaultInputListExpanded={defaultInputListExpanded}
      visibleVariantCount={visibleVariantCount(domain)}
      remainingDefaultInputCount={remainingDefaultInputCount()}
      remainingGroupCount={remainingGroupCount()}
      onToggleLane={toggleLane}
      onToggleDomain={toggleDomain}
      onToggleDefaultInputList={toggleDefaultInputList}
    />
  {/if}
{/each}
