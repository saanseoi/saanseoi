<script lang="ts">
import { Tooltip } from 'bits-ui'
import { tick } from 'svelte'

import { m } from '#lib/bits/internal/i18n.js'
import type { MarkdownHeading } from '#lib/registry/markdown.js'

import ReleaseAuditControls from './releaseAuditControls.svelte'
import ReleaseAuditEvidenceDialog from './releaseAuditEvidenceDialog.svelte'
import ReleaseAuditPanel from './releaseAuditPanel.svelte'
import ReleaseAuditResults from './releaseAuditResults.svelte'
import {
  bulkSectionHeadingId,
  filterBulkProcessingSections,
  type AuditBulkRule,
} from './releaseAuditBulkSections'
import type { AuditAction } from './releaseAudit.types'
import { matchesFuzzyQuery } from './releaseAuditSearch'
import { auditHeadingId } from './releaseAuditUtils'

type Props = {
  actions?: AuditAction[]
  bulkActions?: AuditBulkRule[]
  locale: string
  showBulkActions?: boolean
  headings?: MarkdownHeading[]
  activeHeadingId?: string | null
}

let {
  actions = [],
  bulkActions = [],
  locale,
  showBulkActions = false,
  headings = $bindable<MarkdownHeading[]>([]),
  activeHeadingId = $bindable<string | null>(null),
}: Props = $props()
let query = $state('')
let auditPanel = $state<HTMLElement>()
let expandedEvidenceId = $state<string | null>(null)
let evidenceDialogOpen = $state(false)
let selectedEvidence = $state<unknown>()
let selectedEvidenceId = $state<string | null>(null)
let copiedEvidenceId = $state<string | null>(null)
let copiedEvidenceTimeout: ReturnType<typeof setTimeout> | undefined

const formatNumber = (value: number) => new Intl.NumberFormat().format(value)

const formatLabel = (value: string) =>
  value
    .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll(/[_-]/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())

const normaliseActionName = (action: string) =>
  action.replace(/normalized$/, 'normalised')

const formatProcessingAction = (action: string) =>
  ({
    als_equivalent_premise_variant_consolidated: {
      issue: m.source_audit_issue_equivalent_premise(),
      outcome: m.source_audit_outcome_consolidated(),
    },
    als_exact_source_duplicate_removed: {
      issue: m.source_audit_issue_equivalent_source(),
      outcome: m.source_audit_outcome_dropped_duplicates(),
    },
    als_identity_drift_decision: {
      issue: m.source_audit_issue_identity_drift(),
      outcome: m.source_audit_outcome_reviewed(),
    },
    als_building_name_withdrawal_matched: {
      issue: m.source_audit_issue_dropped_address_component(),
      outcome: m.source_audit_outcome_retained(),
    },
    als_address_component_withdrawal_matched: {
      issue: m.source_audit_issue_dropped_address_component(),
      outcome: m.source_audit_outcome_retained(),
    },
    als_building_name_roman_numeral_normalised: {
      issue: m.source_audit_issue_mixed_numeral_usage(),
      outcome: m.source_audit_outcome_normalised(),
    },
    als_premise_number_roman_numeral_normalised: {
      issue: m.source_audit_issue_mixed_numeral_usage(),
      outcome: m.source_audit_outcome_normalised(),
    },
    als_building_estate_reassignment_matched: {
      issue: m.source_audit_issue_building_estate_reassignment(),
      outcome: m.source_audit_outcome_matched(),
    },
    planning_geometry_self_intersection_repaired: {
      issue: m.source_audit_issue_geometry_self_intersection(),
      outcome: m.source_audit_outcome_repaired(),
    },
    overture_division_locale_inferred: {
      issue: m.source_audit_issue_division_name_without_locale(),
      outcome: m.source_audit_outcome_inferred(),
      tocTitle: m.source_audit_toc_name_missing_locale(),
    },
    overture_division_api_locale_fallback_added: {
      issue: m.source_audit_issue_division_api_locale(),
      outcome: m.source_audit_outcome_fallback_added(),
    },
    overture_division_geometry_cn_gd_excluded: {
      issue: m.source_audit_issue_guangdong_spillover_geometry(),
      outcome: m.source_audit_outcome_excluded(),
    },
  })[normaliseActionName(action)] ?? {
    issue: formatLabel(action),
    outcome: m.source_audit_outcome_processed(),
  }

const searchableText = (action: AuditAction) =>
  `${action.action} ${action.mode} ${action.summary} ${JSON.stringify(action.evidence)}`
    .normalize('NFKD')
    .toLocaleLowerCase()

