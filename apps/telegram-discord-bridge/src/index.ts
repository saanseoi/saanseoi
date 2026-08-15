import { DurableObject } from 'cloudflare:workers'

import {
  collectMessagesAfter,
  formatAdminLog,
  formatBody,
  splitTelegramText,
  type DiscordMessage,
} from './messages.ts'

const DISCORD_API = 'https://discord.com/api/v10'
const TELEGRAM_API = 'https://api.telegram.org/bot'
const MESSAGEABLE_CHANNEL_TYPES = new Set([0, 5, 10, 11, 12])
const REQUEST_TIMEOUT_MS = 15_000
const TELEGRAM_MAX_RETRIES = 3

export type Env = CloudflareBindings & {
  BRIDGE_INITIAL_SYNC?: 'backfill'
}

type DiscordChannel = {
  id: string
  name?: string
  parent_id?: string | null
  type: number
}

type TelegramMessage = {
  message_id: number
}

type TelegramResponse<T> = {
  ok: boolean
  description?: string
  parameters?: { retry_after?: number }
  result?: T
}

type MessageDelivery = {
  admin_logged_at: number | null
  public_completed_at: number | null
  public_telegram_message_ids: string | null
}

type ChannelCursor = {
  last_message_id: string | null
}

export class DiscordBridge extends DurableObject<Env> {
  private pollPromise: Promise<void> | undefined

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS channel_cursors (
          channel_id TEXT PRIMARY KEY,
          last_message_id TEXT
        );
        CREATE TABLE IF NOT EXISTS message_deliveries (
          message_id TEXT PRIMARY KEY,
          admin_logged_at INTEGER,
          public_completed_at INTEGER,
          public_telegram_message_ids TEXT
        );
      `)
    })
  }

  async poll() {
    if (this.pollPromise) return this.pollPromise
    this.pollPromise = this.pollInternal().finally(() => {
      this.pollPromise = undefined
    })
    return this.pollPromise
  }

  private async pollInternal() {
    const channels = await this.listMessageChannels()
    for (const channel of channels) await this.pollChannel(channel, channels)
  }

  private async pollChannel(channel: DiscordChannel, channels: DiscordChannel[]) {
    const cursor = this.getCursor(channel.id)
    if (!cursor) {
      await this.seedChannel(channel, channels)
      return
    }

    const messages = await this.fetchMessages(channel.id, cursor.last_message_id)
    for (const message of messages) {
      await this.processMessage(message, channel, channels)
      this.setCursor(channel.id, message.id)
    }
  }

  private async seedChannel(channel: DiscordChannel, channels: DiscordChannel[]) {
    if (this.env.BRIDGE_INITIAL_SYNC === 'backfill') {
      const messages = await this.fetchMessages(channel.id, undefined, 100)
      for (const message of messages)
        await this.processMessage(message, channel, channels)
      this.setCursor(channel.id, messages.at(-1)?.id ?? null)
      return
    }

    const latest = await this.fetchMessages(channel.id, undefined, 1)
    this.setCursor(channel.id, latest.at(-1)?.id ?? null)
  }

  private async processMessage(
    message: DiscordMessage,
    channel: DiscordChannel,
    channels: DiscordChannel[],
  ) {
    const delivery = this.getDelivery(message.id)
    if (!delivery?.admin_logged_at) {
      await this.sendTelegramText(
        this.env.TELEGRAM_LOG_CHAT_ID,
        formatAdminLog(message, channelLabel(channel, channels)),
      )
      this.recordAdminLog(message.id)
    }

    if (message.channel_id !== this.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID) return
    if (delivery?.public_completed_at) return

    const publicText = formatBody(message)
    if (!publicText || message.content?.toLowerCase().includes('#no-telegram')) {
      this.completePublicMirror(message.id, [])
      return
    }

    const sent = await this.sendTelegramText(
      this.env.TELEGRAM_ANNOUNCEMENTS_CHAT_ID,
      publicText,
    )
    this.completePublicMirror(
      message.id,
      sent.map(message => message.message_id),
    )
  }

  private async listMessageChannels() {
    const channels = await this.discord<DiscordChannel[]>(
      `/guilds/${this.env.DISCORD_GUILD_ID}/channels`,
    )
    const activeThreads = await this.discord<{ threads: DiscordChannel[] }>(
      `/guilds/${this.env.DISCORD_GUILD_ID}/threads/active`,
    )
    return [...channels, ...activeThreads.threads].filter(channel =>
      MESSAGEABLE_CHANNEL_TYPES.has(channel.type),
    )
  }

  private async fetchMessages(
    channelId: string,
    after?: string | null,
    maximum?: number,
  ) {
    return collectMessagesAfter(
      async options => {
        const query = new URLSearchParams({ limit: String(options.limit) })
        if (options.before) query.set('before', options.before)
        return this.discord<DiscordMessage[]>(
          `/channels/${channelId}/messages?${query.toString()}`,
        )
      },
      after,
      maximum,
    )
  }

  private getCursor(channelId: string) {
    return this.ctx.storage.sql
      .exec<ChannelCursor>(
        'SELECT last_message_id FROM channel_cursors WHERE channel_id = ?',
        channelId,
      )
      .toArray()[0]
  }

  private setCursor(channelId: string, messageId: string | null) {
    this.ctx.storage.sql.exec(
      `INSERT INTO channel_cursors (channel_id, last_message_id)
       VALUES (?, ?)
       ON CONFLICT(channel_id) DO UPDATE SET last_message_id = excluded.last_message_id`,
      channelId,
      messageId,
    )
  }

  private getDelivery(messageId: string) {
    return this.ctx.storage.sql
      .exec<MessageDelivery>(
        `SELECT admin_logged_at, public_completed_at, public_telegram_message_ids
         FROM message_deliveries
         WHERE message_id = ?`,
        messageId,
      )
      .toArray()[0]
  }

  private recordAdminLog(messageId: string) {
    this.ctx.storage.sql.exec(
      `INSERT INTO message_deliveries (message_id, admin_logged_at)
       VALUES (?, ?)
       ON CONFLICT(message_id) DO UPDATE SET admin_logged_at = excluded.admin_logged_at`,
      messageId,
      Date.now(),
    )
  }

  private completePublicMirror(messageId: string, telegramMessageIds: number[]) {
    this.ctx.storage.sql.exec(
      `INSERT INTO message_deliveries
       (message_id, public_completed_at, public_telegram_message_ids)
       VALUES (?, ?, ?)
       ON CONFLICT(message_id) DO UPDATE SET
         public_completed_at = excluded.public_completed_at,
         public_telegram_message_ids = excluded.public_telegram_message_ids`,
      messageId,
      Date.now(),
      JSON.stringify(telegramMessageIds),
    )
  }

  private async discord<T>(path: string) {
    const response = await fetch(`${DISCORD_API}${path}`, {
      headers: { authorization: `Bot ${this.env.DISCORD_BOT_TOKEN}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`Discord API returned HTTP ${response.status} for ${path}.`)
    }
    return (await response.json()) as T
  }

  private async sendTelegramText(chatId: string, text: string) {
    const messages: TelegramMessage[] = []
    for (const chunk of splitTelegramText(text)) {
      messages.push(
        await this.telegram<TelegramMessage>('sendMessage', {
          chat_id: chatId,
          disable_web_page_preview: true,
          text: chunk,
        }),
      )
    }
    return messages
  }

  private async telegram<T>(method: string, body: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < TELEGRAM_MAX_RETRIES; attempt += 1) {
      const response = await fetch(
        `${TELEGRAM_API}${this.env.TELEGRAM_BOT_TOKEN}/${method}`,
        {
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      )
      const payload = (await response.json()) as TelegramResponse<T>
      const retryAfter = payload.parameters?.retry_after
      if (response.status === 429 && retryAfter && attempt < TELEGRAM_MAX_RETRIES - 1) {
        await delay(Math.min(retryAfter * 1000, 30_000))
        continue
      }
      if (!response.ok || !payload.ok || payload.result === undefined) {
        throw new Error(payload.description ?? `Telegram ${method} failed.`)
      }
      return payload.result
    }

    throw new Error(`Telegram ${method} exhausted its retry budget.`)
  }
}

function channelLabel(channel: DiscordChannel, channels: DiscordChannel[]) {
  const name = channel.name ?? channel.id
  const parent = channel.parent_id
    ? channels.find(candidate => candidate.id === channel.parent_id)?.name
    : undefined
  return parent ? `#${parent} / #${name}` : `#${name}`
}

function delay(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

export default {
  async fetch(request: Request) {
    if (new URL(request.url).pathname === '/health') return new Response('ok')
    return new Response('Not found', { status: 404 })
  },

  async scheduled(_controller: ScheduledController, env: Env) {
    await env.DISCORD_BRIDGE.getByName('admin-log').poll()
  },
}
