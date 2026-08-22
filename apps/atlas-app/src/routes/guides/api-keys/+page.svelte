<script lang="ts">
import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'
import { page } from '$app/state'

import {
  CreateAMap,
  GuideCallout,
  GuideChoiceGroup,
  GuideColophon,
  GuideCodeBlock,
  GuideMissingAnswerReminder,
  GuideReference,
  GuideRoot,
} from '#lib/bits/pages/guides/index.js'
import { Seo } from '#lib/bits/patterns/seo/index.js'
import { Button } from '#lib/bits/primitives/button/index.js'
import { Main } from '#lib/bits/primitives/main/index.js'
import { PageDescription, PageHeader, PageTitle } from '#lib/bits/pages/shared/index.js'
import { getCurrentLocale, m } from '#lib/bits/internal/i18n.js'

import GuideCreateAMapAccountComplete from '../create-a-map/guideCreateAMapAccountComplete.svelte'
import GuideCreateAMapApiKeys from '../create-a-map/guideCreateAMapApiKeys.svelte'
import GuideApiKeysNextSteps from './guideApiKeysNextSteps.svelte'

type RequestLibrary = 'fetch' | 'axios' | 'requests' | 'httpx' | 'curl' | 'powershell'

const atlasApiBaseUrl = (PUBLIC_ATLAS_API_BASE_URL || 'http://localhost:8787').replace(
  /\/+$/,
  '',
)

let { data } = $props()
let locale = $derived(getCurrentLocale())
let requestLibrary = $state<RequestLibrary>('fetch')
let apiKeyReady = $state(false)
let tutorialApiKey = $state<string>()
let exampleKey = $derived(tutorialApiKey ?? 'pk.your-api-key')
let continueUrl = $derived(`${page.url.pathname}${page.url.search}${page.url.hash}`)
const apiKeySetupQuestions = $derived([
  {
    answered: Boolean(data.user),
    id: 'api-key-account',
    label: m.guide_api_keys_account_heading(),
  },
  {
    answered: !data.user || apiKeyReady,
    deferUntilId: 'api-key-account',
    id: 'api-key-creation',
    label: m.guide_api_keys_create_heading(),
  },
])
const outline = $derived([
  {
    id: 'api-key-introduction',
    label: m.guide_api_keys_toc_intro(),
  },
  {
    id: 'api-key-account',
    label: m.guide_api_keys_toc_account(),
  },
  ...(data.user
    ? [
        {
          id: 'api-key-creation',
          label: m.guide_api_keys_toc_create(),
        },
      ]
    : []),
  {
    id: 'api-key-requests',
    label: m.guide_api_keys_toc_requests(),
  },
  {
    id: 'api-key-next-steps',
    label: m.guide_api_keys_toc_next_steps(),
  },
])

const requestLibraryChoices = $derived([
  {
    value: 'fetch',
    label: m.guide_api_keys_library_fetch(),
    description: m.guide_api_keys_library_fetch_description(),
    icon: 'simple-icons:javascript',
  },
  {
    value: 'axios',
    label: m.guide_api_keys_library_axios(),
    description: m.guide_api_keys_library_axios_description(),
    icon: 'simple-icons:axios',
  },
  {
    value: 'requests',
    label: m.guide_api_keys_library_requests(),
    description: m.guide_api_keys_library_requests_description(),
    icon: 'simple-icons:python',
  },
  {
    value: 'httpx',
    label: m.guide_api_keys_library_httpx(),
    description: m.guide_api_keys_library_httpx_description(),
    icon: 'simple-icons:python',
  },
  {
    value: 'curl',
    label: m.guide_api_keys_library_curl(),
    description: m.guide_api_keys_library_curl_description(),
    icon: 'material-symbols-light:terminal-rounded',
  },
  {
    value: 'powershell',
    label: m.guide_api_keys_library_powershell(),
    description: m.guide_api_keys_library_powershell_description(),
    icon: 'simple-icons:windows11',
  },
])

let requestExamples = $derived<
  Record<
    RequestLibrary,
    { header: string; language: 'bash' | 'powershell' | 'typescript'; query: string }
  >
