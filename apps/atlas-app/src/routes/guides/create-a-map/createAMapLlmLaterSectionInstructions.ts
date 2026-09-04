import {
  createAMapRendererReferenceInstructions,
  getCreateAMapRendererReference,
} from './snippets'
import {
  createAMapLlmBasemapReferences,
  createAMapLlmExistingDataReferences,
  createAMapLlmHostingReferences,
  createAMapLlmIframeReference,
  createAMapLlmStyleReferences,
  createAMapLlmUrbanDensityReferences,
} from './createAMapLlmReferenceInstructions'

// References are authored as standalone sections; nest them beneath the section
// that is currently being described so conditional choices remain obvious in llms.txt.
const nestedReferences = (references: string) =>
  references.replace(/^#### /gm, '##### ').replace(/^### /gm, '#### ')

const renderReferences = (['maplibre', 'mapbox', 'leaflet'] as const)
  .map(renderer => {
    const { label } = getCreateAMapRendererReference(renderer)

    return [
      `#### ${label}`,
      '',
      createAMapRendererReferenceInstructions(renderer, 5),
    ].join('\n')
  })
  .join('\n\n')

const instructions = `
## Render the map

- Continue only after the prerequisite project setup is complete. Inspect the actual
  workspace and make only the render-related changes needed for the selected mapping
  library; preserve unrelated work.
- Keep the map container responsive and accessible. Confirm that a blank map view can
  initialise in a browser, rather than treating an HTTP response as visual verification.
- Choose current dependency versions compatible with the project ecosystem. The
  following starter snippets are references only: adapt them to the files, framework,
  package manager and conventions actually present in the workspace.
- Before adding the SaanSeoi basemap, send me to https://saanseoi.hk/sign-up to create or
  sign in to my SaanSeoi account, then to https://saanseoi.hk/api-keys to create a public
  API key. Ask me to paste the resulting key beginning with \`pk.\` into this chat. After I
  provide it, configure it locally as \`VITE_SAANSEOI_API_KEY\` in \`.env\`; it is intended
  for the browser build, but must never be committed or logged.
- If Mapbox GL JS is selected, guide me through creating a public Mapbox token before
  installing it, then use that token only through \`VITE_MAPBOX_TOKEN\`. Do not ask for,
  print, commit, or otherwise expose its value; confirm that \`.env\` is excluded from
  version control.

### Library-specific starter references

Use only the reference matching the mapping library selected in the project decisions.

${renderReferences}

## Add the SaanSeoi basemap

- Use SaanSeoi’s public \`pk.\` key through \`VITE_SAANSEOI_API_KEY\`. It is intentionally
  embedded in the browser build, so configure it as a public build variable rather than
  as a secret. Never commit it or log it.
- Send the public key directly as the \`access_token\` query parameter on SaanSeoi API
  and tile requests. Do not add a token refresh utility, server proxy or D1 lookup path.
- Request the key only when the application is ready for it, then verify the selected
  basemap loads after it has been configured.

### Renderer-specific basemap references

Use only the reference matching the selected mapping library.

${nestedReferences(createAMapLlmBasemapReferences())}

## Choose a style

- Use the chosen SaanSeoi style URL, or ask for the completed custom style source.
- Keep the style compatible with the selected renderer and SaanSeoi vector tiles.
- Verify sources and layers render correctly after changing style configuration.

### Renderer-specific style references

Use only the reference matching the selected mapping library.

${nestedReferences(createAMapLlmStyleReferences())}

## Add data

Tell me that I am at a crossroads: the basemap works, and I can now make it my own.
Offer these three paths and begin only the one I choose:

1. **SaanSeoi Population Density Project** — follow the guided District statistics and
   liveable-area example, with reproducible source years, overlays and summary cards.
2. **Data I already have** — let me upload a dataset here (or, for an agentic LLM, place
   it in the project root), inspect its format and schema, convert it to valid GeoJSON,
   and add an accessible layer with a useful legend or popup.
3. **Craft a custom map** — ask what I want to show on the selected Hong Kong, Macau or
   GBA basemap, review suitable data sources and licences with me, obtain or create the
   agreed data, convert it to GeoJSON, and add and style the layer. Establish the story,
   audience, locations, geometry, attributes, source and interaction before creating
   anything; never fabricate data.

For the worked urban-density example, make the computation reproducible: record source
releases and reference years, separate input from derived data, calculate area and
density defensively, and display both the overlay and the metrics. If publishing is part
of my selected objective, check the selected host’s current asset-size limit before adding
an oversized custom file. Never fabricate unavailable values or silently assume fields.

### Data I already have

When I choose an existing dataset, guide me through the complete preparation flow before
adding it to the map:

1. Ask me to upload the file to this chat. An agentic LLM may instead ask me to put it in
   the project root and inspect it there. Identify its format, schema, coordinate
   reference system, source and licence from the file; do not make me choose a format in
   advance or overwrite the original. Supported starting formats include GeoJSON(L),
   KML/KMZ, CSV/TSV, TopoJSON, Shapefile ZIP, FlatGeobuf, WKT, XLS/XLSX, OSM and other
   spatial files.
2. If the file is already valid GeoJSON and its properties and geometry are correct, the
   geojson.io editing pass is optional. Otherwise open https://geojson.io in a new tab,
   choose **Import**, select the file, and check that its features appear in the right
   place. For CSV or TSV, choose the matching **Kind**; for separate longitude and
   latitude columns, choose **Coordinates**, select the latitude and longitude headings,
   and import. For TSV choose **Tab** as the delimiter. For XLS or XLSX, choose the
   worksheet first and then the matching geometry kind. Coordinates must be WGS84;
   convert projected coordinates first. For KML/KMZ, TopoJSON, Shapefile ZIP, FlatGeobuf,
   WKT, OSM or another format, use geojson.io when it supports the file or a trusted
   converter that preserves geometry, properties, source and licence.
3. Review the imported data. Use the feature editor to give places a clear \`name\` and
   add useful properties, and use the marker, line and polygon tools to add or refine
   geometry. If geojson.io does not recognise the file, export GeoJSON from the source
   application or use a trusted converter, working from a copy if the original contains
   anything private.
4. When it looks right, choose **Export**, leave GeoJSON selected, and save the file as
   \`features.geojson\`. Put it in the project’s \`public\` folder so it is served at
   \`/features.geojson\`; an agentic LLM should confirm the file is there, while a web chat
   should wait for me to confirm the placement.
### What is GeoJSON?

GeoJSON is a plain JSON format for geographic features. A feature can be a **Point**,
**LineString**, **Polygon**, or a collection of those shapes, with properties such as a
name, category or opening hours attached to each one. It is the data format used by the
renderer-specific loading references below. For MapLibre and Mapbox it is the native
format for dynamic datasets; for Leaflet, MapLibre is the compatibility layer used to
render the vector data, so GeoJSON is the format we target.

Before applying the renderer reference, ask me to confirm: “Have you prepared a
\`features.geojson\`?” Do not continue until I confirm it is in the project’s public
folder (an agentic LLM should inspect and confirm this itself).
5. Use the renderer-specific reference below to load the file, then verify the running
   preview: the features should be in the right place, names should appear in the
   interactive popups, and the layer should match the selected map style. If publishing
   is selected, check the selected host’s static-asset limit before adding an oversized
   file.
After the map change, ask me to confirm: “Was your data added to the map?” Keep the
existing map visible while I check the layer and popups, and troubleshoot before moving
on if it is not showing as intended.

### SaanSeoi Popoulation Density Project

Use only the reference matching the selected mapping library.

${nestedReferences(createAMapLlmUrbanDensityReferences())}

### Existing-data renderer references

Use only the reference matching the selected mapping library.

${nestedReferences(createAMapLlmExistingDataReferences())}

### Craft a custom map

Ask me what the map should help people understand, who it is for, which places or area it
covers, and what interaction I want. Review possible authoritative sources with me before
obtaining data, explain licensing and attribution, and ask me to approve the source and
the proposed fields. Convert the approved data to valid \`features.geojson\`, preserve the
source and provenance, and then use the renderer-specific existing-data reference above
to add it. If publishing is selected, check that host’s current static-asset limit against
the actual file before adding it, then build, smoke-test and prepare the selected host.

## Publish the map

Enter this section only when the destination is online or an embedded site. For a local
destination, congratulate me on completing the map and do not ask about a host.

- Build and validate a production artefact before any deployment step.
- Keep private credentials out of the output artefact and source repository. Configure
  \`VITE_SAANSEOI_API_KEY\` as a public build variable in the selected host instead.
- Stop before authentication, deployment, DNS, app-store actions or signing until the
  user confirms.
- For a website embed, provide an accessible iframe only after a real public map URL is
  available.

### Hosting platform references

Use only the reference matching the selected host and operating system. Host commands
without a nested OS heading are cross-platform Bun commands; GitHub Pages has explicit
Linux, macOS and Windows PowerShell installation subsections. Adapt shell syntax where
necessary, use only the subsection matching my system, and run every command from the
project directory.

${nestedReferences(createAMapLlmHostingReferences())}

### Code References

Enter this section only when the destination is an embedded site. Wait until the map has
a real public HTTPS URL, then use the selected website editor instructions below.

${createAMapLlmIframeReference()}
`

export const createAMapLlmLaterSectionInstructions = () => instructions