let visibleActions = $derived(
  actions.filter(
    action => action.action !== 'als_number_range_singleton_variant_consolidated',
  ),
)
let filteredActions = $derived(
  visibleActions.filter(action => matchesFuzzyQuery(searchableText(action), query)),
)
let visibleBulkSections = $derived(
  showBulkActions ? filterBulkProcessingSections(bulkActions, query) : [],
)
let sections = $derived.by(() => {
  const groups = new Map<string, AuditAction[]>()
  for (const action of filteredActions) {
    groups.set(action.action, [...(groups.get(action.action) ?? []), action])
  }

  return [...groups.entries()]
    .map(([action, rows]) => ({
      action,
      id: auditHeadingId('record', action),
      affectedRecordCount: rows.reduce(
        (total, row) => total + row.affectedRecordCount,
        0,
      ),
      totalCount: visibleActions.filter(item => item.action === action).length,
      mode: rows.every(row => row.mode === 'automatic') ? 'automatic' : 'manual',
      rows,
    }))
    .sort((left, right) => left.action.localeCompare(right.action))
})
let sectionHeadings = $derived([
  ...visibleBulkSections.map(rule => ({
    id: bulkSectionHeadingId(rule),
    level: 2,
    text: formatLabel(rule.operationCode),
  })),
  ...sections.map(section => {
    const action = formatProcessingAction(section.action)
    return {
      id: section.id,
      level: 2,
      text:
        'tocTitle' in action && typeof action.tocTitle === 'string'
          ? action.tocTitle
          : action.issue,
    }
  }),
])

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const evidencePreview = (evidence: unknown) => {
  const record = asRecord(evidence)
  if (!record) return null

  const sourceNames = asRecord(record.sourceNames)
  const primary = typeof sourceNames?.primary === 'string' ? sourceNames.primary : null
  const i18n = [
    ...(Array.isArray(record.inferredI18n) ? record.inferredI18n : []),
    ...(Array.isArray(record.fallbackI18n) ? record.fallbackI18n : []),
  ]
  const decisions = i18n.flatMap(item => {
    const localised = asRecord(item)
    const locale = typeof localised?.locale === 'string' ? localised.locale : null
    const name = typeof localised?.name === 'string' ? localised.name : null
    const rules = Array.isArray(localised?.nameRules) ? localised.nameRules : []
    const rule = rules
      .map(asRecord)
      .find(candidate => typeof candidate?.value === 'string')
    const ruleValue = typeof rule?.value === 'string' ? rule.value : null
    const ruleVariant = typeof rule?.variant === 'string' ? rule.variant : null

    return locale && name
      ? [
          {
            locale,
            name,
            sourcePath: ruleValue
              ? `sourceNames.rules[variant=${ruleVariant ?? 'unclassified'}]`
              : 'sourceNames.primary',
            sourceValue: ruleValue ?? primary,
          },
        ]
      : []
  })
  if (primary && decisions.length) {
    const source = decisions.find(decision => decision.sourceValue) ?? {
      sourcePath: 'sourceNames.primary',
      sourceValue: primary,
    }
    return {
      kind: 'division-locale' as const,
      sourcePath: source.sourcePath,
      sourceValue: source.sourceValue,
      decisions,
    }
  }

  const address = typeof record.address === 'string' ? record.address : null
  const canonical = asRecord(record.canonicalRecord)
  const formatted = asRecord(canonical?.formattedAddress)
  const canonicalAddress =
    typeof formatted?.en === 'string'
      ? formatted.en
      : typeof formatted?.zhHant === 'string'
        ? formatted.zhHant
        : null
  if (address) {
    return {
      kind: 'record' as const,
      source: `${m.source_audit_address()}: ${address}`,
      result: canonicalAddress
        ? `${m.source_audit_record()}: ${canonicalAddress}`
        : undefined,
    }
  }

  return canonicalAddress
    ? {
        kind: 'record' as const,
        source: `${m.source_audit_record()}: ${canonicalAddress}`,
      }
    : null
}

const asText = (value: unknown) => (typeof value === 'string' ? value : null)

const canonicalRecord = (evidence: unknown) => {
  const record = asRecord(evidence)
  return asRecord(record?.canonicalRecord) ?? record
}

const canonicalAddress = (evidence: unknown) => {
  const formatted = asRecord(canonicalRecord(evidence)?.formattedAddress)
  return (
    asText(formatted?.en) ??
    asText(formatted?.zhHant) ??
    m.source_audit_unformatted_address()
  )
}

const sourceFieldLabel = (field: string) => {
  const label = field.split('.').at(-1) ?? field

  switch (label) {
    case 'address':
      return m.source_audit_address()
    case 'buildingName':
      return m.source_audit_building_name()
    case 'identity':
      return m.source_audit_identity()
    case 'premiseNumber':
      return m.source_audit_premise_number()
    default:
      return label
  }
}