>({
  fetch: {
    language: 'typescript',
    query: `const apiKey = '${exampleKey}'
const baseUrl = '${atlasApiBaseUrl}'

const url = new URL('/v0/divisions', baseUrl)
url.searchParams.set('profile', 'map')
url.searchParams.set('page[limit]', '10')
url.searchParams.set('access_token', apiKey)

const response = await fetch(url)
const divisions = await response.json()

console.log(JSON.stringify(divisions, null, 2))`,
    header: `const apiKey = '${exampleKey}'
const baseUrl = '${atlasApiBaseUrl}'

const url = new URL('/v0/divisions', baseUrl)
url.searchParams.set('profile', 'map')
url.searchParams.set('page[limit]', '10')

const response = await fetch(url, {
  headers: { 'x-api-key': apiKey },
})
const divisions = await response.json()

console.log(JSON.stringify(divisions, null, 2))`,
  },
  axios: {
    language: 'typescript',
    query: `import axios from 'axios'

const apiKey = '${exampleKey}'
const baseUrl = '${atlasApiBaseUrl}'
const url = new URL('/v0/divisions', baseUrl)

const response = await axios.get(url.toString(), {
  params: {
    profile: 'map',
    'page[limit]': 10,
    access_token: apiKey,
  },
})
const divisions = response.data

console.log(JSON.stringify(divisions, null, 2))`,
    header: `import axios from 'axios'

const apiKey = '${exampleKey}'
const baseUrl = '${atlasApiBaseUrl}'
const url = new URL('/v0/divisions', baseUrl)

const response = await axios.get(url.toString(), {
  params: { profile: 'map', 'page[limit]': 10 },
  headers: { 'x-api-key': apiKey },
})
const divisions = response.data

console.log(JSON.stringify(divisions, null, 2))`,
  },
  requests: {
    language: 'typescript',
    query: `import json
import requests

api_key = '${exampleKey}'
base_url = '${atlasApiBaseUrl}'
url = f'{base_url}/v0/divisions'

params = {
    'profile': 'map',
    'page[limit]': 10,
    'access_token': api_key,
}
response = requests.get(url, params=params)
divisions = response.json()

print(json.dumps(divisions, indent=2))`,
    header: `import json
import requests

api_key = '${exampleKey}'
base_url = '${atlasApiBaseUrl}'
url = f'{base_url}/v0/divisions'

params = {'profile': 'map', 'page[limit]': 10}
headers = {'x-api-key': api_key}
response = requests.get(url, params=params, headers=headers)
divisions = response.json()

print(json.dumps(divisions, indent=2))`,
  },
  httpx: {
    language: 'typescript',
    query: `import json
import httpx

api_key = '${exampleKey}'
base_url = '${atlasApiBaseUrl}'
url = f'{base_url}/v0/divisions'

params = {
    'profile': 'map',
    'page[limit]': 10,
    'access_token': api_key,
}
response = httpx.get(url, params=params)
divisions = response.json()

print(json.dumps(divisions, indent=2))`,
    header: `import json
import httpx

api_key = '${exampleKey}'
base_url = '${atlasApiBaseUrl}'
url = f'{base_url}/v0/divisions'

params = {'profile': 'map', 'page[limit]': 10}
headers = {'x-api-key': api_key}
response = httpx.get(url, params=params, headers=headers)
divisions = response.json()

print(json.dumps(divisions, indent=2))`,
  },
  curl: {
    language: 'bash',
    query: `api_key='${exampleKey}'
base_url='${atlasApiBaseUrl}'

curl --get "$base_url/v0/divisions" \\
  --data-urlencode 'profile=map' \\
  --data-urlencode 'page[limit]=10' \\
  --data-urlencode "access_token=$api_key"`,
    header: `api_key='${exampleKey}'
base_url='${atlasApiBaseUrl}'

curl --get "$base_url/v0/divisions" \\
  --data-urlencode 'profile=map' \\
  --data-urlencode 'page[limit]=10' \\
  --header "x-api-key: $api_key"`,
  },
  powershell: {
    language: 'powershell',
    query: `$apiKey = '${exampleKey}'
$baseUrl = '${atlasApiBaseUrl}'
$params = @{
  profile = 'map'
  'page[limit]' = 10
  access_token = $apiKey
}
$request = @{
  Method = 'Get'
  Uri = "$baseUrl/v0/divisions"
  Body = $params
}

$divisions = Invoke-RestMethod @request
$divisions | ConvertTo-Json -Depth 10`,
    header: `$apiKey = '${exampleKey}'
$baseUrl = '${atlasApiBaseUrl}'
$params = @{ profile = 'map'; 'page[limit]' = 10 }
$headers = @{ 'x-api-key' = $apiKey }
$request = @{
  Method = 'Get'
  Uri = "$baseUrl/v0/divisions"
  Body = $params
  Headers = $headers
}

$divisions = Invoke-RestMethod @request
$divisions | ConvertTo-Json -Depth 10`,
  },
})

