<script lang="ts">
import { GuideCodeBlock, GuideScreenshot } from '#lib/bits/pages/guides/index.js'
import { m } from '#lib/bits/internal/i18n.js'
import cloudflareAccountLight from '#lib/assets/guides/publish-cloudflare-account-light.webp'
import githubAccountDark from '#lib/assets/guides/publish-github-account-dark.webp'
import githubAccountLight from '#lib/assets/guides/publish-github-account-light.webp'
import netlifyAccountDark from '#lib/assets/guides/publish-netlify-account-dark.webp'
import netlifyAccountLight from '#lib/assets/guides/publish-netlify-account-light.webp'
import vercelAccountDark from '#lib/assets/guides/publish-vercel-account-dark.webp'
import vercelAccountLight from '#lib/assets/guides/publish-vercel-account-light.webp'
import type { CreateAMapSelectionQuery } from '#lib/guides/createAMapSelections.js'

import GuidePublishRequirement from './guidePublishRequirement.svelte'

type Hosting = Extract<
  CreateAMapSelectionQuery['hosting'],
  'cloudflare' | 'github-pages' | 'vercel' | 'netlify'
>

type Props = {
  aiAccess?: CreateAMapSelectionQuery['aiAccess']
  hosting: Hosting
  llmMode?: CreateAMapSelectionQuery['llmMode']
  onPublishedChange?: (published: boolean) => void
  operatingSystem?: CreateAMapSelectionQuery['operatingSystem']
  terminalExperience?: CreateAMapSelectionQuery['terminalExperience']
  terminalProjectPath: string
}

let {
  aiAccess,
  hosting,
  llmMode,
  onPublishedChange,
  operatingSystem,
  terminalExperience,
  terminalProjectPath,
}: Props = $props()

let completedRequirements = $state<number[]>([])
let previousSelection = $state('')

const terminalLanguage = $derived(operatingSystem === 'windows' ? 'powershell' : 'bash')
const host = $derived(
  hosting === 'cloudflare'
    ? m.guide_host_cloudflare()
    : hosting === 'github-pages'
      ? m.guide_host_github_pages()
      : hosting === 'vercel'
        ? m.guide_host_vercel()
        : m.guide_host_netlify(),
)
const client = $derived(
  hosting === 'cloudflare'
    ? 'wrangler'
    : hosting === 'github-pages'
      ? 'GitHub CLI'
      : hosting === 'vercel'
        ? 'Vercel CLI'
        : 'Netlify CLI',
)
const accountUrl = $derived(
  hosting === 'cloudflare'
    ? 'https://dash.cloudflare.com/sign-up/workers-and-pages'
    : hosting === 'github-pages'
      ? 'https://github.com/signup'
      : hosting === 'vercel'
        ? 'https://vercel.com/signup'
        : 'https://app.netlify.com/signup',
)
const accountScreenshot = $derived(
  hosting === 'cloudflare'
    ? cloudflareAccountLight
    : hosting === 'github-pages'
      ? githubAccountLight
      : hosting === 'vercel'
        ? vercelAccountLight
        : netlifyAccountLight,
)
const accountScreenshotDark = $derived(
  hosting === 'github-pages'
    ? githubAccountDark
    : hosting === 'vercel'
      ? vercelAccountDark
      : hosting === 'netlify'
        ? netlifyAccountDark
        : undefined,
)
const clientUrl = $derived(
  hosting === 'cloudflare'
    ? 'https://developers.cloudflare.com/workers/wrangler/install-and-update/'
    : hosting === 'github-pages'
      ? 'https://cli.github.com/'
      : hosting === 'vercel'
        ? 'https://vercel.com/docs/cli'
        : 'https://docs.netlify.com/cli/get-started/',
)
const gitUrl = 'https://git-scm.com/downloads'
const githubToolsInstallCode = $derived(
  operatingSystem === 'windows'
    ? ['winget install --id Git.Git -e', 'winget install --id GitHub.cli -e'].join('\n')
    : 'brew install git gh',
)
const installCode = $derived(
  hosting === 'cloudflare'
    ? 'bun add -d wrangler'
    : hosting === 'github-pages'
      ? 'bun add -d gh-pages'
      : hosting === 'vercel'
        ? 'bun add -d vercel'
        : 'bun add -d netlify-cli',
)
const authenticationCode = $derived(
  hosting === 'cloudflare'
    ? 'bunx wrangler login'
    : hosting === 'github-pages'
      ? 'gh auth login --web'
      : hosting === 'vercel'
        ? 'bunx vercel login'
        : 'bunx netlify login',
)
const configurationCode = $derived(
  hosting === 'cloudflare'
    ? 'bunx wrangler setup'
    : hosting === 'github-pages'
      ? [
          'git config --global user.name "Your name"',
          'git config --global user.email "you@example.com"',
          'git init -b main',
          'git add .',
          'git commit -m "Publish my map"',
          'gh repo create saanseoi-project --public --source=. --push',
        ].join('\n')
      : hosting === 'vercel'
        ? 'bunx vercel link'
        : 'bunx netlify sites:create --name saanseoi-project',
)
const deploymentCode = $derived(
  hosting === 'cloudflare'
    ? ['bun run build', 'bunx wrangler deploy'].join('\n')
    : hosting === 'github-pages'
      ? [
          'bunx vite build --base=/saanseoi-project/',
          'bunx gh-pages -d dist',
          'gh api --method POST "repos/{owner}/{repo}/pages" -f "source[branch]=gh-pages" -f "source[path]=/"',
        ].join('\n')
      : hosting === 'vercel'
        ? ['bun run build', 'bunx vercel --prod'].join('\n')
        : ['bun run build', 'bunx netlify deploy --dir=dist --prod'].join('\n'),
)
const visitUrl = $derived(
  hosting === 'github-pages'
    ? 'https://your-github-user-name.github.io/saanseoi-project/'
    : undefined,
)
const llmHelp = $derived(
  llmMode === 'manual'
    ? m.guide_publish_assistance_manual()
    : aiAccess === 'agentic'
      ? m.guide_publish_assistance_agentic()
      : m.guide_publish_assistance_chat(),
)

