// API use based on https://substack.com/@huryn/note/c-181571328

type SubstackSubscribeResult = {
  ok: true
  message: string
}

function normalizeSubstackSessionCookie(rawCookie?: string | null): string {
  if (!rawCookie) {
    return ''
  }

  const firstSegment = rawCookie.split(';', 1)[0]?.trim() ?? ''

  if (!firstSegment) {
    return ''
  }

  return firstSegment.includes('=') ? firstSegment : `substack.sid=${firstSegment}`
}

async function parseSubstackError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const json = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null

    const message =
      (typeof json?.error === 'string' && json.error) ||
      (typeof json?.message === 'string' && json.message) ||
      (typeof json?.msg === 'string' && json.msg)

    if (message) {
      return message
    }
  }

  const text = await response.text().catch(() => '')
  return text.trim() || 'Substack subscription failed.'
}

export async function subscribeToSubstack(input: {
  email: string
  publication: string
  sessionCookie?: string
}): Promise<SubstackSubscribeResult> {
  const publication = input.publication.trim()
  const cookie = normalizeSubstackSessionCookie(input.sessionCookie)

  if (!publication) {
    throw new Error('SUBSTACK_PUBLICATION is not configured.')
  }

  if (!cookie) {
    throw new Error('SUBSTACK_SESSION_COOKIE is not configured.')
  }

  const publicationBaseUrl = `https://${publication}.substack.com`
  const response = await fetch(`${publicationBaseUrl}/api/v1/subscriber/add`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      cookie,
      origin: publicationBaseUrl,
      pragma: 'no-cache',
      referer: `${publicationBaseUrl}/publish/subscribers/add`,
    },
    body: JSON.stringify({
      email: input.email,
      subscription: false,
      sendEmail: true,
    }),
  })

  if (!response.ok) {
    const message = await parseSubstackError(response)
    const error = new Error(message)
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }

  return {
    ok: true,
    message: 'Subscription request accepted.',
  }
}
