import type { prepareUpload } from '@repo/core/upload-local'

import type { UploadTarget } from './options.ts'
import {
  buildFinalizeUploadEndpoint,
  buildSignUploadEndpoint,
  resolveHarbourBaseUrl,
} from './upload.ts'

type UploadPreviewResult = Awaited<ReturnType<typeof prepareUpload>>

function cyanText(label: string) {
  return `\u001B[36m${label}\u001B[39m`
}

function deEmphasize(text: string) {
  return `\u001B[90m${text}\u001B[39m`
}

function redText(text: string) {
  return `\u001B[31m${text}\u001B[39m`
}

/**
 * Format a labelled CLI output field with optional provenance metadata.
 */
export function formatField(
  label: string,
  value: string | number,
  inferredFrom?: string,
) {
  const suffix = inferredFrom ? ` ${deEmphasize(`(${inferredFrom})`)}` : ''
  return `${cyanText(label)}: ${value}${suffix}`
}

/**
 * Convert an upload target into user-facing labels for prompts and logs.
 */
export function describeTarget(target: UploadTarget) {
  if (!target.remote) {
    switch (target.environment) {
      case 'dev':
        return {
          label: 'local-dev',
          destination: 'local Wrangler dev / Miniflare environment',
        }
      case 'preview':
      case 'production':
        throw new Error(
          `Invalid local upload environment: ${target.environment}. Local uploads must use env=dev.`,
        )
    }
  }

  switch (target.environment) {
    case 'dev':
      return {
        label: 'cf-dev',
        destination: 'Cloudflare dev environment',
      }
    case 'preview':
      return {
        label: 'cf-preview',
        destination: 'Cloudflare preview environment',
      }
    case 'production':
      return {
        label: 'cf-production',
        destination: 'Cloudflare production environment',
      }
  }
}

/**
 * Render the prepared upload plan as formatted CLI output lines.
 */
export function formatPlan(result: UploadPreviewResult) {
  return [
    formatField('datasetId', result.plan.datasetId),
    formatField('sourceVersion', result.plan.sourceVersion),
    formatField('region', result.plan.regionCode, result.plan.inferredFrom.regionCode),
    formatField(
      'snapshotMonth',
      result.plan.snapshotMonth,
      result.plan.inferredFrom.snapshotMonth,
    ),
    formatField('type', result.plan.type, result.plan.inferredFrom.type),
    formatField('rows', result.plan.rowCount),
    formatField('supersedes', result.plan.supersedesDatasetId ?? '-'),
  ]
}

/**
 * Render the top-level upload summary shown before confirmation.
 */
export function formatSummary(result: UploadPreviewResult, target: UploadTarget) {
  const targetMode = target.remote ? 'cf' : 'local'
  const harbourBaseUrl = resolveHarbourBaseUrl(target)

  return [
    formatField('target', `${target.environment} (${redText(targetMode)})`),
    ...formatPlan(result),
    formatField('harbourApi', harbourBaseUrl),
  ]
}

/**
 * Describe the API dispatch step and the expected downstream behaviour.
 */
export function explainDispatch(target: UploadTarget) {
  const targetDetails = describeTarget(target)
  return [
    `CLI target: ${targetDetails.label}`,
    `Destination: ${targetDetails.destination}`
  ].join('\n')
}
