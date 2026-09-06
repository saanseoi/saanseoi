import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '../../../..')
export const QIANFAN_MODEL = 'baidu/Qianfan-OCR'
export const QIANFAN_REVISION = '623bf5d20d446abdb36606aa4547cd0c18886fe5'
export const QIANFAN_CACHE_KEY = `qianfan-${QIANFAN_REVISION}`

export type QianfanOcrPage = {
  engine: 'Qianfan-OCR'
  engineVersion: string
  model: string
  revision: string
  prompt: string
  imageSha256: string
  text: string
  generatedTokens: number
  maxNewTokens: number
  hitTokenLimit: false
}

export function parseQianfanOcrOutput(raw: string): QianfanOcrPage {
  const page = JSON.parse(raw) as QianfanOcrPage
  if (
    page?.engine !== 'Qianfan-OCR' ||
    page.model !== QIANFAN_MODEL ||
    page.revision !== QIANFAN_REVISION ||
    typeof page.engineVersion !== 'string' ||
    !page.engineVersion ||
    page.prompt !== 'Parse this document to Markdown.' ||
    typeof page.imageSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(page.imageSha256) ||
    typeof page.text !== 'string' ||
    !page.text.trim() ||
    page.hitTokenLimit !== false ||
    !Number.isSafeInteger(page.generatedTokens) ||
    !Number.isSafeInteger(page.maxNewTokens) ||
    page.generatedTokens < 1 ||
    page.generatedTokens >= page.maxNewTokens
  ) {
    throw new Error(
      'Qianfan OCR returned invalid, empty or truncated output/provenance.',
    )
  }
  return page
}

export async function runQianfanOcr(imagePath: string) {
  const configured = process.env.SAANSEOI_QIANFAN_TIMEOUT_MS ?? '1200000'
  const timeoutMs = Number(configured)
  if (!/^\d+$/.test(configured) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
    throw new Error(
      'SAANSEOI_QIANFAN_TIMEOUT_MS must be a positive integer in milliseconds.',
    )
  const projectPython = join(ROOT, 'apps/harbour-dataops/.venv/bin/python')
  const cachedPython = join(ROOT, '.cache/qianfan-ocr/.venv/bin/python')
  const python =
    process.env.SAANSEOI_QIANFAN_PYTHON ??
    (existsSync(cachedPython) ? cachedPython : projectPython)
  const child = Bun.spawn(
    [python, join(ROOT, 'apps/harbour-dataops/qianfanOcr.py'), imagePath],
    {
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    child.kill('SIGKILL')
  }, timeoutMs)
  try {
    const [code, raw, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    if (timedOut)
      throw new Error(`Qianfan OCR timed out after ${timeoutMs / 1000} seconds.`)
    if (code !== 0)
      throw new Error(`Qianfan OCR failed: ${stderr.trim() || `exit ${code}`}`)
    const page = parseQianfanOcrOutput(raw)
    const hash = createHash('sha256')
      .update(await readFile(imagePath))
      .digest('hex')
    if (page.imageSha256 !== hash) throw new Error('Qianfan OCR image hash mismatch.')
    return { page, raw }
  } finally {
    clearTimeout(timer)
  }
}
