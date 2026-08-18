import { formatTelegramHtml, splitTelegramHtml } from './messages.ts'

const REQUEST_TIMEOUT_MS = 15_000
const TELEGRAM_API = 'https://api.telegram.org/bot'
const TELEGRAM_MAX_RETRIES = 3
const TELEGRAM_MAX_RETRY_DELAY_MS = 30_000

type TelegramClientDependencies = {
  delay?: (milliseconds: number) => Promise<void>
  fetch?: typeof fetch
}

export type TelegramMessage = {
  message_id: number
}

type TelegramResponse<T> = {
  ok: boolean
  description?: string
  parameters?: { retry_after?: number }
  result?: T
}

export class TelegramClient {
  private readonly delay: (milliseconds: number) => Promise<void>
  private readonly fetch: typeof fetch

  constructor(
    private readonly botToken: string,
    dependencies: TelegramClientDependencies = {},
  ) {
    this.delay = dependencies.delay ?? delay
    this.fetch = dependencies.fetch ?? fetch
  }

  async sendText(
    chatId: string,
    text: string,
    options: {
      onSent?: (message: TelegramMessage) => void
      skip?: number
    } = {},
  ) {
    const messages: TelegramMessage[] = []
    const chunks = splitTelegramHtml(formatTelegramHtml(text))
    for (const chunk of chunks.slice(options.skip ?? 0)) {
      const message = await this.request<TelegramMessage>('sendMessage', {
        chat_id: chatId,
        link_preview_options: { is_disabled: true },
        parse_mode: 'HTML',
        text: chunk,
      })
      messages.push(message)
      options.onSent?.(message)
    }
    return messages
  }

  private async request<T>(method: string, body: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < TELEGRAM_MAX_RETRIES; attempt += 1) {
      const response = await this.fetch(`${TELEGRAM_API}${this.botToken}/${method}`, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      const payload = await jsonOrUndefined<TelegramResponse<T>>(response)
      const retryable = response.status === 429 || response.status >= 500
      if (retryable && attempt < TELEGRAM_MAX_RETRIES - 1) {
        await this.delay(retryDelay(attempt, payload?.parameters?.retry_after))
        continue
      }
      if (!response.ok || !payload?.ok || payload.result === undefined)
        throw new Error(payload?.description ?? `Telegram ${method} failed.`)
      return payload.result
    }

    throw new Error(`Telegram ${method} exhausted its retry budget.`)
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
  return Math.min(milliseconds, TELEGRAM_MAX_RETRY_DELAY_MS)
}

function delay(milliseconds: number) {
  return new Promise<void>(resolve => setTimeout(resolve, milliseconds))
}
