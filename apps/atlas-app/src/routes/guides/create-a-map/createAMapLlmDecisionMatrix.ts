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
   I can see (for example,
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

Before I choose, explain that the mapping library is the foundation for everything that
follows: it draws the geography, receives our data layers and controls how people pan,
zoom and interact with the map. Explain the two common source types in plain language:
raster tiles are ready-made pictures that are simple to display but difficult to restyle,
while vector tiles are shape data that stay sharp and can be restyled, animated and made
interactive.

Then explain the trade-offs between the three choices in the guide:

- **MapLibre** is the recommended open-source option for this project. It is designed for
  vector tiles, gives me full control over SaanSeoi data and visual style, and has a strong
  community and broad plugin ecosystem. It is the best fit for a styled analysis map.
- **Mapbox GL JS** is closely related to MapLibre and also works with vector tiles. It adds
  polished managed services such as hosted basemaps and geocoding, but requires a Mapbox
  account and public access token and ties some features to Mapbox’s service and pricing
  rules.
- **Leaflet** is lightweight and straightforward, with a wide plugin ecosystem and a
  natural fit for raster tiles or simple GeoJSON maps. It offers less built-in control for
  SaanSeoi vector styling, so this guide uses its MapLibre compatibility layer when Leaflet
  is selected.

Recommend MapLibre, but ask me which library I want and respect my choice. Start with an
empty map so I can confirm the foundation works before we add the SaanSeoi basemap, style,
places or analysis data.

### Code References

${guideFlowReferences(createAMapLlmRendererReferences())}

## Add the SaanSeoi basemap

### Section Goal

Connect the selected regional SaanSeoi vector TileJSON to the working renderer with the
URL-encoded public \`pk.\` key and verify that the basemap loads.

### Section Guidance

Explain that a basemap gives people their bearings: roads, place names and boundaries
provide the recognisable setting beneath the information we add. SaanSeoi supplies this
as vector data, so the map can stay sharp at different zoom levels and we can change its
style later rather than being locked to a ready-made image.

Ask which coverage fits my story. **Hong Kong** is the focused city view, **Macau** is the
dedicated Macao view, and **Greater Bay Area** combines Hong Kong and Macau with the nine
mainland municipalities for a wider regional map. Explain that the selected coverage
changes the geography and opening view, not the rest of the project.

Then explain that a SaanSeoi account and public API key are needed so the service can make
the free tile access accountable. The key is designed to be used by browser code, so we
will place it in the local environment and pass it with tile requests; we must never log
or commit it. Verify that the chosen basemap loads before changing its appearance.

### Code References

${guideFlowReferences(createAMapLlmBasemapReferences())}

## Choose a style

### Section Goal

Apply the selected SaanSeoi style, or implement the user’s visual direction as a valid
custom style, while keeping the vector-tile source compatible with the renderer.

### Section Guidance

Explain that a style is the set of visual rules that turns the basemap’s data into a
readable hierarchy: it decides which roads, labels and boundaries stand out, how layers
are ordered, and what mood the map has. The same places can therefore support a quiet
data-visualisation style or a more atmospheric narrative style without changing the data.

Show the available preview images before asking me to choose. The built-in **Light** and
**Dark** styles are dependable general-purpose choices; **White**, **Grayscale** and
**Black** are calmer data-visualisation options; and **Midnight** is the recommended
narrative style with a dark, distinctive SaanSeoi look. A built-in style is quick and
already compatible with the basemap. **Custom** gives me the most control, but requires a
clear visual direction and a completed MapLibre style source or URL that can be checked
for readable labels and the \`basemap\` source.

Recommend **Midnight**, while respecting my choice. After applying it, show me the map so
I can check contrast, labels and the overall feel before we add data.

### Code References

${guideFlowReferences(createAMapLlmStyleReferences())}

## Add data

### Section Goal

Turn the working basemap into a purposeful map by taking exactly one of three explicit
paths: the SaanSeoi Population Density Project, Data I already have, or Craft a custom
map. Do not begin a path’s prompts until the user selects it.

### Section Guidance

This is the crossroads where the basemap becomes my map. I can follow the population
density story, bring a dataset I already have, or describe the data I would like and let
the LLM help find and prepare it. Whichever path I choose, keep the source of the
information clear and explain any one-time analysis so I know what the map is showing.

Explain the trade-offs before I choose: the guided SaanSeoi project is the most structured
route and demonstrates a complete, reproducible analysis; existing data is the quickest
way to map information I already trust, but it may need checking or conversion; and the
custom route is best when I know the story or sources I want but need help finding or
shaping the data first.

Offer these paths using the guide’s labels and begin only the selected path:

1. **SaanSeoi Population Density Project** (\`data=api\`) — follow the guided example,
   using the SaanSeoi District statistics and the liveable-area analysis to build the
   explanatory overlays, metrics and cards. Use the District-level 2024
   \`populationMidYear\` and \`landArea\` values from \`/stats/v0.1/geographies\`, show
   the returned data for inspection, aggregate by Area, calculate density defensively,
   add the three summary cards and coloured District overlays, identify excluded land-use
   polygons, calculate liveable land once in a geometry Worker, save
   \`src/land-analysis.json.gz\`, and finish with the cached liveable-density overlays and
   cards. Keep source values separate from derived values and record releases and reference
   years.

   The liveable-area calculation is deliberately a prompt/response cycle. First offer the
   prepared \`land-analysis.json.gz\` download. If it is absent, explain the one-time
   calculation, install the geospatial packages, create the Worker, add the styles and
   analysis code, then ask me to inspect the download. A chat LLM waits for me to place the
   file and confirm it; an agentic LLM may inspect the workspace and move an
   existing file into place, but must not silently replace its contents.
2. **Data I already have** (\`data=existing\`) — upload the file to the chat, or (for an
   agentic LLM) place it in the project root for inspection. Establish its schema, source,
   coordinate reference system and intended display, convert it to valid GeoJSON when
   needed, and add a clear accessible layer with an appropriate legend or popup.
3. **Craft a custom map** (\`data=llm\`) — tell me what I want to show with the selected
   Hong Kong, Macau or GBA basemap and which data sources I am considering. Review the
   available sources with me, help locate or obtain suitable data, check its
   format, convert or create valid GeoJSON, and then add and style the layer. Establish
   the story, audience, locations, geometry, attributes, source and interaction before
   creating anything; never fabricate data. If publishing is part of my selected
   objective, check the selected host’s current asset-size limit before adding the file
   and prepare it for that host only after I confirm the result.

### Code References

Use only the references for the selected data path and mapping library.

#### SaanSeoi Population Density Project

${guideFlowNestedReferences(createAMapLlmUrbanDensityReferences())}

#### Data I already have

${guideFlowNestedReferences(createAMapLlmExistingDataReferences())}

#### Craft a custom map

The custom path begins by establishing the story, audience, geography, attributes,
sources and interaction. Create or obtain the agreed data as valid GeoJSON and
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

When the map is ready, we prepare a shareable version that my chosen hosting service can
show to anyone. We check the finished map privately first, then send it to the host and
find the stable link I can share. I remain in control of account, payment and
publishing decisions throughout. Enter this section only when my destination is online or
an embedded site; for a local destination, congratulate me on the finished map and stop
before asking about a host.

Explain that publishing turns the browser-ready \`dist\` files into a public static site.
This project does not need a back-end server, which keeps the setup lightweight and makes
services such as Cloudflare Pages, GitHub Pages, Vercel and Netlify practical. Cloudflare
is the simplest default for static assets; GitHub Pages is useful when the project should
live with a GitHub repository but needs a repository base path and a separate build branch;
Vercel and Netlify provide managed deployment workflows; another host is fine when I
already have one, but its current documentation and asset limits must be checked.

Build and smoke-test the finished map before any account-linked command. Keep credentials
private, configure only the public SaanSeoi build variable on the selected host, and use
the stable production URL—not a temporary deployment address—as the link people share.

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

Once the map has a public link, we can place it inside my chosen website. The map remains
its own interactive page, so we give it a clear title and a comfortable height, preview it
in the site editor, and then publish the page. The surrounding site cannot directly change
the map’s colours, but it can display it reliably through the iframe. Enter this section
only when my destination is an embedded site; do not ask embedding questions for a local
or link-only destination. The hand-off rule is:

do not rely on the guide UI to compose the iframe.

Explain that an iframe is the portable option: it lets an existing site display the
published map without rebuilding the map inside that site, while keeping the map’s own
controls and styles intact. The trade-off is that a cross-origin iframe cannot be restyled
or directly controlled by the surrounding page, so the public map must already be usable
on its own. Ask which site editor I use before giving placement instructions; WordPress,
Squarespace, Wix and Webflow each provide a different HTML or embed element, and another
platform requires its current official documentation. For WordPress, check whether the
site is self-hosted or WordPress.com and warn that the free WordPress.com plan may block
iframe HTML. Preview the published URL in the editor before asking me to publish the page.

Use the generated code reference below.

### Code References

${createAMapLlmIframeReference()}
`

export const createAMapLlmDecisionMatrixInstructions = () => instructions
