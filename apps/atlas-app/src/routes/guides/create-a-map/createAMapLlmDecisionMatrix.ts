import { mapStyleDefinitions } from '@repo/basemap'

const styleOptions = ['custom', ...mapStyleDefinitions.map(style => style.id)].join(
  ', ',
)

const instructions = `
## Decision matrix and order

Keep a decision ledger throughout the interaction. Record the human-readable choice,
its machine value and its guide URL parameter. Do not ask again for a decision that is
already present in the initial prompt or ledger. Ask one decision at a time, in this
order, and only ask conditional questions when their parent choice requires them.

### 1. Destination

Ask: “Where do you want your map to be available?”

| Choice | Value | URL parameter |
| --- | --- | --- |
| On my computer — a private prototype or local setup | \`local\` | \`objective=local\` |
| Online with a link — a map people can visit in a browser | \`web\` | \`objective=web\` |
| Embedded in a site — a map inside an existing site or web app | \`web-embed\` | \`objective=web-embed\` |
| Embedded in a mobile app — a native Android or iOS mapping experience | \`mobile-embed\` | \`objective=mobile-embed\` |
| In a Jupyter Notebook — an interactive map alongside analysis | \`notebook-embed\` | \`objective=notebook-embed\` |

The mobile and notebook choices are currently marked “Coming soon” in the guide. Do not
silently substitute the browser workflow for them; explain the limitation and ask
whether the user wants to stop or continue with an explicitly agreed alternative.

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

The agent or chat service identity is not a new user decision in a full handover. If an
account or paid plan for the current LLM is needed, send the user to that service’s
official setup page and stop for confirmation before a paid action. For SaanSeoi account
creation, send the user to https://saanseoi.hk/sign-up.

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
- For Embedded in a mobile app, ask for MapLibre Native (\`mobile-library=maplibre-native\`)
  and then Android (\`mobile-platform=android\`), iOS (\`mobile-platform=ios\`), or
  Other (\`mobile-platform=other\`).
- For a Jupyter Notebook, ask for MapLibre Jupyter (\`notebook-library=maplibre-jupyter\`)
  or Folium (\`notebook-library=folium\`), then Local (\`notebook-runtime=local\`),
  Colab (\`notebook-runtime=colab\`), or JupyterHub (\`notebook-runtime=jupyterhub\`).

### 5. Map foundations

After the project route is known, ask in this order:

1. Mapping library: MapLibre (\`renderer=maplibre\`), Mapbox GL JS
   (\`renderer=mapbox\`), or Leaflet (\`renderer=leaflet\`). Recommend MapLibre for
   styled vector-tile analysis maps and full control over data and visual style.
2. SaanSeoi basemap coverage: Hong Kong (\`region=hk\`), Macau (\`region=mo\`), or
   Greater Bay Area (\`region=gba\`).
3. Style: Custom (\`style=custom\`) or one of the current SaanSeoi style IDs
   (\`${styleOptions}\`). For a custom style, ask for the desired visual direction and
   completed style source or URL.
4. Data source: Existing data (\`data=existing\`), SaanSeoi API data
   (\`data=api\`), or LLM-shaped data (\`data=llm\`). The LLM option is available in
   the guide’s LLM-assisted routes.
5. If Existing data is selected, ask for its format: GeoJSON(L) (\`data-format=geojson\`),
   KML/KMZ (\`kml\`), CSV/TSV (\`csv\`), TopoJSON (\`topojson\`), Shapefile
   (\`shapefile\`), FlatGeobuf (\`flatgeobuf\`), WKT (\`wkt\`), XLS/XLSX
   (\`xlsx\`), OSM (\`osm\`), or Other (\`other\`).

Once a decision is recorded, use its value consistently in code, explanations and any
handback URL. Do not invent a choice that is not in this matrix.

## Section goals

Follow these sections in order. An agentic LLM may implement several adjacent sections
when none requires a user decision, but it must still explain the purpose and verify
the goal of each section. A non-agentic LLM must turn each implementation step into a
small prompt/response cycle and wait for the user’s result.

If you are an agentic LLM, inspect the project, make the local edits and run the safe
commands needed for the current section, while stopping for the user’s external account,
credential, payment, publishing and website-editor actions.

If you are a non-agentic LLM, explain the next action, identify its exact terminal or
editor target, provide the needed code or command, wait for the user’s report, and only
then continue to the next action.

### Prerequisites and project setup

Create a safe Bun + TypeScript Vite project in \`/path/to/saanseoi-project\`, preserving
hidden folders and never overwriting an existing project. Inspect the OS and shell,
check Bun before installing it, start the development server, and visually verify the
default Vite page. Do not add map code yet. For a SaanSeoi account, direct the user to
https://saanseoi.hk/sign-up. For the SaanSeoi public API key, direct the user to
https://saanseoi.hk/api-keys, ask them to bring the resulting \`pk.\` key back to the
conversation, and configure it as \`VITE_SAANSEOI_API_KEY\` without committing or
logging it.

### Render the map

Install and configure only the selected mapping library. Create a responsive map
container and visually verify a blank map view. Use the selected region’s opening
position. Mapbox GL JS also requires \`VITE_MAPBOX_TOKEN\`; never print or commit it.

### Add the SaanSeoi basemap

Use the selected region’s TileJSON endpoint and pass the URL-encoded public SaanSeoi key
as the \`access_token\` query parameter. Keep the public key in the browser build, do
not create a proxy or token-refresh path, and verify that the basemap loads.

### Pick a style

Apply the selected SaanSeoi style to the selected renderer and replace its basemap source
with the SaanSeoi vector tiles. For a custom style, obtain and validate the user’s
completed style source. Verify sources, layers and the visible map before continuing.

### Add data

For Existing data, establish schema, source, licence and intended display, convert to
valid GeoJSON when needed, and add a clear accessible layer with an appropriate legend
or popup. For LLM-shaped data, establish the story, audience, locations, geometry,
attributes, source and interaction before creating anything; never fabricate data.

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

### Publish and embed

Only publish when the destination requires it. Build and smoke-test locally first, then
install/authenticate the selected host, configure the public SaanSeoi key in build
settings, deploy and verify the stable public URL in a private window. Stop before
account-linked, paid, DNS, signing or deployment actions until the user confirms.

For an embedded site, do not rely on the guide UI to compose the iframe. Ask the user
for the real public HTTPS map URL, an accessible title, and either a fixed height in
pixels or a parent-fill height. Return the complete iframe, explain its attributes, and
guide the user through this response cycle:

1. confirm the URL opens publicly and the map can be used;
2. provide the iframe with \`width=100%\`, the chosen height, \`loading=lazy\`,
   \`allowfullscreen\`, and the accessible title;
3. ask the user to place it in the platform’s element, preview and report what they see;
4. troubleshoot using the platform’s current official documentation, then ask the user
   to publish or update the page and confirm the public result.

Use a Custom HTML block for self-hosted WordPress or the appropriate WordPress.com
editor, a Code Block for Squarespace, an Embed HTML element for Wix, and a Code Embed
element for Webflow. For another platform, ask which editor it uses before giving
placement instructions. Explain that cross-origin iframes cannot be restyled by the
surrounding site and that fixed height or an explicitly sized parent is required.
`

export const createAMapLlmDecisionMatrixInstructions = () => instructions
