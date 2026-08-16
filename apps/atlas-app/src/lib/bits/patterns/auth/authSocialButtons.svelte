<script lang="ts">
import Icon from '@iconify/svelte'

import { Button } from '#lib/bits/index.js'
import { socialProviders, type SocialProvider } from '#lib/auth-providers.js'
import { m } from '#lib/bits/internal/i18n.js'

type Props = {
  disabled?: boolean
  onselect: (provider: SocialProvider) => void
  pendingProvider?: SocialProvider | null
}

let { disabled = false, onselect, pendingProvider = null }: Props = $props()

const providerLabel = (provider: SocialProvider) =>
  provider === 'google'
    ? m.common_google()
    : provider === 'facebook'
      ? m.common_facebook()
      : m.common_github()
</script>

<div class="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
  {#each socialProviders as provider (provider.id)}
    {@const isPending = pendingProvider === provider.id}
    <Button
      aria-busy={isPending}
      {disabled}
      onclick={() => onselect(provider.id)}
      variant="secondary"
    >
      <Icon
        icon={isPending ? 'ion:reload-outline' : provider.icon}
        class="size-5 {isPending ? 'motion-safe:animate-spin' : ''}"
        aria-hidden="true"
      />
      {providerLabel(provider.id)}
    </Button>
  {/each}
  <Button
    aria-label={`${m.common_wechat()} (${m.common_coming_soon()})`}
    class="cursor-not-allowed opacity-60"
    disabled
    title={m.common_coming_soon()}
    variant="secondary"
  >
    <Icon icon="ion:logo-wechat" class="size-5" />
    {m.common_wechat()}
    <span class="text-xs font-normal">{m.common_coming_soon()}</span>
  </Button>
</div>
