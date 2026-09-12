import { mkdir, open, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  CSDI_ARCHIVE_DOWNLOAD_TIMEOUT_MS,
  CSDI_ARCHIVE_ORIGIN,
  DATA_GOV_HK_DOWNLOAD_TIMEOUT_MS,
  HTTP_REDIRECT_STATUSES,
  MAX_CSDI_ARCHIVE_BYTES,
  MAX_CSDI_ARCHIVE_REDIRECTS,
  MAX_DATA_GOV_HK_ARCHIVE_BYTES,
} from './sourceUpdatesConfig.ts'

export async function downloadCsdiArchive(url: string, targetPath: string) {
  const response = await fetchCsdiArchiveResponse(
    url,
    AbortSignal.timeout(CSDI_ARCHIVE_DOWNLOAD_TIMEOUT_MS),
  )
  if (!response.ok)
    throw new Error(`Download failed with HTTP ${response.status}: ${url}`)
  const prefix = await readBoundedResponseBytes(
    response,
    MAX_CSDI_ARCHIVE_BYTES,
    targetPath,
  )
  try {
    assertCsdiArchiveDownload(prefix, response.headers.get('content-type'), url)
  } catch (error) {
    await rm(targetPath, { force: true })
    throw error
  }
  return readContentDispositionFileName(response.headers.get('content-disposition'))
}

async function fetchCsdiArchiveResponse(url: string, signal: AbortSignal) {
  let currentUrl = url

  for (let redirects = 0; redirects <= MAX_CSDI_ARCHIVE_REDIRECTS; redirects += 1) {
    assertCsdiArchiveUrl(currentUrl)
    const response = await fetch(currentUrl, { redirect: 'manual', signal })
    if (!HTTP_REDIRECT_STATUSES.has(response.status)) return response

    if (redirects === MAX_CSDI_ARCHIVE_REDIRECTS) {
      await response.body?.cancel()
      throw new Error(
        `CSDI archive download exceeded ${MAX_CSDI_ARCHIVE_REDIRECTS} redirects: ${url}`,
      )
    }

    const location = response.headers.get('location')
    await response.body?.cancel()
    if (!location) {
      throw new Error(`CSDI archive redirect has no Location header: ${currentUrl}`)
    }
    currentUrl = resolveCsdiArchiveRedirect(currentUrl, location)
  }

  throw new Error(`CSDI archive download could not resolve: ${url}`)
}

export function resolveCsdiArchiveRedirect(currentUrl: string, location: string) {
  const redirectUrl = new URL(location, currentUrl).toString()
  assertCsdiArchiveUrl(redirectUrl)
  return redirectUrl
}

export function assertCsdiArchiveUrl(value: string) {
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.origin !== CSDI_ARCHIVE_ORIGIN ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw new Error(
      `Refusing CSDI archive download outside the official origin: ${value}`,
    )
  }
}

async function readBoundedResponseBytes(
  response: Response,
  maxBytes: number,
  targetPath: string,
  label = 'CSDI archive',
) {
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel()
    throw new Error(
      `${label} exceeds the ${maxBytes.toLocaleString('en-US')} byte download limit.`,
    )
  }

  await mkdir(dirname(targetPath), { recursive: true })
  if (!response.body) {
    await writeFile(targetPath, new Uint8Array())
    return new Uint8Array()
  }

  const file = await open(targetPath, 'w')
  const prefix = new Uint8Array(512)
  let prefixLength = 0
  let byteLength = 0
  const reader = response.body.getReader()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      byteLength += value.byteLength
      if (byteLength > maxBytes) {
        await reader.cancel()
        throw new Error(
          `${label} exceeds the ${maxBytes.toLocaleString('en-US')} byte download limit.`,
        )
      }
      await file.write(value)
      if (prefixLength < prefix.byteLength) {
        const prefixValue = value.subarray(0, prefix.byteLength - prefixLength)
        prefix.set(prefixValue, prefixLength)
        prefixLength += prefixValue.byteLength
      }
    }
    await file.close()
  } catch (error) {
    await file.close().catch(() => undefined)
    await rm(targetPath, { force: true })
    throw error
  }
  return prefix.subarray(0, prefixLength)
}

export function assertCsdiArchiveDownload(
  bytes: Uint8Array,
  contentType: string | null,
  url: string,
) {
  const prefix = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart()
  const isHtml =
    contentType?.toLowerCase().includes('text/html') ||
    /^<!doctype\s+html\b|^<html\b/i.test(prefix)
  if (isHtml) {
    throw new Error(
      `CSDI archive download returned an HTML failure page instead of the source file: ${url}`,
    )
  }
}

function readContentDispositionFileName(value: string | null) {
  if (!value) return undefined
  const encoded = value.match(/\bfilename\*\s*=\s*UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded).replaceAll(/[\\/]/g, '_')
    } catch {
      // Fall through to filename when a publisher sends malformed RFC 5987.
    }
  }
  return value
    .match(/\bfilename\s*=\s*(?:"([^"]+)"|([^;\s]+))/i)
    ?.slice(1)
    .find(Boolean)
    ?.replaceAll(/[\\/]/g, '_')
}

export async function fetchText(
  url: string,
): Promise<{ body: string; headers: Headers }> {
  const response = await fetchWithRetry(url)
  if (!response.ok)
    throw new Error(`Request failed with HTTP ${response.status}: ${url}`)
  return { body: await response.text(), headers: response.headers }
}

export async function fetchJsonWithRetry(url: string, attempts = 3): Promise<unknown> {
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchText(url)
      return JSON.parse(response.body) as unknown
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      await new Promise(resolve => setTimeout(resolve, attempt * 250))
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(
    `Response was not valid JSON after ${attempts} attempts: ${url} (${reason})`,
  )
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url)
      if (!isRetryableStatus(response.status) || attempt === attempts) {
        return response
      }
    } catch (error) {
      lastError = error
      if (attempt === attempts) throw error
    }

    await new Promise(resolve => setTimeout(resolve, attempt * 250))
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Request failed after ${attempts} attempts: ${url}`)
}

function isRetryableStatus(status: number) {
  return status === 403 || status === 408 || status === 429 || status >= 500
}

export async function downloadResponse(url: string, targetPath: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(DATA_GOV_HK_DOWNLOAD_TIMEOUT_MS),
  })
  if (!response.ok)
    throw new Error(`Download failed with HTTP ${response.status}: ${url}`)
  await readBoundedResponseBytes(
    response,
    MAX_DATA_GOV_HK_ARCHIVE_BYTES,
    targetPath,
    'DATA.GOV.HK archive',
  )
  return targetPath
}
