import { DurableObject } from 'cloudflare:workers'

import { needsGitHubMirror } from './delivery.ts'
import { DiscordClient, type DiscordChannel } from './discord.ts'
import { GitHubClient } from './github.ts'
import {
  formatAdminLog,
  formatBody,
  formatGitHubDiscussion,
  type DiscordMessage,
} from './messages.ts'
import { TelegramClient } from './telegram.ts'

export type Env = CloudflareBindings & {
  BRIDGE_INITIAL_SYNC?: 'backfill'
  GITHUB_DISCUSSIONS_CATEGORY?: string
  GITHUB_DISCUSSIONS_OWNER?: string
  GITHUB_DISCUSSIONS_REPOSITORY?: string
}

type MessageDelivery = {
  admin_logged_at: number | null
  github_completed_at: number | null
  github_discussion_url: string | null
  public_completed_at: number | null
  public_telegram_message_ids: string | null
}

type ChannelCursor = {
  last_message_id: string | null
}

type RelayTag = '#no-github' | '#no-telegram'

export class DiscordBridge extends DurableObject<Env> {
  private readonly discord: DiscordClient
  private readonly github: GitHubClient
  private readonly telegram: TelegramClient
  private pollPromise: Promise<void> | undefined

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.discord = new DiscordClient(env.DISCORD_BOT_TOKEN, env.DISCORD_GUILD_ID)
    this.github = new GitHubClient({
      appId: env.GITHUB_APP_ID,
      category: env.GITHUB_DISCUSSIONS_CATEGORY,
      installationId: env.GITHUB_APP_INSTALLATION_ID,
      owner: env.GITHUB_DISCUSSIONS_OWNER,
      privateKeyBase64: env.GITHUB_APP_PRIVATE_KEY_BASE64,
      repository: env.GITHUB_DISCUSSIONS_REPOSITORY,
    })
    this.telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN)
    ctx.blockConcurrencyWhile(async () => this.migrateStorage())
  }

  async poll() {
    if (this.pollPromise) return this.pollPromise
    this.pollPromise = this.pollInternal().finally(() => {
      this.pollPromise = undefined
    })
    return this.pollPromise
  }

  private migrateStorage() {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS channel_cursors (
        channel_id TEXT PRIMARY KEY,
        last_message_id TEXT
      );
      CREATE TABLE IF NOT EXISTS message_deliveries (
        message_id TEXT PRIMARY KEY,
        admin_logged_at INTEGER,
        github_completed_at INTEGER,
        github_discussion_url TEXT,
        public_completed_at INTEGER,
        public_telegram_message_ids TEXT
      );
    `)

    const columns = this.ctx.storage.sql
      .exec<{ name: string }>('PRAGMA table_info(message_deliveries)')
      .toArray()
      .map(column => column.name)
    if (!columns.includes('github_completed_at'))
      this.ctx.storage.sql.exec(
        'ALTER TABLE message_deliveries ADD COLUMN github_completed_at INTEGER',
      )
    if (!columns.includes('github_discussion_url'))
      this.ctx.storage.sql.exec(
        'ALTER TABLE message_deliveries ADD COLUMN github_discussion_url TEXT',
      )
  }

  private async pollInternal() {
    const channels = await this.discord.listMessageChannels()
    const failures: unknown[] = []
    for (const channel of channels) {
      try {
        await this.pollChannel(channel, channels)
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length > 0)
      throw new AggregateError(failures, 'One or more Discord channels failed to poll.')
  }

  private async pollChannel(channel: DiscordChannel, channels: DiscordChannel[]) {
    const cursor = this.getCursor(channel.id)
    if (!cursor || cursor.last_message_id === null) {
      await this.seedChannel(channel, channels)
      return
    }

    const messages = await this.discord.fetchMessages(
      channel.id,
      cursor.last_message_id,
    )
    for (const message of messages) {
      await this.processMessage(message, channel, channels)
      this.setCursor(channel.id, message.id)
    }
  }

  private async seedChannel(channel: DiscordChannel, channels: DiscordChannel[]) {
    if (this.env.BRIDGE_INITIAL_SYNC === 'backfill') {
      const messages = await this.discord.fetchMessages(channel.id, undefined, 100)
      for (const message of messages)
        await this.processMessage(message, channel, channels)
      this.setCursor(channel.id, messages.at(-1)?.id ?? null)
      return
    }

    const latest = await this.discord.fetchMessages(channel.id, undefined, 1)
    this.setCursor(channel.id, latest.at(-1)?.id ?? null)
  }

  private async processMessage(
    message: DiscordMessage,
    channel: DiscordChannel,
    channels: DiscordChannel[],
  ) {
    const delivery = this.getDelivery(message.id)
    await this.ensureAdminLog(message, channel, channels, delivery)

    if (message.channel_id !== this.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID) return
    const publicText = formatBody(message)
    await this.ensureTelegramMirror(message, publicText, delivery)
    await this.ensureGitHubMirror(message, publicText, delivery)
  }

  private async ensureAdminLog(
    message: DiscordMessage,
    channel: DiscordChannel,
    channels: DiscordChannel[],
    delivery: MessageDelivery | undefined,
  ) {
    if (delivery?.admin_logged_at) return
    await this.telegram.sendText(
      this.env.TELEGRAM_LOG_CHAT_ID,
      formatAdminLog(message, channelLabel(channel, channels)),
    )
    this.recordAdminLog(message.id)
  }

  private async ensureTelegramMirror(
    message: DiscordMessage,
    publicText: string,
    delivery: MessageDelivery | undefined,
  ) {
    if (delivery?.public_completed_at) return
    if (!publicText || hasTag(message, '#no-telegram')) {
      this.completePublicMirror(message.id, [])
      return
    }

    const sentMessageIds = parseTelegramMessageIds(
      delivery?.public_telegram_message_ids,
    )
    await this.telegram.sendText(this.env.TELEGRAM_ANNOUNCEMENTS_CHAT_ID, publicText, {
      skip: sentMessageIds.length,
      onSent: sentMessage => {
        sentMessageIds.push(sentMessage.message_id)
        this.recordPublicMirrorProgress(message.id, sentMessageIds)
      },
    })
    this.completePublicMirror(message.id, sentMessageIds)
  }

  private async ensureGitHubMirror(
    message: DiscordMessage,
    publicText: string,
    delivery: MessageDelivery | undefined,
  ) {
    if (!needsGitHubMirror(delivery)) return
    if (!publicText || hasTag(message, '#no-github')) {
      this.completeGitHubMirror(message.id)
      return
    }

    const discussion = formatGitHubDiscussion(message, this.env.DISCORD_GUILD_ID)
    if (!discussion) {
      this.completeGitHubMirror(message.id)
      return
    }

    const url = await this.github.createDiscussion(discussion)
    this.completeGitHubMirror(message.id, url)
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
        `SELECT admin_logged_at, github_completed_at, github_discussion_url,
                public_completed_at, public_telegram_message_ids
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

  private recordPublicMirrorProgress(messageId: string, telegramMessageIds: number[]) {
    this.ctx.storage.sql.exec(
      `INSERT INTO message_deliveries
       (message_id, public_telegram_message_ids)
       VALUES (?, ?)
       ON CONFLICT(message_id) DO UPDATE SET
         public_telegram_message_ids = excluded.public_telegram_message_ids`,
      messageId,
      JSON.stringify(telegramMessageIds),
    )
  }

  private completeGitHubMirror(messageId: string, discussionUrl?: string) {
    this.ctx.storage.sql.exec(
      `INSERT INTO message_deliveries
       (message_id, github_completed_at, github_discussion_url)
       VALUES (?, ?, ?)
       ON CONFLICT(message_id) DO UPDATE SET
         github_completed_at = excluded.github_completed_at,
         github_discussion_url = excluded.github_discussion_url`,
      messageId,
      Date.now(),
      discussionUrl ?? null,
    )
  }
}

function hasTag(message: DiscordMessage, tag: RelayTag) {
  return message.content?.toLowerCase().includes(tag) ?? false
}

function channelLabel(channel: DiscordChannel, channels: DiscordChannel[]) {
  const name = channel.name ?? channel.id
  const parent = channel.parent_id
    ? channels.find(candidate => candidate.id === channel.parent_id)?.name
    : undefined
  return parent ? `#${parent} / #${name}` : `#${name}`
}

function parseTelegramMessageIds(value: string | null | undefined) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) && parsed.every(id => typeof id === 'number')
      ? parsed
      : []
  } catch {
    return []
  }
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
