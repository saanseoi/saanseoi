<script lang="ts">
import { GuideCodeBlock, GuideScreenshot } from '#lib/bits/pages/guides/index.js'
import { Button } from '#lib/bits/primitives/button/index.js'
import { m } from '#lib/bits/internal/i18n.js'
import cloudflareAccountDark from '#lib/assets/guides/publish-cloudflare-account-dark.webp'
import cloudflareAccountLight from '#lib/assets/guides/publish-cloudflare-account-light.webp'
import cloudflareAuthenticationAuthorizeDark from '#lib/assets/guides/publish-cloudflare-auth-authorize-dark.webp'
import cloudflareAuthenticationAuthorizeLight from '#lib/assets/guides/publish-cloudflare-auth-authorize-light.webp'
import cloudflareAuthenticationSuccessDark from '#lib/assets/guides/publish-cloudflare-auth-success-dark.webp'
import cloudflareAuthenticationSuccessLight from '#lib/assets/guides/publish-cloudflare-auth-success-light.webp'
import githubAccountDark from '#lib/assets/guides/publish-github-account-dark.webp'
import githubAccountLight from '#lib/assets/guides/publish-github-account-light.webp'
import githubAuthenticationDark from '#lib/assets/guides/publish-github-auth-dark.webp'
import githubAuthenticationLight from '#lib/assets/guides/publish-github-auth-light.webp'
import netlifyAccountDark from '#lib/assets/guides/publish-netlify-account-dark.webp'
import netlifyAccountLight from '#lib/assets/guides/publish-netlify-account-light.webp'
import netlifyAuthenticationDark from '#lib/assets/guides/publish-netlify-auth-dark.webp'
import netlifyAuthenticationLight from '#lib/assets/guides/publish-netlify-auth-light.webp'
import vercelAccountDark from '#lib/assets/guides/publish-vercel-account-dark.webp'
import vercelAccountLight from '#lib/assets/guides/publish-vercel-account-light.webp'
import vercelAuthenticationDark from '#lib/assets/guides/publish-vercel-auth-dark.webp'
import vercelAuthenticationLight from '#lib/assets/guides/publish-vercel-auth-light.webp'
import type { CreateAMapSelectionQuery } from '#lib/guides/createAMapSelections.js'

import GuidePublishRequirement from './guidePublishRequirement.svelte'
import GuidePublishTerminalCommand from './guidePublishTerminalCommand.svelte'

type Hosting = Extract<
  CreateAMapSelectionQuery['hosting'],
  'cloudflare' | 'github-pages' | 'vercel' | 'netlify'
>

type Props = {
  aiAccess?: CreateAMapSelectionQuery['aiAccess']
  completedRequirements?: number[]
  hosting: Hosting
  llmMode?: CreateAMapSelectionQuery['llmMode']
  onCompletedRequirementsChange?: (requirements: number[]) => void
  onPublishedChange?: (published: boolean) => void
  operatingSystem?: CreateAMapSelectionQuery['operatingSystem']
  terminalProjectPath: string
}

