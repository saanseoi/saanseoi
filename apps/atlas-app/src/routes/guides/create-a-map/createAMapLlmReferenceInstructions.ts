import {
  createAMapRendererBasemapCode,
  createAMapRendererStyleUpdateCode,
  createGeoJsonImportCode,
  createDeploymentCode,
  createUrbanDensitySetupZ14TileFetcherCode,
  createUrbanDensityStatsCode,
  getCreateAMapRendererReference,
  getHostingInstallCode,
  urbanDensityCalculationCode,
  urbanDensityCollectNonLiveableLandCode,
  urbanDensityGeometryWorkerCode,
  urbanDensityLiveableAreaCode,
  urbanDensityLiveableAreaCss,
  urbanDensityLiveableAreaMapCode,
  urbanDensityLiveableMetricsCode,
  urbanDensityMapCode,
  urbanDensityMetricsCode,
  urbanDensitySetupZ14TileFetcherCss,
  urbanDensityTurfInstallCode,
  createUrbanDensityMetricsCss,
} from './snippets'
import { createMapIframeCode } from './createAMapEmbed'

const tilejsonUrl = 'https://tiles.saanseoi.hk/hongkong-latest.json'
const styleUrl = 'https://api.saanseoi.hk/v0/styles/midnight/1.0.0.json'
const apiBaseUrl = 'https://api.saanseoi.hk'
const iframeReferenceCode = createMapIframeCode({
  height: { mode: 'fixed', pixels: 600 },
  title: 'My SaanSeoi map',
  url: 'https://your-map.example',
})

const codeBlock = (language: string, code: string) =>
  [`\`\`\`${language}`, code, '```'].join('\n')

const reference = (title: string, target: string, language: string, code: string) =>
  [`#### ${title}`, '', `Target: \`${target}\``, '', codeBlock(language, code)].join(
    '\n',
  )

const rendererReferences = (['maplibre', 'mapbox', 'leaflet'] as const).map(
  renderer => {
    const rendererReference = getCreateAMapRendererReference(renderer)
    return [
      `### ${rendererReference.label}`,
      '',
      reference(
        'Install the renderer',
        'saanseoi-project',
        'bash',
        rendererReference.installCommand,
      ),
      '',
      reference('Create the blank map', 'src/main.ts', 'ts', rendererReference.code),
      '',
      reference(
        'Reset the map styles',
        'src/style.css',
        'css',
        rendererReference.stylesheetCode,
      ),
    ].join('\n')
  },
)

const basemapReferences = (['maplibre', 'mapbox', 'leaflet'] as const).map(renderer => [
  `### ${getCreateAMapRendererReference(renderer).label}`,
  '',
  reference(
    'Add the SaanSeoi basemap',
    'src/main.ts',
    'ts',
    createAMapRendererBasemapCode(renderer, styleUrl, tilejsonUrl),
  ),
])

const styleReferences = (['maplibre', 'mapbox', 'leaflet'] as const).map(renderer =>
  [
    `### ${getCreateAMapRendererReference(renderer).label}`,
    '',
    'After applying the basemap reference, replace only its inline style setup with:',
    '',
    reference(
      'Update the SaanSeoi style',
      'src/main.ts',
      'ts',
      createAMapRendererStyleUpdateCode(renderer, styleUrl),
    ),
  ].join('\n'),
)

const geoJsonReferences = (['maplibre', 'mapbox', 'leaflet'] as const).map(renderer =>
  [
    `### ${getCreateAMapRendererReference(renderer).label}`,
    '',
    reference('Add GeoJSON', 'src/main.ts', 'ts', createGeoJsonImportCode(renderer)),
  ].join('\n'),
)

