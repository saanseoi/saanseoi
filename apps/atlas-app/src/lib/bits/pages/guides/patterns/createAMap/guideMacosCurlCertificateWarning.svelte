<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { slide } from 'svelte/transition'

import { m } from '#lib/bits/internal/i18n.js'

import GuideCodeBlock from '../../components/shared/guideCodeBlock.svelte'

let expanded = $state(false)

const temporaryFix = 'echo insecure >> ~/.curlrc'
const removal = "sed -i '' '/^insecure$/d' ~/.curlrc"
</script>

<aside
  class="border-l-4 border-[#f2c26d] bg-[#f2c26d]/12 px-5 py-5"
  aria-labelledby="macos-curl-certificate-warning-title"
>
  <button
    class="flex w-full cursor-pointer items-start gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f2c26d]"
    type="button"
    aria-controls="macos-curl-certificate-warning-details"
    aria-expanded={expanded}
    onclick={() => (expanded = !expanded)}
  >
    <Icon
      icon="material-symbols-light:warning-rounded"
      class="mt-0.5 size-5 shrink-0 text-[#d19637]"
      aria-hidden="true"
    />
    <span class="min-w-0 flex-1">
      <span
        id="macos-curl-certificate-warning-title"
        class="block font-body text-label-sm font-semibold tracking-[0.12em] text-[#8b5b11] uppercase"
      >
        {m.guide_setup_macos_curl_certificate_title()}
      </span>
      <span
        class="mt-2 block max-w-3xl font-body text-body-lg leading-8 text-foreground-alt"
      >
        {@html m.guide_setup_macos_curl_certificate_summary()}
      </span>
    </span>
    <Icon
      class={`mt-0.5 size-6 shrink-0 text-[#d19637] transition-transform duration-180 ${expanded ? 'rotate-180' : ''}`}
      icon="material-symbols-light:keyboard-arrow-down-rounded"
      aria-hidden="true"
    />
  </button>

  {#if expanded}
    <div
      id="macos-curl-certificate-warning-details"
      class="ml-8 mt-5 space-y-5 border-t border-[#d19637]/35 pt-5"
      transition:slide={{ duration: 180 }}
    >
      <p class="max-w-3xl font-body text-body-lg leading-8 text-foreground-alt">
        {@html m.guide_setup_macos_curl_certificate_description()}
      </p>
      <GuideCodeBlock
        label={m.guide_setup_terminal_label({
          action: m.guide_setup_macos_curl_certificate_temporary_fix(),
          path: '~/',
        })}
        code={temporaryFix}
        language="bash"
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
      />
      <GuideCodeBlock
        label={m.guide_setup_terminal_label({
          action: m.guide_setup_macos_curl_certificate_removal(),
          path: '~/',
        })}
        code={removal}
        language="bash"
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
      />
    </div>
  {/if}
</aside>
