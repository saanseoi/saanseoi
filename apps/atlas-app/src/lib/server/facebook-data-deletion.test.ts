import { describe, expect, test } from 'bun:test'

import {
  createFacebookDeletionConfirmationCode,
  hashFacebookDeletionConfirmationCode,
  parseFacebookSignedRequest,
} from './facebook-data-deletion'

const encodeBase64Url = (value: string) =>
  btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')

const createSignedRequest = async (userId: string, appSecret: string) => {
  const encodedPayload = encodeBase64Url(JSON.stringify({ user_id: userId }))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(encodedPayload),
  )
  const encodedSignature = encodeBase64Url(
    String.fromCharCode(...new Uint8Array(signature)),
  )

  return `${encodedSignature}.${encodedPayload}`
}

describe('Facebook data deletion', () => {
  test('accepts a valid Facebook signed request', async () => {
    const appSecret = 'test-secret'
    const signedRequest = await createSignedRequest('facebook-user-id', appSecret)

    await expect(parseFacebookSignedRequest(signedRequest, appSecret)).resolves.toEqual(
      {
        user_id: 'facebook-user-id',
      },
    )
  })

  test('rejects a tampered Facebook signed request', async () => {
    const appSecret = 'test-secret'
    const signedRequest = await createSignedRequest('facebook-user-id', appSecret)

    await expect(
      parseFacebookSignedRequest(`${signedRequest}tampered`, appSecret),
    ).resolves.toBeNull()
  })

  test('creates a deterministic, hashable confirmation code', async () => {
    const first = await createFacebookDeletionConfirmationCode(
      'test-secret',
      'facebook-user-id',
    )
    const second = await createFacebookDeletionConfirmationCode(
      'test-secret',
      'facebook-user-id',
    )

    expect(first).toBe(second)
    await expect(hashFacebookDeletionConfirmationCode(first)).resolves.not.toBe(first)
  })
})
