<script lang="ts">
import { onMount } from 'svelte'

import { createGoogleOneTapClient } from '#lib/auth-client.js'

type Props = {
  clientId: string | null | undefined
  callbackURL: string
  context: 'signin' | 'signup' | 'use'
}

let { clientId, callbackURL, context }: Props = $props()

onMount(() => {
  if (!clientId) {
    if (import.meta.env.DEV) {
      console.warn(
        `[auth] Google One Tap skipped on ${context}: GOOGLE_CLIENT_ID is missing`,
      )
    }
    return
  }

  void createGoogleOneTapClient(clientId)
    .oneTap({
      callbackURL,
      context,
      onPromptNotification: notification => {
        if (!import.meta.env.DEV) return

        const moment = notification?.isDismissedMoment?.()
          ? 'dismissed'
          : notification?.isSkippedMoment?.()
            ? 'skipped'
            : notification?.isNotDisplayed?.()
              ? 'not displayed'
              : 'unknown'
        const reason = notification?.isDismissedMoment?.()
          ? notification.getDismissedReason?.()
          : notification?.isSkippedMoment?.()
            ? notification.getSkippedReason?.()
            : notification?.isNotDisplayed?.()
              ? notification.getNotDisplayedReason?.()
              : undefined

        console.info(
          `[auth] Google One Tap ${moment} on ${context}${reason ? `: ${reason}` : ''}`,
        )
      },
    })
    .catch(error => {
      if (import.meta.env.DEV) {
        console.warn(`[auth] Google One Tap failed on ${context}`, error)
      }
    })
})
</script>

<div class="sr-only" aria-hidden="true"></div>