const truncate = (value: string, maximum = 24) =>
  value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value

const recordFieldDifferences = (
  left: unknown,
  right: unknown,
  path = '',
): Array<{
  field: string
  left: string
  right: string
}> => {
  const leftRecord = asRecord(left)
  const rightRecord = asRecord(right)
  if (leftRecord || rightRecord) {
    return [
      ...new Set([...Object.keys(leftRecord ?? {}), ...Object.keys(rightRecord ?? {})]),
    ].flatMap(key =>
      recordFieldDifferences(
        leftRecord?.[key],
        rightRecord?.[key],
        path ? `${path}.${key}` : key,
      ),
    )
  }

  const leftValue = asText(left)
  const rightValue = asText(right)
  return leftValue !== rightValue && (leftValue != null || rightValue != null)
    ? [{ field: path, left: leftValue ?? '—', right: rightValue ?? '—' }]
    : []
}

const rowPresentation = (action: string, evidence: unknown, summary: string) => {
  const record = asRecord(evidence)
  const canonical = canonicalRecord(evidence)
  const identity = asRecord(canonical?.identity)
  const normalisedAction = normaliseActionName(action)

  if (
    normalisedAction === 'als_building_name_roman_numeral_normalised' ||
    normalisedAction === 'als_premise_number_roman_numeral_normalised'
  ) {
    const field =
      normalisedAction === 'als_building_name_roman_numeral_normalised'
        ? 'buildingName'
        : 'premiseNumber'
    const normalised = asRecord(record?.[field])
    const from = asText(normalised?.from) ?? '—'
    const to = asText(normalised?.to) ?? '—'
    const reference = asText(normalised?.reference) ?? to.split(/\s+/).at(-1) ?? to
    return {
      leftLabel: sourceFieldLabel(field),
      leftValue: from,
      rightLabel: reference,
      rightValue: to,
    }
  }

  if (
    action === 'als_building_name_withdrawal_matched' ||
    action === 'als_address_component_withdrawal_matched'
  ) {
    const dropped = asRecord(record?.droppedComponent)
    const field = asText(dropped?.field) ?? 'buildingName'
    return {
      leftLabel: sourceFieldLabel(field),
      leftValue: asText(dropped?.value) ?? m.source_audit_not_recorded_in_release(),
    }
  }

  if (action === 'als_equivalent_premise_variant_consolidated') {
    const ignoredRecords = Array.isArray(record?.ignoredRecords)
      ? record.ignoredRecords
      : []
    const ignored = ignoredRecords[0]
    const reportedDifference = Array.isArray(record?.differences)
      ? record.differences
          .map(asRecord)
          .find(
            difference =>
              asText(difference?.field) != null &&
              asText(difference?.oldValue) != null &&
              asText(difference?.newValue) != null,
          )
      : null
    const differences = recordFieldDifferences(
      asRecord(ignored)?.sourceRepresentation ?? asRecord(ignored)?.sourcePremises,
      canonical?.sourceRepresentation ?? canonical?.sourcePremises,
    )
    const difference = reportedDifference
      ? {
          field: asText(reportedDifference.field) ?? '',
          left: asText(reportedDifference.oldValue) ?? '—',
          right: asText(reportedDifference.newValue) ?? '—',
        }
      : differences[0]
    const value = difference
      ? `${difference.left} → ${difference.right}`
      : m.source_audit_variant_retained()
    return {
      leftLabel: m.source_audit_address(),
      leftValue: canonicalAddress(evidence),
      rightLabel: difference ? sourceFieldLabel(difference.field) : undefined,
      rightValue: difference ? truncate(value) : undefined,
      rightTitle: difference ? value : undefined,
    }
  }

  if (action === 'als_exact_source_duplicate_removed') {
    return {
      leftLabel: m.source_audit_address(),
      leftValue: canonicalAddress(evidence),
    }
  }

  if (action === 'als_identity_drift_decision') {
    const previous = asRecord(record?.previousIdentity)
    const differences = recordFieldDifferences(previous, identity)
    const changedFields = differences.map(difference =>
      sourceFieldLabel(difference.field),
    )
    const oldValue = differences.map(difference => difference.left).join(', ')
    const newValue = differences.map(difference => difference.right).join(', ')
    const decision = asRecord(record?.decision)
    const resolution = asText(decision?.resolution)
    return {
      leftLabel: changedFields.join(', ') || m.source_audit_identity(),
      leftValue: oldValue || m.source_audit_not_recorded_in_release(),
      rightLabel:
        resolution === 'keep-existing-id'
          ? m.source_audit_keep_id()
          : m.source_audit_new_id(),
      rightValue: newValue || m.source_audit_not_recorded_in_release(),
    }
  }

  const preview = evidencePreview(evidence)
  if (preview?.kind === 'division-locale') {
    return {
      leftLabel: preview.sourcePath,
      leftValue: preview.sourceValue,
      rightItems: preview.decisions.map(decision => ({
        label: decision.locale,
        value: decision.name,
      })),
    }
  }

  return {
    leftLabel: undefined,
    leftValue:
      preview?.kind === 'record'
        ? preview.result
          ? `${preview.source} → ${preview.result}`
          : preview.source
        : summary,
  }
}