let {
  aiAccess,
  completedRequirements = [],
  hosting,
  llmMode,
  onCompletedRequirementsChange,
  onPublishedChange,
  operatingSystem,
  terminalProjectPath,
}: Props = $props()

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
      ? 'gh-pages'
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
  hosting === 'cloudflare'
    ? cloudflareAccountDark
    : hosting === 'github-pages'
      ? githubAccountDark
      : hosting === 'vercel'
        ? vercelAccountDark
        : hosting === 'netlify'
          ? netlifyAccountDark
          : undefined,
)
const authenticationScreenshot = $derived(
  hosting === 'github-pages'
    ? githubAuthenticationLight
    : hosting === 'vercel'
      ? vercelAuthenticationLight
      : hosting === 'netlify'
        ? netlifyAuthenticationLight
        : undefined,
)
const authenticationScreenshotDark = $derived(
  hosting === 'github-pages'
    ? githubAuthenticationDark
    : hosting === 'vercel'
      ? vercelAuthenticationDark
      : hosting === 'netlify'
        ? netlifyAuthenticationDark
        : undefined,
)
const clientUrl = $derived(
  hosting === 'cloudflare'
    ? 'https://developers.cloudflare.com/workers/wrangler/install-and-update/'
    : hosting === 'github-pages'
      ? 'https://www.npmjs.com/package/gh-pages'
      : hosting === 'vercel'
        ? 'https://vercel.com/docs/cli'
        : 'https://docs.netlify.com/cli/get-started/',
)
const gitUrl = 'https://git-scm.com/downloads'
const githubCliUrl = 'https://cli.github.com/'
const hasGitDependencies = $derived(hosting === 'github-pages')
const requirementTotal = $derived(hasGitDependencies ? 6 : 5)
const gitDependenciesRequirement = 2
const clientRequirement = $derived(hasGitDependencies ? 3 : 2)
const authenticationRequirement = $derived(hasGitDependencies ? 4 : 3)
const configurationRequirement = $derived(hasGitDependencies ? 5 : 4)
const deploymentRequirement = $derived(hasGitDependencies ? 6 : 5)
const installCode = $derived(
  hosting === 'cloudflare'
    ? 'bun add -d wrangler'
    : hosting === 'github-pages'
      ? 'bun add -d gh-pages'
      : hosting === 'vercel'
        ? 'bun add -d vercel'
        : 'bun add -d netlify-cli',
)
const clientInstallOutput = $derived(
  hosting === 'cloudflare'
    ? [
        'bun add v1.4.0 (34cbb9a40)',
        '',
        'installed wrangler@4.127.1 with binaries:',
        ' - wrangler',
        ' - wrangler2',
        ' - cf-wrangler',
        '',
        '36 packages installed [3.08s]',
      ].join('\n')
    : hosting === 'github-pages'
      ? [
          'bun add v1.4.0 (34cbb9a40)',
          '',
          'installed gh-pages@6.3.0 with binaries:',
          ' - gh-pages',
          ' - gh-pages-clean',
          '',
          '30 packages installed [2.56s]',
        ].join('\n')
      : hosting === 'vercel'
        ? [
            'bun add v1.4.0 (34cbb9a40)',
            '',
            'installed vercel@59.10.0 with binaries:',
            ' - vc',
            ' - vercel',
            '',
            '279 packages installed [5.04s]',
          ].join('\n')
        : [
            'bun add v1.4.0 (34cbb9a40)',
            '',
            'installed netlify-cli@27.4.1 with binaries:',
            ' - netlify',
            ' - ntl',
            '',
            '885 packages installed [8.97s]',
          ].join('\n'),
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
const cloudflareAuthenticationOutput = [
  '⛅️ wrangler 4.127.1',
  '────────────────────',
  'Attempting to login via OAuth...',
  'Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?...',
  '',
  'Successfully logged in.',
].join('\n')
const cloudflareSetupInitialOutput = [
  '⛅️ wrangler 4.127.1',
  '────────────────────',
  '',
  'Detected Project Settings:',
  ' - Worker Name: saanseoi-project',
  ' - Framework: Vite',
  ' - Build Command: bun run build',
  ' - Output Directory: dist',
  '',
  '? Do you want to modify these settings? › (y/N)',
].join('\n')
const cloudflareSetupConfirmationOutput = [
  '✔ Do you want to modify these settings? … no',
  '',
  '📦 Install packages:',
  ' - wrangler (devDependency)',
  ' - @cloudflare/vite-plugin (devDependency)',
  '',
  '📝 Update package.json scripts:',
  ' - "deploy": "bun run build && wrangler deploy"',
  ' - "preview": "bun run build && wrangler dev"',
  '',
  '📄 Create wrangler.jsonc:',
  '  {',
  '    "$schema": "node_modules/wrangler/config-schema.json",',
  '    "name": "saanseoi-project",',
  '    "compatibility_date": "2026-08-28",',
  '    "observability": {',
  '      "enabled": true',
  '    },',
  '    "assets": {',
  '      "not_found_handling": "single-page-application"',
  '    }',
  '  }',
  '',
  '🛠️  Configuring project for Vite',
  '',
  '? Proceed with setup? › (Y/n)',
].join('\n')
const cloudflareSetupCompleteOutput = [
  '├ Installing wrangler A command line tool for building Cloudflare Workers',
  '│ installed via `bun install wrangler --save-dev`',
  '│',
  '├ Installing the Cloudflare Vite plugin',
  '│ installed @cloudflare/vite-plugin',
  '│',
  '├ Adding Wrangler files to the .gitignore file',
  '│ updated .gitignore file',
  '│',
  '🎉 Your project is now setup to deploy to Cloudflare',
  'You can now deploy with bun run deploy',
].join('\n')
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
  onPublishedChange?.(completedRequirements.includes(deploymentRequirement))
})