let requestExample = $derived(requestExamples[requestLibrary])
let requestRunInstructions = $derived(
  requestLibrary === 'curl'
    ? m.guide_api_keys_run_curl()
    : requestLibrary === 'powershell'
      ? m.guide_api_keys_run_powershell()
      : requestLibrary === 'requests' || requestLibrary === 'httpx'
        ? m.guide_api_keys_run_python()
        : m.guide_api_keys_run_javascript(),
)
let requestSetup = $derived(
  requestLibrary === 'fetch'
    ? m.guide_api_keys_setup_fetch()
    : requestLibrary === 'axios'
      ? m.guide_api_keys_setup_axios()
      : requestLibrary === 'requests'
        ? m.guide_api_keys_setup_requests()
        : requestLibrary === 'httpx'
          ? m.guide_api_keys_setup_httpx()
          : undefined,
)
let requestSetupClass = $derived(
  requestLibrary === 'fetch'
    ? 'mt-3 max-w-3xl font-body text-body-md leading-7 text-foreground-alt [&_a]:font-semibold [&_a]:text-secondary [&_a]:underline [&_a]:underline-offset-3 hover:[&_a]:text-primary [&_code]:font-mono [&_code]:font-semibold [&_code]:text-secondary'
    : 'mt-3 max-w-3xl font-body text-body-md leading-7 text-foreground-alt [&_a]:font-semibold [&_a]:text-secondary [&_a]:underline [&_a]:underline-offset-3 hover:[&_a]:text-primary [&_code]:ml-2 [&_code]:inline-block [&_code]:rounded-md [&_code]:bg-[#151a26] [&_code]:px-3 [&_code]:py-1 [&_code]:align-[0.08em] [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:font-semibold [&_code]:leading-none [&_code]:text-[#80e7c7]',
)
</script>

<Seo
  title={m.guide_api_keys_title()}
  description={m.guide_api_keys_meta_description()}
  image="/guides/data-from-api-light.webp"
