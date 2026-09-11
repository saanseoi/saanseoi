import { readFile } from 'node:fs/promises'
import { requireDefined } from '@repo/core/requireDefined'
import {
  retainFixturePartitions,
  retainObject,
  type IndividualAudit,
  type JsonRecord,
  type ProvenanceStore,
  type RuleDeclaration,
  type AuditGuard,
} from '@repo/core/provenance'
import { addressNormalisationRule } from '@repo/core/pipeline/services/addresses/normalisation'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import apiFields from '../../../../../../fixtures/meta/apiFields/api-addresses-v0.1@official-lineage.json'
import { retainProducerAudit } from '../../api/producerAudit'

export type AddressPreparationAudit = {
  schemaVersion: 1
  sourceVersion: string
  preparedSha256: string
  sourceFeatureCount: number
  outputCount: number
  declarations: { preparation: RuleDeclaration; curation: RuleDeclaration }
  fixtures: Array<{ type: string; document: Record<string, unknown> }>
  processingActions: ReleaseProcessingAction[]
  guards?: AuditGuard[]
}

export async function readAddressPreparationAudit(
  path: string,
  sha256: string,
  sourceVersion: string,
) {
  let audit: AddressPreparationAudit
  try {
    audit = JSON.parse(
      await readFile(`${path}.audit.json`, 'utf8'),
    ) as AddressPreparationAudit
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error(
        'ALS preparation has no audit inputs. Prepare the release again before uploading.',
      )
    throw error
  }
  if (
    audit.schemaVersion !== 1 ||
    audit.preparedSha256 !== sha256 ||
    audit.sourceVersion !== sourceVersion ||
    !Number.isSafeInteger(audit.sourceFeatureCount) ||
    audit.sourceFeatureCount < 0 ||
    !Number.isSafeInteger(audit.outputCount) ||
    audit.outputCount < 0 ||
    !Array.isArray(audit.fixtures) ||
    !Array.isArray(audit.processingActions)
  )
    throw new Error(
      'ALS preparation audit does not match the prepared release. Prepare the release again.',
    )
  return audit
}

export async function retainAddressProvenance(
  store: ProvenanceStore,
  input: {
    releaseId: string
    datasetCode: string
    preparation: AddressPreparationAudit
    outputCount: number
    address3d?: { sourceCount: number; collectionCount: number; unitCount: number }
  },
) {
  const { preparation } = input
  const declaration = preparation.declarations.curation
  const definition = await retainObject(store, declaration)
  const manual = preparation.processingActions.filter(a => a.mode === 'manual')
  const entries = manual.map(a => (a.evidence as { decision: unknown }).decision)
  if (entries.some(entry => !entry))
    throw new Error('Applied ALS identity decision has no reviewed fixture entry.')
  const parts = await retainFixturePartitions(
    store,
    { kind: 'als-identity-decisions', schemaVersion: 1, entries },
    'entries',
  )
  const individuals: IndividualAudit[] = manual.map((action, index) => {
    const evidence = action.evidence as {
      canonicalRecord: {
        canonicalId: string
        formattedAddress: Record<string, string | null>
      }
      decision: { reason?: string }
    }
    const part = requireDefined(
      parts.find(p => index >= p.firstOrdinal && index < p.firstOrdinal + p.count),
    )
    return {
      id: `${action.action}:${index}`,
      operation: action.action,
      basis: 'fixture',
      outcome: 'applied',
      summary: action.summary,
      reason: evidence.decision.reason ?? action.summary,
      definition,
      fixture: {
        object: part.object,
        pointer: `/entries/${index - part.firstOrdinal}`,
      },
      record: {
        id: evidence.canonicalRecord.canonicalId,
        names: Object.values(evidence.canonicalRecord.formattedAddress).filter(
          (v): v is string => !!v,
        ),
        parents: [],
      },
      context: JSON.parse(JSON.stringify(action.evidence)) as JsonRecord,
    }
  })
  const counters: Record<string, number> = {}
  for (const action of preparation.processingActions)
    if (action.mode === 'automatic')
      counters[action.action] =
        (counters[action.action] ?? 0) + action.affectedRecordCount
  return retainProducerAudit(store, {
    releaseId: input.releaseId,
    datasetCode: input.datasetCode,
    apiFields,
    individuals,
    rules: [
      {
        declaration: preparation.declarations.preparation,
        definition: await retainObject(store, preparation.declarations.preparation),
        inputs: { 'publisher-occurrences': preparation.sourceFeatureCount },
        outputs: {
          'prepared-addresses': preparation.outputCount,
          ...(input.address3d
            ? {
                address3d: input.address3d.collectionCount,
                address3dUnits: input.address3d.unitCount,
              }
            : {}),
        },
        recordsAffected: preparation.sourceFeatureCount,
        decisions: counters,
      },
      {
        declaration,
        definition,
        outcome: preparation.outputCount ? 'applied' : 'not-applicable',
        inputs: { 'curation-documents': preparation.fixtures.length },
        outputs: {},
        recordsAffected: manual.reduce((n, a) => n + a.affectedRecordCount, 0),
        decisions: { identityDecisions: manual.length },
        fixtures: preparation.fixtures.map(f => ({
          ...f,
          arrayKey:
            Object.entries(f.document)
              .filter(([, v]) => Array.isArray(v))
              .sort(
                (a, b) => JSON.stringify(b[1]).length - JSON.stringify(a[1]).length,
              )[0]?.[0] ?? 'entries',
        })),
      },
      {
        declaration: addressNormalisationRule.declaration,
        inputs: { 'prepared-addresses': preparation.outputCount },
        outputs: { address2d: input.outputCount },
        recordsAffected: preparation.outputCount,
        decisions: { normalised: input.outputCount },
      },
    ],
    guards: preparation.guards ?? [],
  })
}