const createUrbanDensityReferences = (
  renderer: 'maplibre' | 'mapbox' | 'leaflet' = 'maplibre',
) => [
  reference(
    'Fetch District statistics',
    'src/main.ts',
    'ts',
    createUrbanDensityStatsCode(
      apiBaseUrl,
      'The cached land-analysis result is loaded when available; otherwise fetch the source statistics.',
    ),
  ),
  reference('Calculate Area density', 'src/main.ts', 'ts', urbanDensityCalculationCode),
  reference('Add the exclusion highlighter', 'src/main.ts', 'ts', urbanDensityMapCode),
  reference(
    'Add Area metrics',
    'src/style.css',
    'css',
    createUrbanDensityMetricsCss('dark'),
  ),
  reference('Add Area metrics', 'src/main.ts', 'ts', urbanDensityMetricsCode),
  reference(
    'Install geometry dependencies',
    'saanseoi-project',
    'bash',
    urbanDensityTurfInstallCode,
  ),
  reference(
    'Create the geometry Worker',
    'src/land-analysis.worker.ts',
    'ts',
    urbanDensityGeometryWorkerCode,
  ),
  reference(
    'Add the z14 tile fetcher and liveable-area analysis styles',
    'src/style.css',
    'css',
    [urbanDensitySetupZ14TileFetcherCss, urbanDensityLiveableAreaCss].join('\n\n'),
  ),
  reference(
    'Add the z14 tile fetcher and liveable-area analysis',
    'src/main.ts',
    'ts',
    [
      createUrbanDensitySetupZ14TileFetcherCode(renderer),
      urbanDensityCollectNonLiveableLandCode,
      urbanDensityLiveableAreaCode,
    ].join('\n\n'),
  ),
  reference(
    'Finalise liveable-density metrics and map layers',
    'src/main.ts',
    'ts',
    [urbanDensityLiveableMetricsCode, urbanDensityLiveableAreaMapCode].join('\n\n'),
  ),
]

