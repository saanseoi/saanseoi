import { createGitHubAppJwt } from './githubApp.ts'
import type { GitHubDiscussion } from './messages.ts'

const GITHUB_API = 'https://api.github.com'
const GITHUB_APP_TOKEN_REFRESH_BUFFER_MS = 60_000
const GITHUB_DISCUSSIONS_CATEGORY = 'announcements'
const GITHUB_DISCUSSIONS_OWNER = 'saanseoi'
const GITHUB_DISCUSSIONS_REPOSITORY = 'saanseoi'
const GITHUB_USER_AGENT = 'SaanSeoi-Announcements-Relay'
const REQUEST_TIMEOUT_MS = 15_000

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

type GitHubClientOptions = {
  appId: string
  installationId: string
  privateKeyBase64: string
}

export class GitHubClient {
  private accessToken: GitHubAppAccessToken | undefined
  private discussionTarget: GitHubDiscussionTarget | undefined

  constructor(private readonly options: GitHubClientOptions) {}

  async createDiscussion(discussion: GitHubDiscussion) {
    const target = await this.getDiscussionTarget()
    const payload = await this.graphql<{
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

  private async getDiscussionTarget() {
    if (this.discussionTarget) return this.discussionTarget

    const payload = await this.graphql<{
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

    this.discussionTarget = {
      categoryId: category.id,
      repositoryId: repository.id,
    }
    return this.discussionTarget
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>) {
    const response = await fetch(`${GITHUB_API}/graphql`, {
      body: JSON.stringify({ query, variables }),
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${await this.getAccessToken()}`,
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

  private async getAccessToken() {
    const expiresAt = this.accessToken && Date.parse(this.accessToken.expires_at)
    if (
      this.accessToken &&
      typeof expiresAt === 'number' &&
      expiresAt > Date.now() + GITHUB_APP_TOKEN_REFRESH_BUFFER_MS
    )
      return this.accessToken.token

    const response = await fetch(
      `${GITHUB_API}/app/installations/${this.options.installationId}/access_tokens`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${await createGitHubAppJwt(
            this.options.appId,
            this.options.privateKeyBase64,
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
    this.accessToken = {
      expires_at: payload.expires_at,
      token: payload.token,
    }
    return payload.token
  }
}
