function cyan(value: string) {
  if (!process.stdout.isTTY || process.env.NO_COLOR) return value
  return `\u001b[36m${value}\u001b[39m`
}

export function formatInteractiveRetry(command: string) {
  return `Run interactively with:\n${cyan(command)}`
}
