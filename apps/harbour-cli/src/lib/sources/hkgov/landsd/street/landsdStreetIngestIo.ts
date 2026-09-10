import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  LANDSD_STREET_NAMING_URL,
  type PairedLandsdStreetNotice,
} from './landsdStreet.ts'
import type { SourceAssetRole } from '../../../sourceAssets.ts'

export function requiredAssetBytes(bytes: Uint8Array | undefined) {
  if (!bytes)
    throw new Error('Source asset requires bytes when no cached artefact exists.')
  return bytes
}

export function isLifecycleCurationNotice(notice: PairedLandsdStreetNotice) {
  return (
    notice.governmentNoticeType === 'change' ||
    notice.governmentNoticeType === 'corrigendum' ||
    notice.governmentNoticeType === 'intention'
  )
}

export async function fetchRequired(fetchImplementation: typeof fetch, url: string) {
  assertLandsdDownloadUrl(url)
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchImplementation(url)
      if (response.url) assertLandsdDownloadUrl(response.url)
      if (response.ok) return response
      lastError = new Error(
        `Source asset download failed with HTTP ${response.status}: ${url}`,
      )
      if (response.status !== 408 && response.status !== 429 && response.status < 500)
        break
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, attempt * 250))
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Source download failed: ${url}`)
}

export function assertLandsdDownloadUrl(value: string) {
  const url = new URL(value)

  if (url.origin !== new URL(LANDSD_STREET_NAMING_URL).origin) {
    throw new Error(`Refusing LandsD download outside the official origin: ${value}`)
  }
}

export async function renderPlanPdfToWebp(pdfPath: string, outputDir: string) {
  await mkdir(outputDir, { recursive: true })
  const temporaryDir = await mkdtemp(join(tmpdir(), 'saanseoi-landsd-plan-preview-'))
  const prefix = join(temporaryDir, 'page')
  try {
    await runCommand('pdftoppm', ['-r', '144', '-png', pdfPath, prefix])
    const images = (await readdir(temporaryDir))
      .filter(file => /^page-\d+\.png$/.test(file))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    const rendered: string[] = []
    for (const [index, image] of images.entries()) {
      const output = planPreviewPath(pdfPath, outputDir, index)
      await runCommand('cwebp', ['-quiet', join(temporaryDir, image), '-o', output])
      rendered.push(output)
    }
    if (rendered.length === 0)
      throw new Error(`No pages were rendered from ${pdfPath}.`)
    return rendered
  } finally {
    await rm(temporaryDir, { recursive: true, force: true })
  }
}

export async function cachedPlanPreviewPaths(pdfPath: string, outputDir: string) {
  const pageCount = await pdfPageCount(pdfPath)
  const paths = Array.from({ length: pageCount }, (_, index) =>
    planPreviewPath(pdfPath, outputDir, index),
  )
  return paths.every(existsSync) ? paths : null
}

function planPreviewPath(pdfPath: string, outputDir: string, pageIndex: number) {
  return join(
    outputDir,
    `${hashText(`${pdfPath}\0${pageIndex}`)}-${pageIndex + 1}.webp`,
  )
}

async function pdfPageCount(pdfPath: string) {
  const output = await runCommandStdout('pdfinfo', [pdfPath])
  const match = /^Pages:\s*(\d+)$/m.exec(output)
  const pageCount = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN
  if (!Number.isSafeInteger(pageCount) || pageCount < 1)
    throw new Error(`pdfinfo did not report a valid page count for ${pdfPath}.`)
  return pageCount
}

export async function pdfToText(pdfPath: string) {
  const child = Bun.spawn(['pdftotext', '-layout', '-nopgbrk', pdfPath, '-'], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(`pdftotext failed: ${stderr.trim() || `exit code ${exitCode}`}`)
  }
  return stdout
}

export async function runCommand(command: string, args: string[]) {
  const child = Bun.spawn([command, ...args], { stdout: 'pipe', stderr: 'pipe' })
  const [exitCode, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0)
    throw new Error(`${command} failed: ${stderr.trim() || `exit code ${exitCode}`}`)
}

export async function runCommandStdout(command: string, args: string[]) {
  const child = Bun.spawn([command, ...args], { stdout: 'pipe', stderr: 'pipe' })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(`${command} failed: ${stderr.trim() || `exit code ${exitCode}`}`)
  }
  return stdout
}

export function mediaTypeForRole(role: Exclude<SourceAssetRole, 'manifest'>) {
  return role === 'sourcePage' ? 'text/html; charset=utf-8' : 'application/pdf'
}

export function fileNameFromUrl(url: string) {
  const value = new URL(url).pathname.split('/').at(-1)
  return value?.replaceAll(/[^A-Za-z0-9._-]+/g, '_') || 'source.bin'
}

export function hashText(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function hashBytes(value: Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}

export function uniqueCount(values: string[][]) {
  return new Set(values.map(value => value.join('\0'))).size
}

export function required(name: string, data: string[]) {
  return { data, name, nullable: false, type: 'STRING' as const }
}

export function nullable(name: string, data: Array<string | null>) {
  return { data, name, nullable: true, type: 'STRING' as const }
}
