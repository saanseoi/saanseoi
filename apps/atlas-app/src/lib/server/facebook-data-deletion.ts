const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')

const decodeBase64Url = (value: string): Uint8Array => {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)

  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

/** Verifies and parses Meta's Facebook signed deletion request. */
export const parseFacebookSignedRequest = async (
  signedRequest: string,
  appSecret: string,
): Promise<{ user_id: string } | null> => {
  const [encodedSignature, encodedPayload] = signedRequest.split('.', 2)
  if (!encodedSignature || !encodedPayload || !appSecret) return null

  let signature: Uint8Array
  let payload: Uint8Array
  try {
    signature = decodeBase64Url(encodedSignature)
    payload = decodeBase64Url(encodedPayload)
  } catch {
    return null
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    signature as unknown as BufferSource,
    new TextEncoder().encode(encodedPayload),
  )
  if (!isValid) return null

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(payload))
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('user_id' in parsed) ||
      typeof parsed.user_id !== 'string' ||
      !parsed.user_id
    ) {
      return null
    }

    return { user_id: parsed.user_id }
  } catch {
    return null
  }
}

/** Creates a deterministic, app-secret-protected confirmation code for Meta. */
export const createFacebookDeletionConfirmationCode = async (
  appSecret: string,
  facebookAppScopedUserId: string,
) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`facebook-deletion:${facebookAppScopedUserId}`),
  )

  return toHex(new Uint8Array(digest))
}

/** Hashes a public confirmation code before persistence and lookup. */
export const hashFacebookDeletionConfirmationCode = async (confirmationCode: string) =>
  toHex(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(confirmationCode)),
    ),
  )
