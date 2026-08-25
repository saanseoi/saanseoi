import { appendFile } from 'node:fs/promises'

export type InitialisationSummaryEvent =
  | {
      apiReleaseSetCode: string
      type: 'published-api-release-set'
    }
  | {
      command: string | null
      message: string
      releaseCode: string | null
      type: 'error'
    }

export async function recordInitialisationSummaryEvent(
  event: InitialisationSummaryEvent,
  path = process.env.SAANSEOI_INIT_SUMMARY_PATH,
) {
  if (!path) return

  await appendFile(path, `${JSON.stringify(event)}\n`, 'utf8')
}

export function parseInitialisationSummaryEvents(value: string) {
  const events: InitialisationSummaryEvent[] = []

  for (const line of value.split('\n')) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line) as InitialisationSummaryEvent
      if (
        (event.type === 'published-api-release-set' &&
          typeof event.apiReleaseSetCode === 'string') ||
        (event.type === 'error' &&
          typeof event.message === 'string' &&
          (typeof event.releaseCode === 'string' || event.releaseCode === null) &&
          (typeof event.command === 'string' || event.command === null))
      ) {
        events.push(event)
      }
    } catch {
      // A child process may have been interrupted while appending its final
      // event. Preserve all complete records rather than hiding the summary.
    }
  }

  return events
}
