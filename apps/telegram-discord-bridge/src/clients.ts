const REQUEST_TIMEOUT_MS = 15_000
const MAX_RETRIES = 3
const MAX_RETRY_DELAY_MS = 30_000

type ClientDependencies = {
  delay?: (milliseconds: number) => Promise<void>
  fetch?: typeof fetch
}

export type TelegramResponse<T> = {
  ok: boolean
  description?: string
  parameters?: { retry_after?: number }
  result?: T
}

export class TelegramClient {
  private readonly delay: (milliseconds: number) => Promise<void>
  private readonly fetch: typeof fetch

  constructor(
    private readonly token: string,
    dependencies: ClientDependencies = {},
  ) {
    this.delay = dependencies.delay ?? delay
    this.fetch = dependencies.fetch ?? fetch
  }

  async request<T>(method: string, body: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const response = await this.fetch(
        `https://api.telegram.org/bot${this.token}/${method}`,
        {
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      )
      const payload = await jsonOrUndefined<TelegramResponse<T>>(response)
      const retryable = response.status === 429 || response.status >= 500
      if (retryable) {
        if (attempt === MAX_RETRIES - 1) break
        await this.delay(retryDelay(attempt, payload?.parameters?.retry_after))
        continue
      }
      if (!response.ok || !payload?.ok || payload.result === undefined) {
        throw new Error(payload?.description ?? `Telegram ${method} failed.`)
      }
      return payload.result
    }

    throw new Error(`Telegram ${method} exhausted its retry budget.`)
  }
}

export class DiscordClient {
  private readonly delay: (milliseconds: number) => Promise<void>
  private readonly fetch: typeof fetch

  constructor(
    private readonly token: string,
    dependencies: ClientDependencies = {},
  ) {
    this.delay = dependencies.delay ?? delay
    this.fetch = dependencies.fetch ?? fetch
  }

  async request<T>(path: string): Promise<T> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const response = await this.fetch(`https://discord.com/api/v10${path}`, {
        headers: { authorization: `Bot ${this.token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (response.status === 429) {
        const payload = await jsonOrUndefined<{ retry_after?: number }>(response)
        if (attempt === MAX_RETRIES - 1) break
        await this.delay(retryDelay(attempt, payload?.retry_after))
        continue
      }
      if (!response.ok) {
        throw new Error(`Discord API returned HTTP ${response.status} for ${path}.`)
      }
      return (await response.json()) as T
    }

    throw new Error(`Discord API exhausted its retry budget for ${path}.`)
  }
}

async function jsonOrUndefined<T>(response: Response) {
  try {
    return (await response.json()) as T
  } catch {
    return undefined
  }
}

function retryDelay(attempt: number, retryAfterSeconds?: number) {
  const milliseconds =
    typeof retryAfterSeconds === 'number' && retryAfterSeconds >= 0
      ? retryAfterSeconds * 1000
      : 1000 * 2 ** attempt
  return Math.min(milliseconds, MAX_RETRY_DELAY_MS)
}

function delay(milliseconds: number) {
  return new Promise<void>(resolve => setTimeout(resolve, milliseconds))
}
