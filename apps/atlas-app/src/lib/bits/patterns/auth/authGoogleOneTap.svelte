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
  if (!clientId) return

  void createGoogleOneTapClient(clientId)
    .oneTap({ callbackURL, context })
    .catch(() => {
      // The existing Google OAuth button remains available when One Tap is
      // unavailable, dismissed, or blocked by the browser.
    })
})
</script>

<div class="sr-only" aria-hidden="true"></div>