function toggleEvidence(id: string) {
  expandedEvidenceId = expandedEvidenceId === id ? null : id
}

const evidenceTransitionName = (id: string) =>
  `audit-evidence-${id.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}`

function openEvidenceFullscreen(id: string, evidence: unknown) {
  const showDialog = async () => {
    selectedEvidence = evidence
    selectedEvidenceId = id
    expandedEvidenceId = null
    evidenceDialogOpen = true
    await tick()
  }

  if (!document.startViewTransition) {
    showDialog()
    return
  }

  void document.startViewTransition(showDialog).finished.catch(() => {})
}

function closeEvidenceFullscreen() {
  const restoreEmbeddedEvidence = async () => {
    if (selectedEvidenceId) expandedEvidenceId = selectedEvidenceId
    evidenceDialogOpen = false
    await tick()
  }

  if (!document.startViewTransition) {
    void restoreEmbeddedEvidence()
    return
  }

  void document.startViewTransition(restoreEmbeddedEvidence).finished.catch(() => {})
}

async function copyEvidence(id: string, evidence: unknown) {
  if (!navigator.clipboard) return

  try {
    await navigator.clipboard.writeText(JSON.stringify(evidence, null, 2))
    copiedEvidenceId = id
    if (copiedEvidenceTimeout) clearTimeout(copiedEvidenceTimeout)
    copiedEvidenceTimeout = setTimeout(() => {
      copiedEvidenceId = null
    }, 2_000)
  } catch {
    copiedEvidenceId = null
  }
}

$effect(() => {
  headings = sectionHeadings
})

$effect(() => {
  const panel = auditPanel
  const headingIds = sectionHeadings.map(heading => heading.id)
  activeHeadingId = null

  if (!panel || headingIds.length === 0) return

  let disposed = false
  let cleanup = () => {}

  void tick().then(() => {
    if (disposed) return

    const elements = headingIds
      .map(id => panel.querySelector<HTMLElement>(`#${id}`))
      .filter((heading): heading is HTMLElement => heading !== null)
    if (!elements.length) return

    const activationOffset = Math.min(160, window.innerHeight * 0.25)
    const updateActiveHeading = () => {
      const current =
        [...elements]
          .reverse()
          .find(heading => heading.getBoundingClientRect().top <= activationOffset) ??
        elements[0]
      if (current) activeHeadingId = current.id
    }

    const observer = new IntersectionObserver(updateActiveHeading, {
      rootMargin: `-${activationOffset}px 0px -65% 0px`,
    })
    elements.forEach(heading => {
      observer.observe(heading)
    })
    window.addEventListener('scroll', updateActiveHeading, { passive: true })
    updateActiveHeading()

    cleanup = () => {
      observer.disconnect()
      window.removeEventListener('scroll', updateActiveHeading)
    }
  })

  return () => {
    disposed = true
    cleanup()
  }
})
</script>

<Tooltip.Provider delayDuration={200}>
  <ReleaseAuditPanel bind:element={auditPanel}>
    <ReleaseAuditControls
      filteredCount={formatNumber(filteredActions.length)}
      infoDescription={m.source_audit_info_description()}
      infoLabel={m.source_audit_info()}
      totalCount={formatNumber(visibleActions.length)}
      bind:query
    />
    <ReleaseAuditResults
      {bulkActions}
      {copiedEvidenceId}
      {evidenceTransitionName}
      {expandedEvidenceId}
      formatAction={formatProcessingAction}
      {formatNumber}
      {locale}
      onCopy={copyEvidence}
      onFullscreen={openEvidenceFullscreen}
      onToggle={toggleEvidence}
      presentRow={rowPresentation}
      {sections}
      {showBulkActions}
      visibleActionCount={visibleActions.length}
      {visibleBulkSections}
    />
  </ReleaseAuditPanel>

  <ReleaseAuditEvidenceDialog
    bind:open={evidenceDialogOpen}
    {copiedEvidenceId}
    evidence={selectedEvidence}
    evidenceId={selectedEvidenceId}
    onClose={closeEvidenceFullscreen}
    onCopy={copyEvidence}
    transitionName={selectedEvidenceId
      ? evidenceTransitionName(selectedEvidenceId)
      : undefined}
  />
</Tooltip.Provider>
