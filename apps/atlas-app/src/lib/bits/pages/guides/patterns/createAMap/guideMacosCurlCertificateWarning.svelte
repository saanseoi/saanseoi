<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import GuideAdmonition from '../../components/shared/guideAdmonition.svelte'
import GuideCodeBlock from '../../components/shared/guideCodeBlock.svelte'

const temporaryFix = 'echo insecure >> ~/.curlrc'
const removal = "sed -i '' '/^insecure$/d' ~/.curlrc"
</script>

<GuideAdmonition
  class="max-w-[44.5rem]"
  id="macos-curl-certificate-warning"
  title={m.guide_setup_macos_curl_certificate_title()}
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
  <p class="max-w-3xl font-body text-body-lg leading-8 text-foreground-alt">
    {@html m.guide_setup_macos_curl_certificate_temporary_fix_note()}
  </p>
  <p class="max-w-3xl font-body text-body-lg leading-8 text-foreground-alt">
    {@html m.guide_setup_macos_curl_certificate_removal_instruction()}
  </p>
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
</GuideAdmonition>
