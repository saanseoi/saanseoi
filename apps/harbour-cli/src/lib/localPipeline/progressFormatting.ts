export function formatRunningPhaseLabel(
  left: string,
  right: string,
  current?: number,
  total?: number,
) {
  const suffix =
    current == null || total == null
      ? ''
      : ` ${colorGrey(`(${formatCount(current)}/${formatCount(total)})`)}`

  return `${left} ${right}${suffix}`
}

export function formatCompletedPhaseLabel(left: string, right: string, count?: number) {
  const suffix = count == null ? '' : ` ${colorGrey(`(${formatCount(count)})`)}`
  return `${greenCheck()} ${left} ${right}${suffix}`
}

export function appendPhaseDetails(
  label: string,
  details: Array<string | null | undefined>,
) {
  const resolvedDetails = details.filter(
    (detail): detail is string =>
      typeof detail === 'string' && detail.trim().length > 0,
  )

  if (resolvedDetails.length === 0) {
    return label
  }

  return `${label} ${colorGrey(`(${resolvedDetails.join(', ')})`)}`
}

export function formatCount(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return null
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let unitIndex = 0
  let scaled = value

  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024
    unitIndex += 1
  }

  const digits = scaled >= 100 || unitIndex === 0 ? 0 : scaled >= 10 ? 1 : 2

  return `${scaled.toFixed(digits)} ${units[unitIndex]}`
}

export function formatDurationMs(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return null
  }

  if (value < 1000) {
    return `${Math.round(value)} ms`
  }

  const totalSeconds = value / 1000

  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(totalSeconds >= 10 ? 1 : 2)} s`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function colorGrey(value: string) {
  return `\u001B[90m${value}\u001B[39m`
}

export function colorRed(value: string) {
  return `\u001B[31m${value}\u001B[39m`
}

export function colorTeal(value: string) {
  return `\u001B[36m${value}\u001B[39m`
}

export function greenCheck() {
  return `\u001B[32m✓\u001B[39m`
}
