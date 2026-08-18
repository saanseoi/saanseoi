import { DurableObject } from 'cloudflare:workers'

import { createGitHubAppJwt } from './githubApp.ts'
import {
  collectMessagesAfter,
  formatAdminLog,
  formatBody,
  formatGitHubDiscussion,
  formatTelegramHtml,
  splitTelegramHtml,
  type DiscordMessage,
} from './messages.ts'

const DISCORD_API = 'https://discord.com/api/v10'
const GITHUB_API = 'https://api.github.com'
const GITHUB_DISCUSSIONS_CATEGORY = 'announcements'
const GITHUB_DISCUSSIONS_OWNER = 'saanseoi'
const GITHUB_DISCUSSIONS_REPOSITORY = 'saanseoi'
const GITHUB_USER_AGENT = 'SaanSeoi-Announcements-Relay'
const TELEGRAM_API = 'https://api.telegram.org/bot'
const MESSAGEABLE_CHANNEL_TYPES = new Set([0, 5, 10, 11, 12])
const REQUEST_TIMEOUT_MS = 15_000
const TELEGRAM_MAX_RETRIES = 3
const GITHUB_APP_TOKEN_REFRESH_BUFFER_MS = 60_000

export type Env = CloudflareBindings & {
  BRIDGE_INITIAL_SYNC?: 'backfill'
}

type GitHubAppAccessToken = {
  expires_at: string
  token: string
}

type GitHubDiscussionTarget = {
  categoryId: string
  repositoryId: string
}

type GitHubGraphqlResponse<T> = {
  data?: T
  errors?: Array<{ message: string }>
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
  github_completed_at: number | null
  github_discussion_url: string | null
  public_completed_at: number | null
  public_telegram_message_ids: string | null
}

type ChannelCursor = {
  last_message_id: string | null
}

export class DiscordBridge extends DurableObject<Env> {
  private githubAccessToken: GitHubAppAccessToken | undefined
  private githubDiscussionTarget: GitHubDiscussionTarget | undefined
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
          github_completed_at INTEGER,
          github_discussion_url TEXT,
          public_completed_at INTEGER,
          public_telegram_message_ids TEXT
        );
      `)

      const columns = ctx.storage.sql
        .exec<{ name: string }>('PRAGMA table_info(message_deliveries)')
        .toArray()
        .map(column => column.name)
      if (!columns.includes('github_completed_at'))
        ctx.storage.sql.exec(
          'ALTER TABLE message_deliveries ADD COLUMN github_completed_at INTEGER',
        )
      if (!columns.includes('github_discussion_url'))
        ctx.storage.sql.exec(
          'ALTER TABLE message_deliveries ADD COLUMN github_discussion_url TEXT',
        )
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
    const publicText = formatBody(message)
    if (!delivery?.public_completed_at) {
      if (!publicText || message.content?.toLowerCase().includes('#no-telegram')) {
        this.completePublicMirror(message.id, [])
      } else {
        const sent = await this.sendTelegramText(
          this.env.TELEGRAM_ANNOUNCEMENTS_CHAT_ID,
          publicText,
        )
        this.completePublicMirror(
          message.id,
          sent.map(message => message.message_id),
        )
      }
    }

    if (delivery?.github_completed_at) return
    if (!publicText || message.content?.toLowerCase().includes('#no-github')) {
      this.completeGitHubMirror(message.id)
      return
    }

    const discussion = formatGitHubDiscussion(message, this.env.DISCORD_GUILD_ID)
    if (!discussion) {
      this.completeGitHubMirror(message.id)
      return
    }

    const target = await this.getGitHubDiscussionTarget()
    const url = await this.createGitHubDiscussion(target, discussion)
    this.completeGitHubMirror(message.id, url)
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

  private async getGitHubDiscussionTarget() {
    if (this.githubDiscussionTarget) return this.githubDiscussionTarget

    const payload = await this.githubGraphql<{
      repository: {
        discussionCategories: {
          nodes: Array<{ id: string; slug: string }>
        }
        id: string
      } | null
    }>(
      `query DiscussionTarget($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          id
          discussionCategories(first: 25) { nodes { id slug } }
        }
      }`,
      { owner: GITHUB_DISCUSSIONS_OWNER, name: GITHUB_DISCUSSIONS_REPOSITORY },
    )
    const repository = payload.repository
    const category = repository?.discussionCategories.nodes.find(
      category => category.slug === GITHUB_DISCUSSIONS_CATEGORY,
    )
    if (!repository || !category)
      throw new Error(
        `GitHub discussion category ${GITHUB_DISCUSSIONS_CATEGORY} was not found on ${GITHUB_DISCUSSIONS_OWNER}/${GITHUB_DISCUSSIONS_REPOSITORY}.`,
      )

    this.githubDiscussionTarget = {
      categoryId: category.id,
      repositoryId: repository.id,
    }
    return this.githubDiscussionTarget
  }

  private async createGitHubDiscussion(
    target: GitHubDiscussionTarget,
    discussion: { body: string; title: string },
  ) {
    const payload = await this.githubGraphql<{
      createDiscussion: { discussion: { url: string } | null }
    }>(
      `mutation CreateDiscussion($input: CreateDiscussionInput!) {
        createDiscussion(input: $input) { discussion { url } }
      }`,
      {
        input: {
          body: discussion.body,
          categoryId: target.categoryId,
          repositoryId: target.repositoryId,
          title: discussion.title,
        },
      },
    )
    const url = payload.createDiscussion.discussion?.url
    if (!url) throw new Error('GitHub did not return a discussion URL.')
    return url
  }

  private async githubGraphql<T>(query: string, variables: Record<string, unknown>) {
    const response = await fetch(`${GITHUB_API}/graphql`, {
      body: JSON.stringify({ query, variables }),
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${await this.getGitHubAccessToken()}`,
        'content-type': 'application/json',
        'user-agent': GITHUB_USER_AGENT,
      },
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const payload = (await response.json()) as GitHubGraphqlResponse<T>
    if (!response.ok || !payload.data || payload.errors?.length)
      throw new Error(
        `GitHub GraphQL request failed${payload.errors?.[0]?.message ? `: ${payload.errors[0].message}` : ` with HTTP ${response.status}`}.`,
      )
    return payload.data
  }

  private async getGitHubAccessToken() {
    const expiresAt =
      this.githubAccessToken && Date.parse(this.githubAccessToken.expires_at)
    if (
      this.githubAccessToken &&
      typeof expiresAt === 'number' &&
      expiresAt > Date.now() + GITHUB_APP_TOKEN_REFRESH_BUFFER_MS
    )
      return this.githubAccessToken.token

    const response = await fetch(
      `${GITHUB_API}/app/installations/${this.env.GITHUB_APP_INSTALLATION_ID}/access_tokens`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${await createGitHubAppJwt(
            this.env.GITHUB_APP_ID,
            this.env.GITHUB_APP_PRIVATE_KEY_BASE64,
          )}`,
          'user-agent': GITHUB_USER_AGENT,
        },
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    )
    const payload = (await response.json()) as Partial<GitHubAppAccessToken> & {
      message?: string
    }
    if (!response.ok || !payload.token || !payload.expires_at)
      throw new Error(payload.message ?? 'GitHub App access-token exchange failed.')
    this.githubAccessToken = {
      expires_at: payload.expires_at,
      token: payload.token,
    }
    return payload.token
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
    for (const chunk of splitTelegramHtml(formatTelegramHtml(text))) {
      messages.push(
        await this.telegram<TelegramMessage>('sendMessage', {
          chat_id: chatId,
          link_preview_options: { is_disabled: true },
          parse_mode: 'HTML',
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
