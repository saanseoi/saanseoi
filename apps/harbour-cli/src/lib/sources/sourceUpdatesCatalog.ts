import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { datasetVariantForSource, type ResourceType } from '@repo/core'
import type {
  ApiCompositionFixture,
  CompositionIngestDependency,
  CompositionMemberReference,
  DatasetFixture,
} from './sourceUpdatesTypes.ts'
import { API_COMPOSITION_ROOT, DATASET_ROOT } from './sourceUpdatesConfig.ts'

export async function loadDatasetFixtures(
  datasetCodes?: Set<string>,
): Promise<DatasetFixture[]> {
  const entries = await readdir(DATASET_ROOT, { withFileTypes: true })
  const fixtures: DatasetFixture[] = []

  for (const entry of entries.filter(
    entry => entry.isFile() && entry.name.endsWith('.json'),
  )) {
    const sourceFixture = JSON.parse(
      await readFile(resolve(DATASET_ROOT, entry.name), 'utf8'),
    ) as Omit<DatasetFixture, 'type'>
    if (datasetCodes && !datasetCodes.has(sourceFixture.code)) continue

    const resourceTypes = sourceFixture.resourceTypes ?? []
    if (resourceTypes.length === 0) {
      throw new Error(
        `Dataset fixture ${sourceFixture.code} must declare at least one resource type.`,
      )
    }
    fixtures.push({
      ...sourceFixture,
      resourceType: resourceTypes[0] as string,
    } satisfies DatasetFixture)
  }

  return fixtures.sort((left, right) => left.code.localeCompare(right.code))
}

/**
 * Reads the currently declared materialisation edges from API compositions.
 * Dataset fixtures intentionally remain source-discovery metadata: they do
 * not define what other data must be loaded before they are processed.
 */
export async function loadCurrentCompositionIngestDependencies(): Promise<
  CompositionIngestDependency[]
> {
  const entries = await readdir(API_COMPOSITION_ROOT, { withFileTypes: true })
  const dependencies: CompositionIngestDependency[] = []

  for (const entry of entries.filter(
    entry => entry.isFile() && entry.name.endsWith('.json'),
  )) {
    const composition = JSON.parse(
      await readFile(resolve(API_COMPOSITION_ROOT, entry.name), 'utf8'),
    ) as ApiCompositionFixture
    if (composition.status !== 'current') continue

    for (const domain of composition.domains ?? []) {
      for (const member of domain.members) {
        for (const dependency of member.ingestDependencies ?? []) {
          dependencies.push({
            compositionCode: composition.code,
            consumer: {
              resourceType: member.resourceType,
              variant: member.variant ?? 'default',
            },
            domainCode: domain.code,
            provider: {
              resourceType: dependency.resourceType,
              variant: dependency.variant ?? 'default',
            },
          })
        }
      }
    }
  }

  return dependencies
}

/**
 * Expands a requested set with composition-declared prerequisites and returns
 * a deterministic topological ordering. An edge means that the provider must
 * be available before the consumer is materialised.
 */
export function orderDatasetsByCompositionDependencies(
  allDatasets: readonly DatasetFixture[],
  requestedDatasets: readonly DatasetFixture[],
  dependencies: readonly CompositionIngestDependency[],
): DatasetFixture[] {
  const datasetsByMember = new Map<string, DatasetFixture[]>()
  for (const dataset of allDatasets) {
    for (const member of datasetCompositionMembers(dataset)) {
      const matching = datasetsByMember.get(member) ?? []
      matching.push(dataset)
      datasetsByMember.set(member, matching)
    }
  }

  const selected = new Map(requestedDatasets.map(dataset => [dataset.code, dataset]))
  const providersByConsumer = new Map<string, Set<string>>()
  const queue = [...requestedDatasets]

  for (const dataset of queue) {
    const providerCodes = providersByConsumer.get(dataset.code) ?? new Set<string>()
    for (const member of datasetCompositionMembers(dataset)) {
      for (const dependency of dependencies.filter(
        candidate => compositionMemberKey(candidate.consumer) === member,
      )) {
        const providers = datasetsByMember.get(
          compositionMemberKey(dependency.provider),
        )
        if (!providers || providers.length === 0) {
          throw new Error(
            `Composition ${dependency.compositionCode}/${dependency.domainCode} requires ${formatCompositionMember(dependency.provider)}, but no dataset fixture provides it.`,
          )
        }
        for (const provider of providers) {
          if (provider.code !== dataset.code) providerCodes.add(provider.code)
          if (!selected.has(provider.code)) {
            selected.set(provider.code, provider)
            queue.push(provider)
          }
        }
      }
    }
    providersByConsumer.set(dataset.code, providerCodes)
  }

  const ordered: DatasetFixture[] = []
  const remaining = new Map(
    [...selected.values()].map(dataset => [dataset.code, dataset]),
  )
  const emitted = new Set<string>()

  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter(dataset =>
        [...(providersByConsumer.get(dataset.code) ?? [])].every(
          providerCode => emitted.has(providerCode) || !remaining.has(providerCode),
        ),
      )
      .sort((left, right) => left.code.localeCompare(right.code))
    if (ready.length === 0) {
      throw new Error(
        `Composition ingest dependencies contain a cycle: ${[...remaining.keys()].sort().join(', ')}.`,
      )
    }
    for (const dataset of ready) {
      remaining.delete(dataset.code)
      emitted.add(dataset.code)
      ordered.push(dataset)
    }
  }

  return ordered
}

function datasetCompositionMembers(dataset: DatasetFixture) {
  return (
    dataset.resourceTypes ?? (dataset.resourceType ? [dataset.resourceType] : [])
  ).map(resourceType =>
    compositionMemberKey({
      resourceType,
      variant:
        resourceType === 'division' ||
        resourceType === 'divisionArea' ||
        resourceType === 'divisionBoundary'
          ? (dataset.sourceVariant ?? dataset.publisherCode)
          : datasetVariantForSource(
              resourceType as ResourceType,
              dataset.publisherCode,
              { datasetCode: dataset.code },
            ),
    }),
  )
}

function compositionMemberKey(member: Required<CompositionMemberReference>) {
  return `${member.resourceType}:${member.variant}`
}

function formatCompositionMember(member: Required<CompositionMemberReference>) {
  return `${member.resourceType}/${member.variant}`
}
