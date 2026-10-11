/** Retry only transient transport/service failures; integrity failures remain fatal. */
export async function retryRemoteR2<T>(
  operation: () => Promise<T>,
  progress: (operation: string) => void = () => {},
  wait: (milliseconds: number) => Promise<void> = milliseconds =>
    new Promise(resolve => setTimeout(resolve, milliseconds)),
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const transient =
        /\bUnspecified error \(0\)|\b(?:HTTP|status(?:Code)?)\s*[:=]?\s*(?:429|500|502|503|504)\b|\b(?:ECONNRESET|ETIMEDOUT|EPIPE)\b|\b(?:network error|fetch failed|timed? out|temporarily unavailable)\b/i.test(
          message,
        )
      if (!transient || attempt >= 4) throw error
      const delay = 1000 * 2 ** (attempt - 1)
      progress(`retrying R2 transfer (${attempt + 1}/4) in ${delay} ms: ${message}`)
      await wait(delay)
    }
  }
}
