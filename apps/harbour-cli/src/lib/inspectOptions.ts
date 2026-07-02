import { autocomplete, cancel, isCancel, select } from '@clack/prompts'

import {
  inspectDbShards,
  inspectResourceTypes,
  inspectSampleStrategies,
  listInspectableReleaseCodes,
  normalizeInspectDbShard,
  normalizeInspectResourceType,
  normalizeInspectSampleStrategy,
  normalizeInspectStage,
  type InspectArtifactOptions,
  type InspectDbShard,
  type InspectResourceType,
  type InspectSampleStrategy,
  type InspectStage,
} from './inspect.ts'
import { getStringOption, type ParsedArgs } from './options.ts'

export async function resolveInspectOptions(
  args: ParsedArgs,
): Promise<InspectArtifactOptions> {
  const persistDir = getStringOption(args, ['persist-to']) ?? '.local/d1/dev'
  const outDir = getStringOption(args, ['out-dir']) ?? '.'
  const stage =
    resolveProvidedInspectStage(args) ??
    (await promptSelect<InspectStage>('Stage', [
      {
        label: 'JSON Normalised',
        value: 'normalized',
      },
      {
        label: 'Resolved JSON',
        value: 'resolved',
      },
      {
        label: 'Operations SQL',
        value: 'operations',
      },
    ]))
  const resourceType =
    resolveProvidedInspectResourceType(args) ??
    (await promptSelect<InspectResourceType>(
      'Resource type',
      inspectResourceTypes.map(value => ({
        label: value,
        value,
      })),
    ))
  const releaseCode =
    getStringOption(args, ['releaseCode', 'release-code', 'release']) ??
    (await promptReleaseCode({
      persistDir,
      resourceType,
      stage,
    }))
  const dbShard =
    stage === 'operations'
      ? (resolveProvidedInspectDbShard(args) ??
        (await promptSelect<InspectDbShard>(
          'DB family',
          inspectDbShards.map(value => ({
            label: value,
            value,
          })),
        )))
      : undefined
  const sample =
    resolveProvidedInspectSampleStrategy(args) ??
    (await promptSelect<InspectSampleStrategy>(
      'Sample strategy',
      inspectSampleStrategies.map(value => ({
        label: value,
        value,
      })),
    ))

  return {
    dbShard,
    outDir,
    persistDir,
    releaseCode,
    resourceType,
    sample,
    stage,
  }
}

function resolveProvidedInspectStage(args: ParsedArgs) {
  const rawValue = getStringOption(args, ['stage'])

  if (!rawValue) {
    return null
  }

  const stage = normalizeInspectStage(rawValue)

  if (!stage) {
    throw new Error(
      `Invalid --stage value: ${rawValue}. Use normalized, resolved, or operations.`,
    )
  }

  return stage
}

function resolveProvidedInspectResourceType(args: ParsedArgs) {
  const rawValue = getStringOption(args, ['resourceType', 'resource-type'])

  if (!rawValue) {
    return null
  }

  const resourceType = normalizeInspectResourceType(rawValue)

  if (!resourceType) {
    throw new Error(`Invalid --resourceType value: ${rawValue}. Use address.`)
  }

  return resourceType
}

function resolveProvidedInspectDbShard(args: ParsedArgs) {
  const rawValue = getStringOption(args, ['dbShard', 'db-shard'])

  if (!rawValue) {
    return null
  }

  const dbShard = normalizeInspectDbShard(rawValue)

  if (!dbShard) {
    throw new Error(
      `Invalid --dbShard value: ${rawValue}. Use source, history, or current.`,
    )
  }

  return dbShard
}

function resolveProvidedInspectSampleStrategy(args: ParsedArgs) {
  const rawValue = getStringOption(args, ['sample'])

  if (!rawValue) {
    return null
  }

  const sample = normalizeInspectSampleStrategy(rawValue)

  if (!sample) {
    throw new Error(`Invalid --sample value: ${rawValue}. Use first, last, or random.`)
  }

  return sample
}

async function promptReleaseCode(options: {
  persistDir: string
  resourceType: InspectResourceType
  stage: InspectStage
}) {
  const releaseCodes = listInspectableReleaseCodes(options)

  if (releaseCodes.length === 0) {
    throw new Error(
      `No local ${options.stage} artifacts found for ${options.resourceType}.`,
    )
  }

  const value = await autocomplete({
    initialValue: releaseCodes[0],
    maxItems: 10,
    message: 'Release code',
    options: releaseCodes.map(releaseCode => ({
      label: releaseCode,
      value: releaseCode,
    })),
  })

  if (isCancel(value)) {
    cancel('INSPECT CANCELLED')
    process.exit(1)
  }

  return value
}

async function promptSelect<T extends string>(
  message: string,
  options: Array<{ label: string; value: T }>,
) {
  const value = await select<T>({
    message,
    options: options as Parameters<typeof select<T>>[0]['options'],
  })

  if (isCancel(value)) {
    cancel('INSPECT CANCELLED')
    process.exit(1)
  }

  return value
}
