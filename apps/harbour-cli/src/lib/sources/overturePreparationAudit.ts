import { resolve } from 'node:path'
import { deliverProducerAudit } from '../api/producerAuditDelivery'
import { retainProducerAudit } from '../api/producerAudit'
import type { UploadTarget } from '../cli/options'
import {
  OVERTURE_PRC_COUNTRY_ID,
  type CountryPreparationReference,
} from './overtureCountryAnchor'

export async function retainOverturePreparationAudit(
  target: UploadTarget,
  resourceReleaseId: string,
  evidence: {
    sourceVersion: string
    inputCount: number
    outputCount: number
    reference: CountryPreparationReference
  },
) {
  if (evidence.outputCount !== evidence.inputCount + 1)
    throw Error('Country preparation must add exactly one country reference.')
  await deliverProducerAudit({
    target,
    directory: resolve(
      import.meta.dir,
      '../../../../../.local/overture-preparation-audits',
      target.environment,
      resourceReleaseId,
    ),
    identity: JSON.stringify({ resourceReleaseId, ...evidence }),
    retain: store =>
      retainProducerAudit(store, {
        scope: { stage: 'preparation', ownerId: resourceReleaseId },
        resourceReleaseId,
        datasetCode: 'ds-hk-overture-division',
        rules: [
          {
            declaration: {
              kind: 'processing-rule',
              schemaVersion: 1,
              id: 'retain-country-reference',
              scope: 'bulk',
              basis: 'fixture',
              summary:
                'Add China country ancestor, which has been filtered out by the SAR boundary filter.',
              inputs: ['publisher-extract'],
              outputs: ['prepared-records'],
              parameters: {
                sourceVersion: evidence.sourceVersion,
                referenceKind: evidence.reference.kind,
                referenceSha256: evidence.reference.sha256,
                recordId: OVERTURE_PRC_COUNTRY_ID,
              },
              implementation: {
                path: 'apps/harbour-cli/src/lib/sources/overtureCountryAnchor.ts',
                symbol: 'prepareOvertureCountryAnchor',
              },
            },
            inputs: { 'publisher-extract': evidence.inputCount },
            outputs: { 'prepared-records': evidence.outputCount },
            recordsAffected: 1,
            decisions: { [evidence.reference.kind]: 1 },
            fixtures: [
              {
                type: evidence.reference.kind,
                document: { records: [evidence.reference.document] },
                arrayKey: 'records',
              },
            ],
          },
        ],
        guards: [
          {
            id: 'overture-country-reference',
            summary:
              'Require an exact publisher release and a validated missing-country reference.',
            consequence: 'block-ingestion',
            status: 'passed',
            checked: 1,
            failed: 0,
            reason:
              'The prepared extract adds exactly one validated PRC country reference.',
          },
        ],
      }),
  })
}