const completeRequirement = (requirement: number) => {
  if (completedRequirements.includes(requirement)) return
  onCompletedRequirementsChange?.([...completedRequirements, requirement])
}

const resetRequirement = (requirement: number) => {
  onCompletedRequirementsChange?.(
    completedRequirements.filter(value => value !== requirement),
  )
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
      {m.guide_publish_requirement({ current: 1, total: requirementTotal })}
    </p>
    <h3
      id="publish-account-title"
      class="mt-1 font-display text-headline-sm font-bold text-primary"
    >
      {m.guide_publish_account_title({ host })}
    </h3>
    <p
      class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 font-body text-body-lg leading-8 text-foreground-alt"
    >
      <Button href={accountUrl} rel="noreferrer" size="compact" variant="secondary">
        {m.guide_publish_account_create_action()}
      </Button>
      <span>{m.guide_publish_account_description()}</span>
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
    </GuidePublishRequirement>
  </section>

  {#if hasGitDependencies}
    <section aria-labelledby="publish-git-dependencies-title">
      <p
        class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
      >
        {m.guide_publish_requirement({ current: gitDependenciesRequirement, total: requirementTotal })}
      </p>
      <h3
        id="publish-git-dependencies-title"
        class="mt-1 font-display text-headline-sm font-bold text-primary"
      >
        {m.guide_publish_git_dependencies_title()}
      </h3>
      <p class="mt-3 font-body text-body-lg leading-8 text-foreground-alt">
        {@html m.guide_publish_github_git_description()}
      </p>
      <GuidePublishRequirement
        id="publish-git-dependencies-readiness"
        titleId="publish-git-dependencies-readiness-title"
        complete={completedRequirements.includes(gitDependenciesRequirement)}
        completeAction={m.guide_publish_git_dependencies_complete_action()}
        eyebrow={m.guide_publish_git_dependencies_ready()}
        description={m.guide_publish_git_dependencies_ready_description()}
        resetDescription={m.guide_publish_reset_description()}
        resetLabel={m.guide_readiness_reset()}
        onComplete={() => completeRequirement(gitDependenciesRequirement)}
        onReset={() => resetRequirement(gitDependenciesRequirement)}
      >
        {#if operatingSystem === 'linux'}
          <div class="space-y-6">
            <GuidePublishTerminalCommand
              commandLabel={m.guide_setup_terminal_label({ action: m.guide_publish_install_github_tools_fedora(), path: terminalProjectPath })}
              description={m.guide_publish_install_github_tools_fedora_description()}
              code="sudo dnf install git gh"
              language={terminalLanguage}
              copyLabel={m.common_copy()}
              copiedLabel={m.common_copied()}
            />
            <GuidePublishTerminalCommand
              commandLabel={m.guide_setup_terminal_label({ action: m.guide_publish_install_github_tools_debian(), path: terminalProjectPath })}
              description={m.guide_publish_install_github_tools_debian_description()}
              code="sudo apt install git gh"
              language={terminalLanguage}
              copyLabel={m.common_copy()}
              copiedLabel={m.common_copied()}
            />
          </div>
        {:else}
          <div class="border border-secondary/45 bg-secondary/10 p-5">
            <p class="font-body text-body-lg leading-8 text-primary">
              {m.guide_publish_github_external_installation_title()}
            </p>
            <p class="mt-2 font-body text-body-md leading-7 text-foreground-alt">
              {m.guide_publish_github_external_installation_description()}
            </p>
            <div class="mt-5 grid gap-3 sm:grid-cols-2">
              <a
                class="border border-secondary bg-surface-container-low px-4 py-3 font-body text-label-md font-semibold text-secondary transition-colors hover:bg-secondary/10"
                href={gitUrl}
                target="_blank"
                rel="noreferrer"
                >{m.guide_publish_install_git()}</a
              >
              <a
                class="border border-secondary bg-surface-container-low px-4 py-3 font-body text-label-md font-semibold text-secondary transition-colors hover:bg-secondary/10"
                href={githubCliUrl}
                target="_blank"
                rel="noreferrer"
                >{m.guide_publish_install_github_cli()}</a
              >
            </div>
          </div>
        {/if}
        <div class="mt-6 space-y-6">
          <GuidePublishTerminalCommand
            commandLabel={m.guide_setup_terminal_label({ action: m.guide_publish_check_git(), path: terminalProjectPath })}
            description={m.guide_publish_check_git_description()}
            code="git --version"
            language={terminalLanguage}
            output="git version 2.55.0"
            outputLabel={m.guide_publish_command_output({ action: m.guide_publish_check_git() })}
            copyLabel={m.common_copy()}
            copiedLabel={m.common_copied()}
          />
          <GuidePublishTerminalCommand
            commandLabel={m.guide_setup_terminal_label({ action: m.guide_publish_check_github_cli(), path: terminalProjectPath })}
            description={m.guide_publish_check_github_cli_description()}
            code="gh --version"
            language={terminalLanguage}
            output={'gh version 2.97.0 (2026-07-31)\nhttps://github.com/cli/cli/releases/tag/v2.97.0'}
            outputLabel={m.guide_publish_command_output({ action: m.guide_publish_check_github_cli() })}
            copyLabel={m.common_copy()}
            copiedLabel={m.common_copied()}
          />
        </div>
      </GuidePublishRequirement>
    </section>
  {/if}

  <section aria-labelledby="publish-client-title">
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {m.guide_publish_requirement({ current: clientRequirement, total: requirementTotal })}
    </p>
    <h3
      id="publish-client-title"
      class="mt-1 font-display text-headline-sm font-bold text-primary"
    >
      {m.guide_publish_client_title({ client })}
    </h3>
    <p class="mt-3 font-body text-body-lg leading-8 text-foreground-alt">
      {m.guide_publish_client_description({ host })}
      <code>{client}</code>{m.guide_publish_client_description_after()}
      <a
        class="font-semibold text-secondary underline underline-offset-4"
        href={clientUrl}
        target="_blank"
        rel="noreferrer"
        >{m.guide_publish_client_installation_guide({ client })}</a
      >
    </p>
    <GuidePublishRequirement
      id="publish-client-readiness"
      titleId="publish-client-readiness-title"
      complete={completedRequirements.includes(clientRequirement)}
      completeAction={m.guide_publish_client_complete_action({ client })}
      eyebrow={m.guide_publish_client_ready({ client })}
      description={m.guide_publish_client_ready_description({ client })}
      resetDescription={m.guide_publish_reset_description()}
      resetLabel={m.guide_readiness_reset()}
      onComplete={() => completeRequirement(clientRequirement)}
      onReset={() => resetRequirement(clientRequirement)}
    >
      <GuidePublishTerminalCommand
        commandLabel={m.guide_setup_terminal_label({ action: m.guide_publish_install_client({ client }), path: terminalProjectPath })}
        description={m.guide_publish_install_client_description({ client })}
        code={installCode}
        language={terminalLanguage}
        output={clientInstallOutput}
        outputLabel={m.guide_publish_command_output({ action: m.guide_publish_install_client({ client }) })}
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
      />
    </GuidePublishRequirement>
  </section>

  <section aria-labelledby="publish-authentication-title">
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {m.guide_publish_requirement({ current: authenticationRequirement, total: requirementTotal })}
    </p>
    <h3
      id="publish-authentication-title"
      class="mt-1 font-display text-headline-sm font-bold text-primary"
    >
      {m.guide_publish_authentication_title({ host })}
    </h3>
    <GuidePublishRequirement
      id="publish-authentication-readiness"
      titleId="publish-authentication-readiness-title"
      complete={completedRequirements.includes(authenticationRequirement)}
      completeAction={m.guide_publish_authentication_complete_action()}
      eyebrow={m.guide_publish_authenticated()}
      description={m.guide_publish_authenticated_description({ host })}
      resetDescription={m.guide_publish_reset_description()}
      resetLabel={m.guide_readiness_reset()}
      onComplete={() => completeRequirement(authenticationRequirement)}
      onReset={() => resetRequirement(authenticationRequirement)}
    >
      <GuidePublishTerminalCommand
        commandLabel={m.guide_setup_terminal_label({ action: m.guide_publish_authentication_command(), path: terminalProjectPath })}
        description={m.guide_publish_authentication_description({ host })}
        code={authenticationCode}
        language={terminalLanguage}
        output={hosting === 'cloudflare' ? cloudflareAuthenticationOutput : undefined}
        outputLabel={hosting === 'cloudflare'
          ? m.guide_publish_command_output({ action: m.guide_publish_authentication_command() })
          : undefined}
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
      />
      {#if hosting === 'cloudflare'}
        <p class="mt-5 font-body text-body-md leading-7 text-foreground-alt">
          {m.guide_publish_cloudflare_authentication_url_note()}
        </p>
        <div class="mt-6 space-y-3">
          <p class="font-body text-body-md leading-7 text-foreground-alt">
            {m.guide_publish_cloudflare_authorize_description()}
          </p>
          <GuideScreenshot
            src={cloudflareAuthenticationAuthorizeLight}
            srcDark={cloudflareAuthenticationAuthorizeDark}
            alt={m.guide_publish_cloudflare_authorize_screenshot_alt()}
          />
        </div>
        <div class="mt-6 space-y-3">
          <p class="font-body text-body-md leading-7 text-foreground-alt">
            {m.guide_publish_cloudflare_authorization_success_description()}
          </p>
          <GuideScreenshot
            src={cloudflareAuthenticationSuccessLight}
            srcDark={cloudflareAuthenticationSuccessDark}
            alt={m.guide_publish_cloudflare_authorization_success_screenshot_alt()}
          />
        </div>
      {:else if authenticationScreenshot}
        <GuideScreenshot
          src={authenticationScreenshot}
          srcDark={authenticationScreenshotDark}
          alt={m.guide_publish_authentication_screenshot_alt({ host })}
        />
      {/if}
    </GuidePublishRequirement>
  </section>

  <section aria-labelledby="publish-configuration-title">
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {m.guide_publish_requirement({ current: configurationRequirement, total: requirementTotal })}
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
      complete={completedRequirements.includes(configurationRequirement)}
      completeAction={m.guide_publish_configuration_complete_action()}
      eyebrow={m.guide_publish_configuration_ready()}
      description={m.guide_publish_configuration_ready_description()}
      resetDescription={m.guide_publish_reset_description()}
      resetLabel={m.guide_readiness_reset()}
      onComplete={() => completeRequirement(configurationRequirement)}
      onReset={() => resetRequirement(configurationRequirement)}
    >
      {#if hosting === 'cloudflare'}
        <GuidePublishTerminalCommand
          commandLabel={m.guide_setup_terminal_label({ action: m.guide_publish_configuration_command(), path: terminalProjectPath })}
          description={m.guide_publish_cloudflare_configuration_command_description()}
          code={configurationCode}
          language={terminalLanguage}
          output={cloudflareSetupInitialOutput}
          outputLabel={m.guide_publish_cloudflare_configuration_initial_output()}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
        <p class="mt-5 font-body text-body-md leading-7 text-foreground-alt">
          {@html m.guide_publish_cloudflare_configuration_accept_defaults()}
        </p>
        <GuideCodeBlock
          class="mt-3"
          code={cloudflareSetupConfirmationOutput}
          label={m.guide_publish_cloudflare_configuration_confirmation_output()}
          copyable={false}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
        <p class="mt-5 font-body text-body-md leading-7 text-foreground-alt">
          {@html m.guide_publish_cloudflare_configuration_proceed()}
        </p>
        <GuideCodeBlock
          class="mt-3"
          code={cloudflareSetupCompleteOutput}
          label={m.guide_publish_cloudflare_configuration_complete_output()}
          copyable={false}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
      {:else}
        <GuideCodeBlock
          label={m.guide_setup_terminal_label({ action: m.guide_publish_configuration_command(), path: terminalProjectPath })}
          code={configurationCode}
          language={terminalLanguage}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
      {/if}
    </GuidePublishRequirement>
  </section>

  <section aria-labelledby="publish-deployment-title">
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {m.guide_publish_requirement({ current: deploymentRequirement, total: requirementTotal })}
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
      complete={completedRequirements.includes(deploymentRequirement)}
      completeAction={m.guide_publish_deployment_complete_action()}
      eyebrow={m.guide_publish_deployment_ready()}
      description={m.guide_publish_deployment_ready_description()}
      resetDescription={m.guide_publish_reset_description()}
      resetLabel={m.guide_readiness_reset()}
      onComplete={() => completeRequirement(deploymentRequirement)}
      onReset={() => resetRequirement(deploymentRequirement)}
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
