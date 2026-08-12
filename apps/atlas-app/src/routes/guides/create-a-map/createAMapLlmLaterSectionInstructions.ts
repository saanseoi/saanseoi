import {
  createAMapRendererReferenceInstructions,
  getCreateAMapRendererReference,
} from './createAMapRendererReference'

const renderReferences = (['maplibre', 'mapbox', 'leaflet'] as const)
  .map(renderer => {
    const { label } = getCreateAMapRendererReference(renderer)

    return [
      `### ${label}`,
      '',
      createAMapRendererReferenceInstructions(renderer, 4),
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
- If Mapbox GL JS is selected, use the public Mapbox token only through
  \`VITE_MAPBOX_TOKEN\`. Do not ask for, print, commit, or otherwise expose its value;
  confirm that \`.env\` is excluded from version control.

### Library-specific starter references

Use only the reference matching the mapping library selected in the project decisions.

${renderReferences}

## Add the SaanSeoi basemap

- Keep the SaanSeoi API key exclusively in server-side configuration. Never expose it in
  browser code, repository files, screenshots or logs.
- Implement a server-side exchange that returns a short-lived tile token. Apply the
  token only to SaanSeoi style and tile requests.
- Request the API key only when the application is ready for it, then verify the map
  loads after it has been configured.

## Choose a style

- Use the chosen SaanSeoi style URL, or ask for the completed custom style source.
- Keep the style compatible with the selected renderer and SaanSeoi vector tiles.
- Verify sources and layers render correctly after changing style configuration.

## Add data

- For existing data, first establish its schema, source, licence and intended display.
- For the urban-density example, make the computation reproducible: record source
  releases and reference years, separate input from derived data, calculate area and
  density defensively, and display both the overlay and the metrics.
- Never fabricate unavailable values or silently assume fields.

## Publish

- Build and validate a production artefact before any deployment step.
- Keep secrets out of the output artefact and source repository.
- Stop before authentication, deployment, DNS, app-store actions or signing until the
  user confirms.
- For a website embed, provide an accessible iframe only after a real public map URL is
  available.
`

export const createAMapLlmLaterSectionInstructions = () => instructions
