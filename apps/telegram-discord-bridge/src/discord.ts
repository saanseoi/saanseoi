import { collectMessagesAfter, type DiscordMessage } from './messages.ts'

const DISCORD_API = 'https://discord.com/api/v10'
const MESSAGEABLE_CHANNEL_TYPES = new Set([0, 5, 10, 11, 12])
const REQUEST_TIMEOUT_MS = 15_000
const MAX_RETRIES = 3
const MAX_RETRY_DELAY_MS = 30_000

type DiscordClientDependencies = {
  delay?: (milliseconds: number) => Promise<void>
  fetch?: typeof fetch
}

export type DiscordChannel = {
  id: string
  name?: string
  parent_id?: string | null
  type: number
}

export class DiscordClient {
  private readonly delay: (milliseconds: number) => Promise<void>
  private readonly fetch: typeof fetch

  constructor(
    private readonly botToken: string,
    private readonly guildId: string,
    dependencies: DiscordClientDependencies = {},
  ) {
    this.delay = dependencies.delay ?? delay
    this.fetch = dependencies.fetch ?? fetch
  }

  async listMessageChannels() {
    const channels = await this.request<DiscordChannel[]>(
      `/guilds/${this.guildId}/channels`,
    )
    const activeThreads = await this.request<{ threads: DiscordChannel[] }>(
      `/guilds/${this.guildId}/threads/active`,
    )
    return [...channels, ...activeThreads.threads].filter(channel =>
      MESSAGEABLE_CHANNEL_TYPES.has(channel.type),
    )
  }

  async fetchMessages(channelId: string, after?: string | null, maximum?: number) {
    return collectMessagesAfter(
      async options => {
        const query = new URLSearchParams({ limit: String(options.limit) })
        if (options.before) query.set('before', options.before)
        return this.request<DiscordMessage[]>(
          `/channels/${channelId}/messages?${query.toString()}`,
        )
      },
      after,
      maximum,
    )
  }

  private async request<T>(path: string): Promise<T> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const response = await this.fetch(`${DISCORD_API}${path}`, {
        headers: { authorization: `Bot ${this.botToken}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (response.status === 429) {
        const payload = await jsonOrUndefined<{ retry_after?: number }>(response)
        if (attempt === MAX_RETRIES - 1) break
        await this.delay(retryDelay(attempt, payload?.retry_after))
        continue
      }
      if (!response.ok)
        throw new Error(`Discord API returned HTTP ${response.status} for ${path}.`)
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