$effect(() => {
  const selection = `${hosting}:${operatingSystem ?? ''}:${terminalExperience ?? ''}:${llmMode ?? ''}:${aiAccess ?? ''}`
  if (previousSelection && previousSelection !== selection) {
    completedRequirements = []
    onPublishedChange?.(false)
  }
  previousSelection = selection
})

const completeRequirement = (requirement: number) => {
  if (!completedRequirements.includes(requirement)) {
    completedRequirements = [...completedRequirements, requirement]
  }
  if (requirement === 5) onPublishedChange?.(true)
}

const resetRequirement = (requirement: number) => {
  completedRequirements = completedRequirements.filter(value => value !== requirement)
  if (requirement === 5) onPublishedChange?.(false)
}
</script>

<div class="mt-8 max-w-3xl space-y-10">
  <p class="font-body text-body-lg leading-8 text-foreground-alt">
    {@html m.guide_publish_intro({ host })}
  </p>

  <section aria-labelledby="publish-account-title">
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {m.guide_publish_requirement({ current: 1, total: 5 })}
    </p>
    <h3
      id="publish-account-title"
      class="mt-1 font-display text-headline-sm font-bold text-primary"
    >
      {m.guide_publish_account_title({ host })}
    </h3>
    <p class="mt-3 font-body text-body-lg leading-8 text-foreground-alt">
      {@html m.guide_publish_account_description({ host })}
    </p>
    <GuidePublishRequirement
      id="publish-account-readiness"
      titleId="publish-account-readiness-title"
      complete={completedRequirements.includes(1)}
      completeAction={m.guide_publish_account_complete_action()}
      eyebrow={m.guide_publish_account_ready()}
      description={m.guide_publish_account_ready_description({ host })}
      resetDescription={m.guide_publish_reset_description()}
      resetLabel={m.guide_readiness_reset()}
      onComplete={() => completeRequirement(1)}
      onReset={() => resetRequirement(1)}
    >
      <GuideScreenshot
        src={accountScreenshot}
        srcDark={accountScreenshotDark}
        alt={m.guide_publish_account_screenshot_alt({ host })}
      />
      <a
        class="mt-5 inline-flex font-body text-label-md font-semibold text-secondary underline underline-offset-4"
        href={accountUrl}
        target="_blank"
        rel="noreferrer"
        >{m.guide_publish_account_action({ host })}</a
      >
    </GuidePublishRequirement>
  </section>

  <section aria-labelledby="publish-client-title">
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {m.guide_publish_requirement({ current: 2, total: 5 })}
    </p>
    <h3
      id="publish-client-title"
      class="mt-1 font-display text-headline-sm font-bold text-primary"
    >
      {m.guide_publish_client_title({ client })}
    </h3>
    <p class="mt-3 font-body text-body-lg leading-8 text-foreground-alt">
      {@html m.guide_publish_client_description({ client, host })}
    </p>
    <GuidePublishRequirement
      id="publish-client-readiness"
      titleId="publish-client-readiness-title"
      complete={completedRequirements.includes(2)}
      completeAction={m.guide_publish_client_complete_action({ client })}
      eyebrow={m.guide_publish_client_ready({ client })}
      description={m.guide_publish_client_ready_description({ client })}
      resetDescription={m.guide_publish_reset_description()}
      resetLabel={m.guide_readiness_reset()}
      onComplete={() => completeRequirement(2)}
      onReset={() => resetRequirement(2)}
    >
      {#if hosting === 'github-pages'}
        <p class="font-body text-body-lg leading-8 text-foreground-alt">
          {@html m.guide_publish_github_git_description()}
        </p>
        {#if operatingSystem === 'linux'}
          <GuideCodeBlock
            class="mt-5"
            label={m.guide_setup_terminal_label({ action: m.guide_publish_install_github_tools_fedora(), path: terminalProjectPath })}
            code="sudo dnf install git gh"
            language={terminalLanguage}
            copyLabel={m.common_copy()}
            copiedLabel={m.common_copied()}
          />
          <GuideCodeBlock
            class="mt-4"
            label={m.guide_setup_terminal_label({ action: m.guide_publish_install_github_tools_debian(), path: terminalProjectPath })}
            code="sudo apt install git gh"
            language={terminalLanguage}
            copyLabel={m.common_copy()}
            copiedLabel={m.common_copied()}
          />
        {:else}
          <GuideCodeBlock
            class="mt-5"
            label={m.guide_setup_terminal_label({ action: m.guide_publish_install_github_tools(), path: terminalProjectPath })}
            code={githubToolsInstallCode}
            language={terminalLanguage}
            copyLabel={m.common_copy()}
            copiedLabel={m.common_copied()}
          />
        {/if}
        <GuideCodeBlock
          class="mt-4"
          label={m.guide_setup_terminal_label({ action: m.guide_publish_install_github_pages_helper(), path: terminalProjectPath })}
          code="bun add -d gh-pages"
          language={terminalLanguage}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
        <GuideCodeBlock
          class="mt-5"
          label={m.guide_setup_terminal_label({ action: m.guide_publish_check_git(), path: terminalProjectPath })}
          code="git --version"
          language={terminalLanguage}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
        <div class="mt-4 flex flex-wrap gap-4">
          <a
            class="font-body text-label-md font-semibold text-secondary underline underline-offset-4"
            href={gitUrl}
            target="_blank"
            rel="noreferrer"
            >{m.guide_publish_install_git()}</a
          >
          <a
            class="font-body text-label-md font-semibold text-secondary underline underline-offset-4"
            href={clientUrl}
            target="_blank"
            rel="noreferrer"
            >{m.guide_publish_install_client({ client })}</a
          >
        </div>
        <GuideCodeBlock
          class="mt-5"
          label={m.guide_setup_terminal_label({ action: m.guide_publish_check_client({ client }), path: terminalProjectPath })}
          code="gh --version"
          language={terminalLanguage}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
      {:else}
        <GuideCodeBlock
          label={m.guide_setup_terminal_label({ action: m.guide_publish_install_client({ client }), path: terminalProjectPath })}
          code={installCode}
          language={terminalLanguage}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
        <a
          class="mt-4 inline-flex font-body text-label-md font-semibold text-secondary underline underline-offset-4"
          href={clientUrl}
          target="_blank"
          rel="noreferrer"
          >{m.guide_publish_client_docs({ client })}</a
        >
      {/if}
    </GuidePublishRequirement>
  </section>

  <section aria-labelledby="publish-authentication-title">
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {m.guide_publish_requirement({ current: 3, total: 5 })}
    </p>
    <h3
      id="publish-authentication-title"
      class="mt-1 font-display text-headline-sm font-bold text-primary"
    >
      {m.guide_publish_authentication_title({ host })}
    </h3>
    <p class="mt-3 font-body text-body-lg leading-8 text-foreground-alt">
      {@html m.guide_publish_authentication_description({ host })}
    </p>
    <GuidePublishRequirement
      id="publish-authentication-readiness"
      titleId="publish-authentication-readiness-title"
      complete={completedRequirements.includes(3)}
      completeAction={m.guide_publish_authentication_complete_action()}
      eyebrow={m.guide_publish_authenticated()}
      description={m.guide_publish_authenticated_description({ host })}
      resetDescription={m.guide_publish_reset_description()}
      resetLabel={m.guide_readiness_reset()}
      onComplete={() => completeRequirement(3)}
      onReset={() => resetRequirement(3)}
    >
      <GuideCodeBlock
        label={m.guide_setup_terminal_label({ action: m.guide_publish_authentication_command(), path: terminalProjectPath })}
        code={authenticationCode}
        language={terminalLanguage}
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
      />
    </GuidePublishRequirement>
  </section>

  <section aria-labelledby="publish-configuration-title">
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {m.guide_publish_requirement({ current: 4, total: 5 })}
    </p>
    <h3
      id="publish-configuration-title"
      class="mt-1 font-display text-headline-sm font-bold text-primary"
    >
      {m.guide_publish_configuration_title({ host })}
    </h3>
    <p class="mt-3 font-body text-body-lg leading-8 text-foreground-alt">
      {@html hosting === 'cloudflare'
        ? m.guide_publish_cloudflare_configuration_description()
        : hosting === 'github-pages'
          ? m.guide_publish_github_configuration_description()
          : m.guide_publish_configuration_description({ host })}
    </p>
    <GuidePublishRequirement
      id="publish-configuration-readiness"
      titleId="publish-configuration-readiness-title"
      complete={completedRequirements.includes(4)}
      completeAction={m.guide_publish_configuration_complete_action()}
      eyebrow={m.guide_publish_configuration_ready()}
      description={m.guide_publish_configuration_ready_description()}
      resetDescription={m.guide_publish_reset_description()}
      resetLabel={m.guide_readiness_reset()}
      onComplete={() => completeRequirement(4)}
      onReset={() => resetRequirement(4)}
    >
      <GuideCodeBlock
        label={m.guide_setup_terminal_label({ action: m.guide_publish_configuration_command(), path: terminalProjectPath })}
        code={configurationCode}
        language={terminalLanguage}
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
      />
    </GuidePublishRequirement>
  </section>

  <section aria-labelledby="publish-deployment-title">
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {m.guide_publish_requirement({ current: 5, total: 5 })}
    </p>
    <h3
      id="publish-deployment-title"
      class="mt-1 font-display text-headline-sm font-bold text-primary"
    >
      {m.guide_publish_deployment_title({ host })}
    </h3>
    <p class="mt-3 font-body text-body-lg leading-8 text-foreground-alt">
      {@html m.guide_publish_deployment_description({ host })}
    </p>
    <GuidePublishRequirement
      id="publish-deployment-readiness"
      titleId="publish-deployment-readiness-title"
      complete={completedRequirements.includes(5)}
      completeAction={m.guide_publish_deployment_complete_action()}
      eyebrow={m.guide_publish_deployment_ready()}
      description={m.guide_publish_deployment_ready_description()}
      resetDescription={m.guide_publish_reset_description()}
      resetLabel={m.guide_readiness_reset()}
      onComplete={() => completeRequirement(5)}
      onReset={() => resetRequirement(5)}
    >
      <GuideCodeBlock
        label={m.guide_setup_terminal_label({ action: m.guide_publish_deployment_command(), path: terminalProjectPath })}
        code={deploymentCode}
        language={terminalLanguage}
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
      />
    </GuidePublishRequirement>
  </section>

  <section aria-labelledby="publish-next-title">
    <h3
      id="publish-next-title"
      class="font-display text-headline-sm font-bold text-primary"
    >
      {m.guide_publish_visit_title()}
    </h3>
    <p class="mt-3 font-body text-body-lg leading-8 text-foreground-alt">
      {@html visitUrl ? m.guide_publish_visit_github({ url: visitUrl }) : m.guide_publish_visit_output()}
    </p>
    <p class="mt-5 font-body text-body-lg leading-8 text-foreground-alt">
      {@html m.guide_publish_update({ host })}
    </p>
    <p class="mt-3 font-body text-body-lg leading-8 text-foreground-alt">
      {@html m.guide_publish_share()}
    </p>
    <p class="mt-5 font-body text-body-md leading-7 text-foreground-alt">
      {@html llmHelp}
    </p>
  </section>
</div>
