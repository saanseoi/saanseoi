<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { m } from '#lib/bits/internal/i18n.js'
import { Button } from '#lib/bits/primitives/button/index.js'
import { GuideCodeBlock, GuideReadinessPanel } from '#lib/bits/pages/guides/index.js'
import type { CreateAMapSelectionQuery } from '#lib/guides/createAMapSelections.js'

type Hosting = Extract<
  CreateAMapSelectionQuery['hosting'],
  'cloudflare' | 'github-pages' | 'vercel' | 'netlify'
>

type Props = {
  aiAccess?: CreateAMapSelectionQuery['aiAccess']
  hosting: Hosting
  llmMode?: CreateAMapSelectionQuery['llmMode']
  operatingSystem?: CreateAMapSelectionQuery['operatingSystem']
  onPublished?: () => void
  terminalExperience?: CreateAMapSelectionQuery['terminalExperience']
  terminalProjectPath: string
}

let {
  aiAccess,
  hosting,
  llmMode,
  operatingSystem,
  onPublished,
  terminalExperience,
  terminalProjectPath,
}: Props = $props()

let completedRequirement = $state(0)
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
    ? 'https://dash.cloudflare.com/sign-up'
    : hosting === 'github-pages'
      ? 'https://github.com/signup'
      : hosting === 'vercel'
        ? 'https://vercel.com/signup'
        : 'https://app.netlify.com/signup',
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
    ? 'bunx wrangler pages project create saanseoi-map'
    : hosting === 'github-pages'
      ? [
          'git config --global user.name "Your name"',
          'git config --global user.email "you@example.com"',
          'git init -b main',
          'git add .',
          'git commit -m "Publish my map"',
          'gh repo create saanseoi-map --public --source=. --push',
        ].join('\n')
      : hosting === 'vercel'
        ? 'bunx vercel link'
        : 'bunx netlify sites:create --name saanseoi-map',
)
const deploymentCode = $derived(
  hosting === 'cloudflare'
    ? [
        'bun run build',
        'bunx wrangler pages deploy dist --project-name saanseoi-map',
      ].join('\n')
    : hosting === 'github-pages'
      ? [
          'bunx vite build --base=/saanseoi-map/',
          'bunx gh-pages -d dist',
          'gh api --method POST "repos/{owner}/{repo}/pages" -f "source[branch]=gh-pages" -f "source[path]=/"',
        ].join('\n')
      : hosting === 'vercel'
        ? ['bun run build', 'bunx vercel --prod'].join('\n')
        : ['bun run build', 'bunx netlify deploy --dir=dist --prod'].join('\n'),
)
const visitUrl = $derived(
  hosting === 'github-pages'
    ? 'https://your-github-user-name.github.io/saanseoi-map/'
    : undefined,
)
const llmHelp = $derived(
  llmMode === 'manual'
    ? m.guide_publish_assistance_manual()
    : aiAccess === 'agentic'
      ? m.guide_publish_assistance_agentic()
      : m.guide_publish_assistance_chat(),
)
const terminalHelp = $derived(
  terminalExperience === 'none'
    ? m.guide_publish_terminal_none()
    : terminalExperience === 'advanced'
      ? m.guide_publish_terminal_advanced()
      : m.guide_publish_terminal_basic(),
)

$effect(() => {
  const selection = `${hosting}:${operatingSystem ?? ''}:${terminalExperience ?? ''}:${llmMode ?? ''}:${aiAccess ?? ''}`
  if (previousSelection && previousSelection !== selection) completedRequirement = 0
  previousSelection = selection
})

