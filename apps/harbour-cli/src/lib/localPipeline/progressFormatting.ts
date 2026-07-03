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

export function formatCount(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
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
