import { box, log } from '@clack/prompts'
import { formatMutedValue } from '../cli/display.ts'
import type { UploadTarget } from '../cli/options.ts'
import {
  createApiReleaseSetInitialDraft,
  createApiReleaseSetRevisionDraft,
} from './docs.ts'
import { recordInitialisationSummaryEvent } from './initialisationSummary.ts'
import { formatDurationMs } from '../localPipeline/progressFormatting.ts'
import type {
  AddressPlan,
  DivisionGeometryPlan,
  DivisionReleaseSetReadiness,
} from './uploadReadiness.ts'

const API_DOMAIN_RELEASE_WIDTH = 120

export function formatSuccessfulReleaseMessage(startedAt: number) {
  const elapsed = formatDurationMs(Date.now() - startedAt) ?? '0 ms'
  return `✔ ${blueText('Source Release successful')} ${formatMutedValue(`(${elapsed})`)}`
}

function blueText(value: string) {
  return `\u001B[34m${value}\u001B[39m`
}

function greenText(value: string) {
  return `\u001B[32m${value}\u001B[39m`
}

function yellowText(value: string) {
  return `\u001B[33m${value}\u001B[39m`
}

function orangeText(value: string) {
  return `\u001B[38;5;208m${value}\u001B[39m`
}

function mutedText(value: string) {
  return `\u001B[90m${value}\u001B[39m`
}

export function formatDivisionApiReleaseSetReadiness(
  plan: Pick<DivisionGeometryPlan, 'cohortKey' | 'regionCode'> &
    Partial<Pick<DivisionGeometryPlan, 'datasetCode' | 'source'>>,
  readiness: DivisionReleaseSetReadiness,
) {
  const width = Math.max(...readiness.members.map(member => member.resourceType.length))

  return [
    '# REQUIRED MEMBERS',
    `${plan.regionCode.toUpperCase()} / ${readiness.domainCode} / ${plan.cohortKey}`,
    ...readiness.members.map(member => {
      const available = member.releaseCode !== null
      const cohort = member.cohortKeys.join(', ')
      const mode = member.cohortMatchingMode.replaceAll('_', ' ')
      return `  ${available ? greenText('✓') : member.isRequired ? redText('○') : yellowText('○')} ${formatResourceType(member.resourceType.padEnd(width))}  ${mutedText(`(${member.variant}; ${mode}${cohort ? `: ${cohort}` : ''})`)}  ${available ? greenText('available') : member.isRequired ? redText('unavailable') : yellowText('[optional]')}`
    }),
  ].join('\n')
}

export function wideApiDomainReleaseNote(message: string) {
  const output = Object.create(process.stdout) as NodeJS.WriteStream
  Object.defineProperty(output, 'columns', {
    configurable: true,
    value: API_DOMAIN_RELEASE_WIDTH,
  })

  box(message, 'API DOMAIN RELEASE', {
    contentPadding: 0,
    formatBorder: mutedText,
    output,
    width: 1,
  })
}

function formatResourceType(resourceType: string) {
  const [type = '', subType] = resourceType.split('::')
  return `${greenText(type)}${subType ? `${mutedText('::')}${orangeText(subType)}` : ''}`
}

export function formatAddressApiReleaseSetReadiness(
  plan: Pick<AddressPlan, 'cohortKey' | 'regionCode'>,
  addressAvailable: boolean,
  releaseSetCode?: string,
  divisionCohortKey?: string | null,
) {
  const domainCode = releaseSetCode?.match(/--([a-z0-9-]+)$/i)?.[1] ?? 'official'

  return [
    `${plan.regionCode.toUpperCase()} / ${domainCode} / ${plan.cohortKey}`,
    `  ${addressAvailable ? greenText('✓') : yellowText('○')} address  ${addressAvailable ? 'available' : 'unavailable'}`,
    ...(divisionCohortKey && divisionCohortKey !== plan.cohortKey
      ? [
          '',
          'Out of Cohort',
          `  ${greenText('✓')} division (overture)  ${divisionCohortKey}`,
        ]
      : []),
  ].join('\n')
}

export async function logApiReleaseSetPublication(
  result:
    | {
        apiCatalogRevisionCode?: string
        apiReleaseSetCode?: string
        apiReleaseSetPublications?: Array<{
          apiCatalogRevisionCode?: string
          apiReleaseSetCode: string
        }>
        apiReleaseSetStatus?: 'current' | 'draft' | 'archived'
      }
    | void
    | null
    | undefined,
  revisionDraft?: {
    datasetName: string
    prompt: boolean
    publisherCode: string
    sourceVersion: string
  },
  target?: UploadTarget,
) {
  const publications = selectPublishedApiReleaseSetPublications(result)
  for (const publication of publications) {
    log.success(
      `Published API domain release ${rainbowWaveText(publication.apiReleaseSetCode)}.`,
    )
    await recordInitialisationSummaryEvent({
      apiReleaseSetCode: publication.apiReleaseSetCode,
      type: 'published-api-release-set',
    })
    if (publication.apiCatalogRevisionCode) {
      log.info(`Catalogue revision ${blueText(publication.apiCatalogRevisionCode)}`)
    }
  }

  const releaseSetCode = result?.apiReleaseSetCode
  if (releaseSetCode && result?.apiReleaseSetStatus === 'draft') {
    log.warn(`${redText('DRAFT')} ${blueText(releaseSetCode)}`)
  }

  if (!revisionDraft || !target) return

  for (const { apiReleaseSetCode } of publications) {
    try {
      const draft =
        (await createApiReleaseSetInitialDraft(apiReleaseSetCode, target)) ??
        (await createApiReleaseSetRevisionDraft(
          { apiReleaseSetCode, ...revisionDraft },
          { prompt: revisionDraft.prompt },
        ))
      if (draft?.status === 'created') {
        log.info(`Drafted API release docs: ${draft.path}`)
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      log.warn(`API release docs were not drafted: ${reason}`)
    }
  }
}

export function selectPublishedApiReleaseSetPublications(
  result:
    | {
        apiCatalogRevisionCode?: string
        apiReleaseSetCode?: string
        apiReleaseSetPublications?: Array<{
          apiCatalogRevisionCode?: string
          apiReleaseSetCode: string
        }>
        apiReleaseSetStatus?: 'current' | 'draft' | 'archived'
      }
    | void
    | null
    | undefined,
) {
  const publications = new Map<
    string,
    { apiCatalogRevisionCode?: string; apiReleaseSetCode: string }
  >()
  for (const publication of result?.apiReleaseSetPublications ?? []) {
    publications.set(publication.apiReleaseSetCode, publication)
  }
  if (result?.apiReleaseSetCode && result.apiReleaseSetStatus === 'current') {
    const existing = publications.get(result.apiReleaseSetCode)
    publications.set(result.apiReleaseSetCode, {
      apiCatalogRevisionCode:
        existing?.apiCatalogRevisionCode ?? result.apiCatalogRevisionCode,
      apiReleaseSetCode: result.apiReleaseSetCode,
    })
  }
  return [...publications.values()]
}

export function rainbowWaveText(value: string) {
  const colors = [196, 202, 226, 46, 51, 21, 201]
  return [...value]
    .map(
      (character, index) => `\u001B[38;5;${colors[index % colors.length]}m${character}`,
    )
    .join('')
    .concat('\u001B[39m')
}

function redText(value: string) {
  return `\u001B[31m${value}\u001B[39m`
}