const completeRequirement = (requirement: number) => {
  completedRequirement = Math.max(completedRequirement, requirement)
  if (requirement === 5) onPublished?.()
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
      {m.guide_publish_requirement({ current: 1, total: 2 })}
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
    <GuideReadinessPanel
      id="publish-account-readiness"
      complete={completedRequirement >= 1}
      titleId="publish-account-readiness-title"
    >
      <div class="flex items-start gap-3">
        <Icon
          icon={completedRequirement >= 1 ? 'material-symbols-light:check-circle-rounded' : 'material-symbols-light:warning-rounded'}
          class={`mt-0.5 size-5 shrink-0 ${completedRequirement >= 1 ? 'text-[#6fdec9]' : 'text-[#ef8b88]'}`}
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <p
            id="publish-account-readiness-title"
            class={`font-body text-label-sm font-semibold tracking-[0.12em] uppercase ${completedRequirement >= 1 ? 'text-[#6fdec9]' : 'text-[#ffb4b1]'}`}
          >
            {completedRequirement >= 1 ? m.guide_publish_account_ready() : m.guide_publish_account_needed()}
          </p>
          <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
            <a
              class="font-body text-label-md font-semibold text-secondary underline underline-offset-4"
              href={accountUrl}
              target="_blank"
              rel="noreferrer"
              >{m.guide_publish_account_action({ host })}</a
            >
            <Button
              class="bg-[#6fdec9] text-[#00201b] hover:bg-[#8aecd9]"
              size="compact"
              onclick={() => completeRequirement(1)}
            >
              <Icon
                icon="material-symbols-light:check-rounded"
                class="size-5"
                aria-hidden="true"
              />
              {m.guide_publish_ready_check()}
            </Button>
          </div>
        </div>
      </div>
    </GuideReadinessPanel>
  </section>

  <section aria-labelledby="publish-client-title">
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {m.guide_publish_requirement({ current: 2, total: 2 })}
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
    {#if hosting === 'github-pages'}
      <p class="mt-4 font-body text-body-lg leading-8 text-foreground-alt">
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
        class="mt-5"
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
    <GuideReadinessPanel
      id="publish-client-readiness"
      complete={completedRequirement >= 2}
      titleId="publish-client-readiness-title"
    >
      <div class="flex items-start gap-3">
        <Icon
          icon={completedRequirement >= 2 ? 'material-symbols-light:check-circle-rounded' : 'material-symbols-light:warning-rounded'}
          class={`mt-0.5 size-5 shrink-0 ${completedRequirement >= 2 ? 'text-[#6fdec9]' : 'text-[#ef8b88]'}`}
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <p
            id="publish-client-readiness-title"
            class={`font-body text-label-sm font-semibold tracking-[0.12em] uppercase ${completedRequirement >= 2 ? 'text-[#6fdec9]' : 'text-[#ffb4b1]'}`}
          >
            {completedRequirement >= 2 ? m.guide_publish_client_ready({ client }) : m.guide_publish_client_needed({ client })}
          </p>
          <div class="mt-5 flex justify-end">
            <Button
              class="bg-[#6fdec9] text-[#00201b] hover:bg-[#8aecd9]"
              size="compact"
              onclick={() => completeRequirement(2)}
              ><Icon
                icon="material-symbols-light:check-rounded"
                class="size-5"
                aria-hidden="true"
              />{m.guide_publish_ready_check()}</Button
            >
          </div>
        </div>
      </div>
    </GuideReadinessPanel>
  </section>

  <section aria-labelledby="publish-authentication-title">
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {m.guide_publish_requirement({ current: 3, total: 3 })}
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
    <GuideCodeBlock
      class="mt-5"
      label={m.guide_setup_terminal_label({ action: m.guide_publish_authentication_command(), path: terminalProjectPath })}
      code={authenticationCode}
      language={terminalLanguage}
      copyLabel={m.common_copy()}
      copiedLabel={m.common_copied()}
    />
    <GuideReadinessPanel
      id="publish-authentication-readiness"
      complete={completedRequirement >= 3}
      titleId="publish-authentication-readiness-title"
    >
      <div class="flex items-start gap-3">
        <Icon
          icon={completedRequirement >= 3 ? 'material-symbols-light:check-circle-rounded' : 'material-symbols-light:warning-rounded'}
          class={`mt-0.5 size-5 shrink-0 ${completedRequirement >= 3 ? 'text-[#6fdec9]' : 'text-[#ef8b88]'}`}
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <p
            id="publish-authentication-readiness-title"
            class={`font-body text-label-sm font-semibold tracking-[0.12em] uppercase ${completedRequirement >= 3 ? 'text-[#6fdec9]' : 'text-[#ffb4b1]'}`}
          >
            {completedRequirement >= 3 ? m.guide_publish_authenticated() : m.guide_publish_authentication_needed()}
          </p>
          <div class="mt-5 flex justify-end">
            <Button
              class="bg-[#6fdec9] text-[#00201b] hover:bg-[#8aecd9]"
              size="compact"
              onclick={() => completeRequirement(3)}
              ><Icon
                icon="material-symbols-light:check-rounded"
                class="size-5"
                aria-hidden="true"
              />{m.guide_publish_ready_check()}</Button
            >
          </div>
        </div>
      </div>
    </GuideReadinessPanel>
  </section>

  <section aria-labelledby="publish-configuration-title">
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {m.guide_publish_requirement({ current: 4, total: 4 })}
    </p>
    <h3
      id="publish-configuration-title"
      class="mt-1 font-display text-headline-sm font-bold text-primary"
    >
      {m.guide_publish_configuration_title({ host })}
    </h3>
    <p class="mt-3 font-body text-body-lg leading-8 text-foreground-alt">
      {@html hosting === 'github-pages' ? m.guide_publish_github_configuration_description() : m.guide_publish_configuration_description({ host })}
    </p>
    <GuideCodeBlock
      class="mt-5"
      label={m.guide_setup_terminal_label({ action: m.guide_publish_configuration_command(), path: terminalProjectPath })}
      code={configurationCode}
      language={terminalLanguage}
      copyLabel={m.common_copy()}
      copiedLabel={m.common_copied()}
    />
    <GuideReadinessPanel
      id="publish-configuration-readiness"
      complete={completedRequirement >= 4}
      titleId="publish-configuration-readiness-title"
    >
      <div class="flex items-start gap-3">
        <Icon
          icon={completedRequirement >= 4 ? 'material-symbols-light:check-circle-rounded' : 'material-symbols-light:warning-rounded'}
          class={`mt-0.5 size-5 shrink-0 ${completedRequirement >= 4 ? 'text-[#6fdec9]' : 'text-[#ef8b88]'}`}
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <p
            id="publish-configuration-readiness-title"
            class={`font-body text-label-sm font-semibold tracking-[0.12em] uppercase ${completedRequirement >= 4 ? 'text-[#6fdec9]' : 'text-[#ffb4b1]'}`}
          >
            {completedRequirement >= 4 ? m.guide_publish_configuration_ready() : m.guide_publish_configuration_needed()}
          </p>
          <div class="mt-5 flex justify-end">
            <Button
              class="bg-[#6fdec9] text-[#00201b] hover:bg-[#8aecd9]"
              size="compact"
              onclick={() => completeRequirement(4)}
              ><Icon
                icon="material-symbols-light:check-rounded"
                class="size-5"
                aria-hidden="true"
              />{m.guide_publish_ready_check()}</Button
            >
          </div>
        </div>
      </div>
    </GuideReadinessPanel>
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
    <GuideCodeBlock
      class="mt-5"
      label={m.guide_setup_terminal_label({ action: m.guide_publish_deployment_command(), path: terminalProjectPath })}
      code={deploymentCode}
      language={terminalLanguage}
      copyLabel={m.common_copy()}
      copiedLabel={m.common_copied()}
    />
    <GuideReadinessPanel
      id="publish-deployment-readiness"
      complete={completedRequirement >= 5}
      titleId="publish-deployment-readiness-title"
    >
      <div class="flex items-start gap-3">
        <Icon
          icon={completedRequirement >= 5 ? 'material-symbols-light:check-circle-rounded' : 'material-symbols-light:warning-rounded'}
          class={`mt-0.5 size-5 shrink-0 ${completedRequirement >= 5 ? 'text-[#6fdec9]' : 'text-[#ef8b88]'}`}
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <p
            id="publish-deployment-readiness-title"
            class={`font-body text-label-sm font-semibold tracking-[0.12em] uppercase ${completedRequirement >= 5 ? 'text-[#6fdec9]' : 'text-[#ffb4b1]'}`}
          >
            {completedRequirement >= 5 ? m.guide_publish_deployment_ready() : m.guide_publish_deployment_needed()}
          </p>
          <div class="mt-5 flex justify-end">
            <Button
              class="bg-[#6fdec9] text-[#00201b] hover:bg-[#8aecd9]"
              size="compact"
              onclick={() => completeRequirement(5)}
              ><Icon
                icon="material-symbols-light:check-rounded"
                class="size-5"
                aria-hidden="true"
              />{m.guide_publish_ready_check()}</Button
            >
          </div>
        </div>
      </div>
    </GuideReadinessPanel>
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
      {@html terminalHelp} {@html llmHelp}
    </p>
  </section>
</div>
