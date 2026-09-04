import { mapStyleDefinitions } from '@repo/basemap'
import {
  createAMapLlmBasemapReferences,
  createAMapLlmExistingDataReferences,
  createAMapLlmHostingReferences,
  createAMapLlmIframeReference,
  createAMapLlmProjectSetupReferences,
  createAMapLlmRendererReferences,
  createAMapLlmStyleReferences,
  createAMapLlmUrbanDensityReferences,
} from './createAMapLlmReferenceInstructions'

const guideFlowReferences = (references: string) =>
  references.replace(/^#### /gm, '##### ').replace(/^### /gm, '#### ')

const guideFlowNestedReferences = (references: string) =>
  references.replace(/^#### /gm, '###### ').replace(/^### /gm, '##### ')

const styleOptions = ['custom', ...mapStyleDefinitions.map(style => style.id)].join(
  ', ',
)

const instructions = `
## Decision matrix and order

Keep a decision ledger throughout the interaction. Record the human-readable choice,
its machine value and its guide URL parameter. Do not ask again for a decision that is
already present in the initial prompt or ledger. Ask one decision at a time, in this
order, and only ask conditional questions when their parent choice requires them. Use
this matrix as a lookup for the relevant point in the guide, not as a questionnaire to
complete all at once: ask each decision only when its section needs it, and do not ask
about later sections early.

### 1. Destination

Ask: “Where do you want your map to be available?”

| Choice | Value | URL parameter |
| --- | --- | --- |
| On my computer — a private prototype or local setup | \`local\` | \`objective=local\` |
| Online with a link — a map people can visit in a browser | \`web\` | \`objective=web\` |
| Embedded in a site — a map inside an existing site or web app | \`web-embed\` | \`objective=web-embed\` |

### 2. Infer the handover mode

This document is reached from the full-handover route, so \`llm-mode=handover\` is
already established. Do not ask the user to choose between “I’ll be hands on”, “Build
it with me” and “Set it up for me”.

Infer the AI route from the environment in which you are running:

- If you are an agentic LLM with permission to inspect and edit project files, record
  \`ai-access=agentic\`. You are the working agent; do not ask the user to choose an
  agent tool, VPN access, terminal experience, or code editor. Inspect the operating
  system and shell only when needed to adapt commands. The user is expected to read and
  manipulate files through the agent interface.
- If you are a non-agentic LLM without project-file access, record \`ai-access=web\`.
  You are the chat guide; do not ask the user to choose a Chat AI service or VPN. Ask
  only for the environment decisions needed to give accurate local instructions.

The agent or chat service identity is not a new user decision in a full handover.

### 3. Working environment

For a non-agentic LLM, establish these in order:

1. Operating system: Windows (\`os=windows\`), macOS (\`os=macos\`), or Linux
   (\`os=linux\`). An agent should inspect this rather than ask the user to identify it.
2. Terminal experience: None (\`terminal=none\`), Basic (\`terminal=basic\`), or
   Advanced (\`terminal=advanced\`).
3. Code editor: Zed (\`editor=zed\`), VS Code (\`editor=vscode\`), Sublime Text
   (\`editor=sublime-text\`), Cursor (\`editor=cursor\`), or Other (\`editor=other\`).

For an agentic LLM, inspect the operating system and shell when commands depend on them,
but do not ask for terminal experience or code-editor selection. The user is expected to
read and manipulate files through the agent interface, so editor setup is not part of
the agentic handover.

### 4. Destination-specific platform

Ask only the branch that matches the destination:

- For Online with a link, ask for hosting: Cloudflare (\`hosting=cloudflare\`), GitHub
  Pages (\`hosting=github-pages\`), Vercel (\`hosting=vercel\`), Netlify
  (\`hosting=netlify\`), or Another host (\`hosting=other\`). Prefer Cloudflare,
  unless the user already has or wants GitHub, when GitHub Pages is the better default.
- For Embedded in a site, ask for the website platform first: WordPress
  (\`website=wordpress\`), Squarespace (\`website=squarespace\`), Wix
  (\`website=wix\`), Webflow (\`website=webflow\`), or Another platform
  (\`website=other\`). Then ask the hosting question above. Another platform has no
  built-in iframe recipe; consult its current official documentation.

### 5. Map foundations

After the project route is known, ask in this order:

1. Mapping library: MapLibre (\`renderer=maplibre\`), Mapbox GL JS
   (\`renderer=mapbox\`), or Leaflet (\`renderer=leaflet\`). Recommend MapLibre for
   styled vector-tile analysis maps and full control over data and visual style.
2. SaanSeoi basemap coverage: Hong Kong (\`region=hk\`), Macau (\`region=mo\`), or
   Greater Bay Area (\`region=gba\`).
3. Style: Custom (\`style=custom\`) or one of the current SaanSeoi style IDs
   (\`${styleOptions}\`). Recommend \`midnight\`, but accept a different style or a
   visual direction for a custom style. Show the preview images before asking me to
   choose: use the guide’s image URL pattern
   \`https://tiles.saanseoi.hk/render/{region}/{tileset}-latest-{style}-{viewpoint}-z16.webp\`,
   substituting \`hk\`, \`mo\` or \`gba\` for the region; \`hongkong\`, \`macau\` or
   \`gba\` for the tileset; and \`central\`, \`senado-square\` or \`canton-tower\` for
   the matching viewpoint. For each built-in style, render its preview as an image the
   user can see (for example,
   \`https://tiles.saanseoi.hk/render/hk/hongkong-latest-midnight-central-z16.webp\`).
   If I give a visual direction, treat it as the custom option: create or adapt a valid
   MapLibre style in the project, keep the SaanSeoi source named \`basemap\`, and verify
   the result visually. An agentic LLM should implement the style changes; a web chat
   should provide the exact file changes for me to apply.
4. Data source: ask which of these three paths I want, using the guide’s labels and
   descriptions: SaanSeoi Population Density Project — the guided SaanSeoi API example
   (\`data=api\`); Data I already have — upload my own dataset for conversion and mapping
   (\`data=existing\`); or Craft a custom map — review and source data with the LLM before
   creating a layer (\`data=llm\`). The custom-map option is available in the guide’s
   LLM-assisted routes.
5. If Existing data is selected, ask me to upload the file to this chat. An agentic LLM
   may instead ask me to place it in the project root and then inspect it there. Identify
   the format, schema, coordinate reference system and other relevant details from the
   file itself before choosing a conversion path; preserve the original and do not
   invent missing values.

Once a decision is recorded, use its value consistently in code, explanations and any
handback URL. Do not invent a choice that is not in this matrix.

## Guide Flow

Follow these sections in order. Use the decision matrix only at the point where a
section needs a choice; do not ask later-section questions early. An agentic LLM may
implement adjacent sections when no user decision is needed, but must explain and verify
each one. A non-agentic LLM must provide one safe action at a time, name its exact
terminal or editor target, wait for the user’s report, and only then continue.

## Prerequisites and project setup

### Section Goal

Create a safe Bun + TypeScript Vite foundation in \`/path/to/saanseoi-project\` and
visually verify the default Vite page before introducing map code or credentials.

### Section Guidance

We start with a small, empty project so every later map step has a dependable home. First
we open that starter page and make sure it works; once it does, we can safely add SaanSeoi
and the map features without having to untangle several changes at once.

### Code References

${createAMapLlmProjectSetupReferences()}

## Render the map

### Section Goal

Install only the selected mapping library, create a responsive blank map at the selected
region’s opening position, and confirm that it renders in the browser.

### Section Guidance

An empty map gives us a clear first look at the mapping library we chose. We can confirm
that the map appears and responds before adding real places, colours or data, so it is easy
to tell which part needs attention if something looks wrong.

### Code References

${guideFlowReferences(createAMapLlmRendererReferences())}

## Add the SaanSeoi basemap

### Section Goal

Connect the selected regional SaanSeoi vector TileJSON to the working renderer with the
URL-encoded public \`pk.\` key and verify that the basemap loads.

### Section Guidance

Now we give the empty map its real geography. The SaanSeoi key lets the browser request the
map tiles, and the finished basemap gives us the Hong Kong, Macau or GBA context on which
our own information will sit. We check that it loads before changing its appearance.

### Code References

${guideFlowReferences(createAMapLlmBasemapReferences())}

## Choose a style

### Section Goal

Apply the selected SaanSeoi style, or implement the user’s visual direction as a valid
custom style, while keeping the vector-tile source compatible with the renderer.

### Section Guidance

This is where the map starts to feel like yours. We look at the available previews,
recommend **midnight** as a strong starting point, or shape a custom look from your visual
direction. We then check the finished map so the colours and labels remain easy to read.

### Code References

${guideFlowReferences(createAMapLlmStyleReferences())}

## Add data

### Section Goal

Turn the working basemap into a purposeful map by taking exactly one of three explicit
paths: the SaanSeoi Population Density Project, Data I already have, or Craft a custom
map. Do not begin a path’s prompts until the user selects it.

### Section Guidance

This is the crossroads where the basemap becomes your map. You can follow the population-
density story, bring a dataset you already have, or describe the data you would like and
let the LLM help find and prepare it. Whichever path you choose, we keep the source of the
information clear and explain any one-time analysis so you know what the map is showing.

Offer these paths using the guide’s labels and begin only the selected path:

1. **SaanSeoi Population Density Project** (\`data=api\`) — follow the guided example,
   using the SaanSeoi District statistics and the liveable-area analysis to build the
   explanatory overlays, metrics and cards.
2. **Data I already have** (\`data=existing\`) — upload the file to the chat, or (for an
   agentic LLM) place it in the project root for inspection. Establish its schema, source,
   coordinate reference system and intended display, convert it to valid GeoJSON when
   needed, and add a clear accessible layer with an appropriate legend or popup.
3. **Craft a custom map** (\`data=llm\`) — tell me what I want to show with the selected
   Hong Kong, Macau or GBA basemap and which data sources I am considering. Review the
   available sources with me, help locate or obtain suitable data, check its licence and
   format, convert or create valid GeoJSON, and then add and style the layer. Establish
   the story, audience, locations, geometry, attributes, source and interaction before
   creating anything; never fabricate data. If publishing is part of my selected
   objective, check the selected host’s current asset-size limit before adding the file
   and prepare it for that host only after I confirm the result.

For the worked urban-density example, use the District-level 2024
\`populationMidYear\` and \`landArea\` values from \`/stats/v0.1/geographies\`, show the
returned data for inspection, aggregate by Area, calculate density defensively, add
the three summary cards and coloured District overlays, identify excluded land-use
polygons, calculate liveable land once in a geometry Worker, save
\`src/land-analysis.json.gz\`, and finish with the cached liveable-density overlays and
cards. Keep source values separate from derived values and record releases and reference
years.

The liveable-area calculation is deliberately a prompt/response cycle. First offer the
prepared \`land-analysis.json.gz\` download. If it is absent, explain the one-time
calculation, install the geospatial packages, create the Worker, add the styles and
analysis code, then ask the user to inspect the download. A chat LLM waits for the user
to place the file and confirm it; an agentic LLM may inspect the workspace and move an
existing file into place, but must not silently replace its contents.

### Code References

Use only the references for the selected data path and mapping library.

#### SaanSeoi Population Density Project

${guideFlowNestedReferences(createAMapLlmUrbanDensityReferences())}

#### Data I already have

${guideFlowNestedReferences(createAMapLlmExistingDataReferences())}

#### Craft a custom map

The custom path begins by establishing the story, audience, geography, attributes,
sources, licence and interaction. Create or obtain the agreed data as valid GeoJSON and
adapt the existing-data renderer reference only after those decisions are confirmed.

##### MapLibre

Use the MapLibre existing-data reference after the custom source is approved.

##### Mapbox GL JS

Use the Mapbox GL JS existing-data reference after the custom source is approved.

##### Leaflet

Use the Leaflet existing-data reference after the custom source is approved.

## Publish the map

### Section Goal

Produce a browser-ready static build, configure the selected host, deploy it, and verify
the stable public URL in a private window before calling the map public.

### Section Guidance

When the map is ready, we prepare a shareable version that your chosen hosting service can
show to anyone. We check the finished map privately first, then send it to the host and
find the stable link you can share. You remain in control of account, payment and
publishing decisions throughout. Enter this section only when my destination is online or
an embedded site; for a local destination, congratulate me on the finished map and stop
before asking about a host.

### Code References

Use only the references for the selected host and operating system. Host commands shown
without a nested OS heading are cross-platform Bun commands; GitHub Pages has explicit
Linux, macOS and Windows PowerShell installation subsections, so use only the one matching
my system.

${guideFlowReferences(createAMapLlmHostingReferences())}

## Embed the map

### Section Goal

Place the published map inside the selected site editor with an accessible, responsive
iframe, then preview and publish the containing page.

### Section Guidance

Once the map has a public link, we can place it inside your chosen website. The map remains
its own interactive page, so we give it a clear title and a comfortable height, preview it
in the site editor, and then publish the page. The surrounding site cannot directly change
the map’s colours, but it can display it reliably through the iframe. Enter this section
only when my destination is an embedded site; do not ask embedding questions for a local
or link-only destination. The hand-off rule is:
do not rely on the guide UI to compose the iframe; use the generated code reference below.

### Code References

${createAMapLlmIframeReference()}
`

export const createAMapLlmDecisionMatrixInstructions = () => instructions
