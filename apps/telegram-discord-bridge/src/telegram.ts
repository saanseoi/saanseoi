import { formatTelegramHtml, splitTelegramHtml } from './messages.ts'

const REQUEST_TIMEOUT_MS = 15_000
const TELEGRAM_API = 'https://api.telegram.org/bot'
const TELEGRAM_MAX_RETRIES = 3

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
  constructor(private readonly botToken: string) {}

  async sendText(chatId: string, text: string) {
    const messages: TelegramMessage[] = []
    for (const chunk of splitTelegramHtml(formatTelegramHtml(text))) {
      messages.push(
        await this.request<TelegramMessage>('sendMessage', {
          chat_id: chatId,
          link_preview_options: { is_disabled: true },
          parse_mode: 'HTML',
          text: chunk,
        }),
      )
    }
    return messages
  }

  private async request<T>(method: string, body: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < TELEGRAM_MAX_RETRIES; attempt += 1) {
      const response = await fetch(`${TELEGRAM_API}${this.botToken}/${method}`, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      const payload = (await response.json()) as TelegramResponse<T>
      const retryAfter = payload.parameters?.retry_after
      if (response.status === 429 && retryAfter && attempt < TELEGRAM_MAX_RETRIES - 1) {
        await delay(Math.min(retryAfter * 1000, 30_000))
        continue
      }
      if (!response.ok || !payload.ok || payload.result === undefined)
        throw new Error(payload.description ?? `Telegram ${method} failed.`)
      return payload.result
    }

    throw new Error(`Telegram ${method} exhausted its retry budget.`)
  }
}

function delay(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}
