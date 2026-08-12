// TODO Replace with proper instructions
const instructions = `
## Render the map

- Use the selected mapping library and the project's web-framework integration.
- Keep the map container responsive and accessible. Confirm a blank map can initialise.
- Select current, compatible dependency versions from the real project ecosystem.

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