const hostingReferences = (
  ['cloudflare', 'github-pages', 'vercel', 'netlify', 'other'] as const
).map(hosting =>
  (() => {
    const hostingLabel =
      hosting === 'cloudflare'
        ? 'Cloudflare Pages'
        : hosting === 'github-pages'
          ? 'GitHub Pages'
          : hosting === 'vercel'
            ? 'Vercel'
            : hosting === 'netlify'
              ? 'Netlify'
              : 'Another host'
    const accountUrl =
      hosting === 'cloudflare'
        ? 'https://dash.cloudflare.com/sign-up/workers-and-pages'
        : hosting === 'github-pages'
          ? 'https://github.com/signup'
          : hosting === 'vercel'
            ? 'https://vercel.com/signup'
            : hosting === 'netlify'
              ? 'https://app.netlify.com/signup'
              : undefined
    const sections = [`### ${hostingLabel} (\`hosting=${hosting}\`)`, '']

    if (accountUrl) {
      sections.push(
        `Create or sign in to the ${hostingLabel} account first: ${accountUrl}. Keep passwords, recovery codes and private credentials out of chat and source control.`,
        '',
      )
    } else {
      sections.push(
        'Use the hosting provider selected in the project decisions. Ask me for its name and consult its current official deployment documentation before running provider-specific commands.',
        '',
      )
    }

    if (hosting === 'github-pages') {
      sections.push(
        'Install Git and GitHub CLI using the commands for the operating system I selected; ignore the other operating-system commands.',
        '',
        reference(
          'Install Git and GitHub CLI (Linux: Debian/Ubuntu/Mint)',
          'saanseoi-project',
          'bash',
          'sudo apt install git gh',
        ),
        '',
        reference(
          'Install Git and GitHub CLI (Linux: Fedora/RHEL)',
          'saanseoi-project',
          'bash',
          'sudo dnf install git gh',
        ),
        '',
        reference(
          'Install Git and GitHub CLI (Linux: Arch/CachyOS)',
          'saanseoi-project',
          'bash',
          'sudo pacman -S git github-cli',
        ),
        '',
        reference(
          'Install Git and GitHub CLI (macOS)',
          'saanseoi-project',
          'bash',
          [
            '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
            'brew install git gh',
          ].join('\n'),
        ),
        '',
        reference(
          'Install Git and GitHub CLI (Windows PowerShell)',
          'saanseoi-project',
          'powershell',
          [
            'winget install --id Git.Git -e --source winget',
            'winget install --id GitHub.cli',
          ].join('\n'),
        ),
        '',
        reference(
          'Check Git and GitHub CLI',
          'saanseoi-project',
          'bash',
          ['git --version', 'gh --version'].join('\n'),
        ),
        '',
      )
    }

    if (hosting === 'other') {
      sections.push(
        reference(
          'Build the static site before provider setup',
          'saanseoi-project',
          'bash',
          'bun run build',
        ),
        '',
        'Follow the provider’s current official instructions to install its CLI (if it has one), authenticate and create or link the site. Use `dist` as the publish directory and configure `VITE_SAANSEOI_API_KEY` as a public build variable without uploading `.env`.',
        '',
      )
    } else {
      sections.push(
        reference(
          'Install the host tool',
          'saanseoi-project',
          'bash',
          getHostingInstallCode(hosting),
        ),
        '',
        reference(
          'Authenticate with the host',
          'saanseoi-project',
          'bash',
          hosting === 'cloudflare'
            ? 'bunx wrangler login'
            : hosting === 'github-pages'
              ? 'gh auth login --web'
              : hosting === 'vercel'
                ? 'bunx vercel login'
                : 'bunx netlify login',
        ),
        '',
      )
    }

    if (hosting === 'cloudflare') {
      sections.push(
        reference(
          'Configure Cloudflare Workers Static Assets',
          'saanseoi-project',
          'bash',
          'bunx wrangler setup',
        ),
        '',
        'When Wrangler detects Vite, type `N` (or press Enter) to keep the project name, `bun run build` build command, `dist` output directory and single-page-application fallback, then type `Y` (or press Enter) to proceed. This creates the Wrangler configuration and required Vite plugin. Configure `VITE_SAANSEOI_API_KEY` as a public build variable in the selected host settings; never upload `.env`.',
        '',
      )
    } else if (hosting === 'github-pages') {
      sections.push(
        reference(
          'Identify yourself to Git',
          'saanseoi-project',
          'bash',
          [
            'git config --global user.name "Your name"',
            'git config --global user.email "you@example.com"',
          ].join('\n'),
        ),
        '',
        reference(
          'Create and push the GitHub repository',
          'saanseoi-project',
          'bash',
          [
            'git init -b main',
            'git add .',
            'git commit -m "Publish my map"',
            'gh repo create saanseoi-project --public --source=. --push',
          ].join('\n'),
        ),
        '',
        'GitHub Pages uses `main` for source files and a separate `gh-pages` branch for built files. Keep `.env` ignored and configure any public build variable through the repository/host settings.',
        '',
      )
    } else if (hosting === 'vercel') {
      sections.push(
        reference(
          'Create and link the Vercel project',
          'saanseoi-project',
          'bash',
          'bunx vercel link --yes --project saanseoi-project',
        ),
        '',
        'Accept Vercel’s detected Vite settings: build command `bun run build`, output directory `dist`, and a public `VITE_SAANSEOI_API_KEY` build variable. Never upload `.env`.',
        '',
      )
    } else if (hosting === 'netlify') {
      sections.push(
        reference(
          'Create and link the Netlify project',
          'saanseoi-project',
          'bash',
          'bunx netlify sites:create --name saanseoi-project',
        ),
        '',
        'Use `bun run build` as the build command and `dist` as the publish directory. Configure `VITE_SAANSEOI_API_KEY` as a public build variable in Netlify’s site settings; never upload `.env`.',
        '',
      )
    }

    sections.push(
      ...(hosting === 'other'
        ? []
        : [
            reference(
              'Build the production site',
              'saanseoi-project',
              'bash',
              'bun run build',
            ),
            '',
          ]),
      reference(
        hosting === 'other' ? 'Publish the dist folder' : 'Build and publish',
        'saanseoi-project',
        'bash',
        hosting === 'other'
          ? '# Upload the contents of dist/ using the provider’s documented command.'
          : createDeploymentCode(hosting),
      ),
      '',
      hosting === 'github-pages'
        ? 'After `Published`, wait for the repository’s Pages build and deployment Action to finish. Open the resulting `https://YOUR_GITHUB_USER_NAME.github.io/saanseoi-project/` URL in an incognito/private window.'
        : hosting === 'cloudflare'
          ? 'On the first Wrangler deployment, type `Y` (or press Enter) to register a `workers.dev` subdomain, choose a unique subdomain, and confirm it. Use the resulting HTTPS URL in an incognito/private window after DNS settles.'
          : hosting === 'vercel'
            ? 'Use the stable `Production` alias printed by Vercel, not the temporary deployment inspection URL, and open it in an incognito/private window.'
            : hosting === 'netlify'
              ? 'Use Netlify’s `Production URL`, not the unique deploy URL. If a private-window visit asks for sign-in, set the site’s visitor access to public before embedding or sharing it.'
              : hosting === 'other'
                ? 'Open the provider’s stable HTTPS URL in an incognito/private window and confirm the map, basemap, data and interactions work without an account.'
                : 'Use the stable production URL printed by the host (not a deployment-inspection URL), then open it in an incognito/private window to confirm the map is public.',
    )

    return sections.join('\n')
  })(),
)