/>

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-16 md:py-20"
>
  <section
    id="api-key-introduction"
    class="grid min-w-0 max-w-full gap-10 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-12"
  >
    <div class="min-w-0 max-w-full">
      <section class="max-w-4xl">
        <PageHeader>
          <p
            class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
          >
            {m.guide_api_keys_eyebrow()}
          </p>
          <PageTitle class="mt-3">{m.guide_api_keys_hero()}</PageTitle>
          <PageDescription class="mt-5">
            {@html m.guide_api_keys_description_before()}
            <GuideReference
              href={`saanseoi:${locale.toLowerCase()}:definition/request/v1`}
              label={m.guide_api_keys_request()}
            />
            {@html m.guide_api_keys_description_between()}
            <GuideReference
              href={`saanseoi:${locale.toLowerCase()}:definition/authentication/v1`}
              label={m.guide_api_keys_authenticated()}
            />
            {@html m.guide_api_keys_description_after()}
            <a
              class="font-semibold text-secondary underline hover:text-primary"
              href="/policy/fair-use"
            >
              {m.guide_api_keys_fair_use_policy()}
            </a
            >.
          </PageDescription>
        </PageHeader>
      </section>
    </div>

    <aside
      class="min-w-0 max-w-3xl space-y-6 xl:col-start-2 xl:row-span-2 xl:max-w-none"
    >
      <section
        class="border border-border-card bg-surface-container-low p-6 shadow-card"
      >
        <div aria-hidden="true" class="size-11 bg-secondary-container"></div>
        <h2 class="mt-5 font-display text-headline-sm font-bold text-primary">
          {m.guide_api_keys_what_is_heading()}
        </h2>
        <p class="mt-3 font-body text-body-md leading-7 text-foreground-alt">
          {@html m.guide_api_keys_what_is_body()}
        </p>
        <h2 class="mt-6 font-display text-headline-sm font-bold text-primary">
          {m.guide_api_keys_why_heading()}
        </h2>
        <p class="mt-3 font-body text-body-md leading-7 text-foreground-alt">
          {m.guide_api_keys_why_body()}
        </p>
      </section>
      <GuideColophon published="23 August 2026" />
    </aside>

    <section
      id="api-key-account"
      class="mt-2 min-w-0 max-w-3xl scroll-mt-28 xl:col-start-1 xl:row-start-2"
    >
      <h2 class="font-display text-headline-md font-bold text-primary">
        {m.guide_api_keys_account_heading()}
      </h2>
      <p class="mt-3 font-body text-body-md leading-7 text-foreground-alt">
        {m.guide_api_keys_account_body()}
      </p>
      {#if data.user}
        <GuideCreateAMapAccountComplete
          user={{ ...data.user, image: data.user.image ?? null }}
        />
      {:else}
        <CreateAMap.GuideCreateAMapAccountAccess
          id="api-key-account-access"
          {continueUrl}
        />
      {/if}
    </section>
  </section>

  {#if data.user}
    <section
      id="api-key-creation"
      class="mt-18 grid min-w-0 max-w-full scroll-mt-28 gap-10 xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-12 md:mt-24"
    >
      <div class="min-w-0 max-w-3xl border-t border-border-card pt-10 md:pt-14">
        <h2 class="font-display text-headline-md font-bold text-primary">
          {m.guide_api_keys_create_heading()}
        </h2>
        <p class="mt-3 font-body text-body-md leading-7 text-foreground-alt">
          {m.guide_api_keys_create_body()}
        </p>
        <GuideCreateAMapApiKeys
          showHeading={false}
          onApiKeyCreated={key => (tutorialApiKey = key)}
          onApiKeyReadyChange={ready => (apiKeyReady = ready)}
        />
      </div>
      <GuideCallout class="max-w-3xl xl:mt-14 xl:max-w-none" size="generous">
        <h2 class="font-display text-headline-sm font-bold text-primary">
          {m.guide_api_keys_safety_heading()}
        </h2>
        <div class="mt-4 space-y-4">
          <p>{m.guide_api_keys_safety_body_one()}</p>
          <p>{m.guide_api_keys_safety_body_two()}</p>
          <p>{m.guide_api_keys_safety_body_three()}</p>
        </div>
        <Button class="mt-6" href="/api-keys" variant="secondary">
          {m.guide_api_keys_manage_keys()}
        </Button>
      </GuideCallout>
    </section>
  {/if}

  <GuideRoot {outline} tocLabel={m.guide_toc()}>
    <section
      id="api-key-requests"
      class="mt-18 min-w-0 max-w-full border-t border-border-card pt-10 md:mt-24 md:pt-14"
    >
      <div class="max-w-3xl">
        <h2 class="font-display text-headline-md font-bold text-primary">
          {m.guide_api_keys_send_heading()}
        </h2>
        <p
          class="mt-3 font-body text-body-md leading-7 text-foreground-alt [&_code]:font-mono [&_code]:font-semibold [&_code]:text-secondary"
        >
          {@html m.guide_api_keys_send_body()}
        </p>
      </div>
      <GuideChoiceGroup
        alignment="left"
        choices={requestLibraryChoices}
        label={m.guide_api_keys_library_label()}
        onchange={value => (requestLibrary = value as RequestLibrary)}
        value={requestLibrary}
        variant="tiles"
        tileLayout="six-across"
      />
      <h3 class="mt-8 font-display text-headline-sm font-bold text-primary">
        {m.guide_api_keys_run_heading()}
      </h3>
      {#if requestSetup}
        <p class={requestSetupClass}>
          {@html requestSetup}
        </p>
      {/if}
      <p
        class="mt-3 max-w-3xl font-body text-body-md leading-7 text-foreground-alt [&_code]:font-mono [&_code]:font-semibold [&_code]:text-secondary [&_code.guide-api-keys-terminal]:ml-2 [&_code.guide-api-keys-terminal]:inline-block [&_code.guide-api-keys-terminal]:rounded-md [&_code.guide-api-keys-terminal]:bg-[#151a26] [&_code.guide-api-keys-terminal]:px-3 [&_code.guide-api-keys-terminal]:py-1 [&_code.guide-api-keys-terminal]:align-[0.08em] [&_code.guide-api-keys-terminal]:text-[0.85em] [&_code.guide-api-keys-terminal]:leading-none [&_code.guide-api-keys-terminal]:text-[#80e7c7]"
      >
        {@html requestRunInstructions}
      </p>
      <div
        class="mt-10 grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2"
      >
        <div class="min-w-0 max-w-full">
          <GuideCodeBlock
            code={requestExample.query}
            copyLabel={m.common_copy()}
            copiedLabel={m.common_copied()}
            label={m.guide_api_keys_url_parameter()}
            language={requestExample.language}
            variant={requestLibrary === 'curl' || requestLibrary === 'powershell'
            ? 'code'
            : 'editor'}
          />
        </div>
        <div class="min-w-0 max-w-full">
          <GuideCodeBlock
            code={requestExample.header}
            copyLabel={m.common_copy()}
            copiedLabel={m.common_copied()}
            label={m.guide_api_keys_header()}
            language={requestExample.language}
            variant={requestLibrary === 'curl' || requestLibrary === 'powershell'
            ? 'code'
            : 'editor'}
          />
        </div>
      </div>
    </section>
    <GuideApiKeysNextSteps />
    <GuideMissingAnswerReminder
      dismissLabel={m.guide_missing_answer_dismiss()}
      questions={apiKeySetupQuestions}
      title={m.guide_missing_answer()}
    />
  </GuideRoot>
</Main>