const projectSetupReferences = [
  '#### Linux',
  '',
  reference('Check Bun', '~', 'bash', 'bun --version'),
  '',
  reference(
    'Install Bun only when unavailable',
    '~',
    'bash',
    'curl -fsSL https://bun.sh/install | bash',
  ),
  '',
  reference('Create the project directory', '~', 'bash', 'mkdir saanseoi-project'),
  '',
  reference('Enter the project directory', '~', 'bash', 'cd saanseoi-project'),
  '',
  reference(
    'Create the Vite project',
    '~/saanseoi-project',
    'bash',
    'bun create vite . --template vanilla-ts --no-immediate --interactive',
  ),
  '',
  reference('Install project packages', '~/saanseoi-project', 'bash', 'bun install'),
  '',
  '#### macOS',
  '',
  reference('Check Bun', '~', 'bash', 'bun --version'),
  '',
  reference(
    'Install Bun only when unavailable',
    '~',
    'bash',
    'curl -fsSL https://bun.sh/install | bash',
  ),
  '',
  reference('Create the project directory', '~', 'bash', 'mkdir saanseoi-project'),
  '',
  reference('Enter the project directory', '~', 'bash', 'cd saanseoi-project'),
  '',
  reference(
    'Create the Vite project',
    '~/saanseoi-project',
    'bash',
    'bun create vite . --template vanilla-ts --no-immediate --interactive',
  ),
  '',
  reference('Install project packages', '~/saanseoi-project', 'bash', 'bun install'),
  '',
  '#### Windows PowerShell',
  '',
  reference('Check Bun', '~', 'powershell', 'bun --version'),
  '',
  reference(
    'Install Bun only when unavailable',
    '~',
    'powershell',
    'irm bun.sh/install.ps1 | iex',
  ),
  '',
  reference(
    'Create and enter the project directory',
    '~',
    'powershell',
    [
      'New-Item -ItemType Directory -Name saanseoi-project',
      'Set-Location saanseoi-project',
    ].join('\n'),
  ),
  '',
  reference(
    'Create the Vite project',
    '~\\saanseoi-project',
    'powershell',
    'bun create vite . --template vanilla-ts --no-immediate --interactive',
  ),
  '',
  reference(
    'Install project packages',
    '~\\saanseoi-project',
    'powershell',
    'bun install',
  ),
  '',
  '#### Start the development server',
  '',
  '##### Linux',
  '',
  reference('Start Vite', '~/saanseoi-project', 'bash', 'bun dev -- --host 0.0.0.0'),
  '',
  '##### macOS',
  '',
  reference('Start Vite', '~/saanseoi-project', 'bash', 'bun dev -- --host 0.0.0.0'),
  '',
  '##### Windows PowerShell',
  '',
  reference(
    'Start Vite',
    '~\\saanseoi-project',
    'powershell',
    'bun dev -- --host 0.0.0.0',
  ),
]
  .join('\n\n')
  .replace(
    /^#### (?!Linux$|macOS$|Windows PowerShell$|Start the development server)/gm,
    '##### ',
  )
  .replace(/^##### Start Vite$/gm, '###### Start Vite')

/** Inline code references used by the corresponding guide sections. */
export const createAMapLlmRendererReferences = () => rendererReferences.join('\n\n')
export const createAMapLlmBasemapReferences = () =>
  basemapReferences.map(references => references.join('\n')).join('\n\n')
export const createAMapLlmStyleReferences = () => styleReferences.join('\n\n')
export const createAMapLlmExistingDataReferences = () => geoJsonReferences.join('\n\n')
export const createAMapLlmUrbanDensityReferences = (
  renderer?: 'maplibre' | 'mapbox' | 'leaflet',
) => {
  const renderers = renderer ? [renderer] : (['maplibre', 'mapbox', 'leaflet'] as const)
  return renderers
    .map(selectedRenderer =>
      [
        `### ${getCreateAMapRendererReference(selectedRenderer).label}`,
        '',
        createUrbanDensityReferences(selectedRenderer).join('\n\n'),
      ].join('\n'),
    )
    .join('\n\n')
}
export const createAMapLlmHostingReferences = () => hostingReferences.join('\n\n')
export const createAMapLlmProjectSetupReferences = () => projectSetupReferences
export const createAMapLlmIframeReference = () =>
  [
    '#### Embed preparation',
    '',
    'Embedding requires a real public HTTPS map URL. Ask me for that URL, an accessible title, and either a fixed height (240–1600 pixels) or a parent-fill frame. Preview the URL first; an iframe cannot be tested until the map has been deployed.',
    '',
    '#### Create the embed code',
    '',
    '1. Ask me to paste the public HTTPS address printed after deployment. Do not send it to SaanSeoi or store it; use it only to generate the code.',
    '2. Ask for a descriptive accessible title. Screen readers use the title to explain what the iframe contains; use `Interactive map` only as a fallback.',
    '3. Ask whether the frame should have a fixed height or fill its parent. For a fixed height, use 240–1600 pixels. For fill height, remind me that the destination page must give the parent an explicit height or the iframe can collapse.',
    '4. Preview the published map, pan and zoom it, and only then copy the complete iframe below. The width follows its container, lazy loading avoids downloading an off-screen map immediately, and fullscreen permission enables a fullscreen control.',
    '',
    reference(
      'Iframe template',
      'website page editor',
      'html',
      iframeReferenceCode,
    ).replace('#### Iframe template', '##### Iframe template'),
    '',
    'The template keeps the map responsive, lazy-loads it, permits fullscreen, and uses a strict cross-origin referrer policy. Preserve the URL, title, dimensions and attributes unless the selected editor requires a documented adjustment.',
    '',
    '#### Website editor options',
    '',
    '##### WordPress',
    '',
    'Ask whether this is self-hosted WordPress or WordPress.com. Use a **Custom HTML** block and consult https://wordpress.com/support/wordpress-editor/blocks/custom-html-block/. Warn that WordPress.com on the free plan may not allow iframe embeds; check the current plan restrictions before troubleshooting the code.',
    '',
    '##### Squarespace',
    '',
    'Add a **Code Block**, paste the iframe, preview the page, then publish; consult https://support.squarespace.com/hc/en-us/articles/206543167-Code-blocks.',
    '',
    '##### Wix',
    '',
    'Add an **Embed HTML element**, paste the iframe, resize it to the chosen height, preview and publish; consult https://support.wix.com/en/article/wix-editor-embedding-a-site-or-a-widget.',
    '',
    '##### Webflow',
    '',
    'Add a **Code Embed element**, paste the iframe, save, preview and publish; consult https://help.webflow.com/hc/en-us/articles/33961234953107-Custom-code-embed.',
    '',
    '##### Other',
    '',
    'Ask me which site editor I use, then look up its latest official HTML/embed instructions before telling me where to paste the iframe.',
    '',
    '#### Placement and verification',
    '',
    'Guide me one small step at a time: open the page editor, add the platform element, paste the complete iframe, preview the page, then publish or update it. Ask me to report what I see after adding and previewing the embed, and remain available for troubleshooting. Make clear that the public map URL is the shareable link and that the surrounding site may not restyle or directly control a cross-origin iframe.',
    '',
    '- If the map itself will not load, open its exact HTTPS URL in a private window first. Check deployment completion, redirects, sign-in or access protection, mixed HTTP content, CSP `frame-ancestors` and `X-Frame-Options`.',
    '- For GitHub Pages, wait for the Pages build Action to finish and use the project URL with its repository base path. For Vercel use the stable **Production** alias, not a temporary Preview URL. For Netlify use the **Production URL** and make visitor access public. For Cloudflare, use the deployed `workers.dev` URL after DNS settles.',
    '- If the editor removes or rejects the iframe, check its plan and security policy. WordPress.com free plans can disallow iframe tags; self-hosted WordPress may have a role or security plug-in filter; ask the site administrator or platform support rather than changing a working map URL.',
  ].join('\n')

const instructions = `
## Code and command references

The following are the same implementation references exposed by the guide’s progressive
prompt cards. They are canonical examples for a Hong Kong, MapLibre and Midnight setup.
Use the decision ledger to substitute the selected region, renderer, style, host and
operating-system-specific paths. Adapt them to the actual project rather than blindly
replacing unrelated code.

### Project setup references

${projectSetupReferences}

## Renderer references

${rendererReferences.join('\n\n')}

## Basemap and style references

${basemapReferences.join('\n\n')}

${styleReferences.join('\n\n')}

Every basemap and style reference reads the public key from
\`import.meta.env.VITE_SAANSEOI_API_KEY\`, URL-encodes it and sends it as
\`access_token\`. Ask the user to create or retrieve that key at
https://saanseoi.hk/api-keys, then ask them to provide the resulting \`pk.\` key so you
can configure the local environment. Never log or commit it.

## Existing-data renderer references

${geoJsonReferences.join('\n\n')}

For non-GeoJSON input, first convert it to valid \`features.geojson\` while preserving
the source, schema and coordinates. Do not invent missing values.

## Urban-density references

${createAMapLlmUrbanDensityReferences()}

Apply the urban-density references in this order: fetch and inspect source statistics;
calculate Area metrics; add the metrics and District overlays; add the exclusion
highlighter; install and run the one-time z14 geometry analysis; then use the saved
\`src/land-analysis.json.gz\` result to finalise the map. A chat LLM should present one
reference at a time and wait for the user’s report. An agentic LLM may apply adjacent
references in one change when no user decision is needed, but must verify the visible
result.

## Publishing references

${hostingReferences.join('\n\n')}

Use the selected host’s current official documentation for authentication and project
configuration. Configure \`VITE_SAANSEOI_API_KEY\` in the host’s public build settings,
build and smoke-test locally, ask for confirmation, then authenticate and deploy.

## Embed references

${createAMapLlmIframeReference()}
`

export const createAMapLlmReferenceInstructions = () => instructions
