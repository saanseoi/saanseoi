# Create a Map coverage

Use this matrix when changing `apps/atlas-app/src/routes/guides/create-a-map/`. It
records whether each user choice has an intentional path and whether its copy has been
reviewed by a person with relevant mapping experience. Do not mark a cell reviewed
solely because it compiles or an LLM generated the wording.

## Objective coverage

| Objective          | Setup path                                                                                  | Render                                                                  | Basemap                                | Style                                     | Data                                                  | Copy review |
| ------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------- | ----------------------------------------------------- | ----------- |
| Local              | OS-specific Bun install and the existing local Vite commands                                | MapLibre, Mapbox and Leaflet starter snippets                           | Direct `pk.` key and regional TileJSON | SaanSeoi carousel and custom-style prompt | Own-data prompt and urban-density calculation example | Needed      |
| Web                | Cloudflare Pages default; GitHub Pages, Vercel, Netlify and another-host deployment handoff | MapLibre, Mapbox and Leaflet starter snippets                           | Direct `pk.` key and regional TileJSON | SaanSeoi carousel and custom-style prompt | Own-data prompt and urban-density calculation example | Needed      |
| Existing web embed | WordPress, Squarespace, Wix or Webflow iframe after a standalone deployment; local fallback | Web setup plus iframe/component guidance                                | Direct `pk.` key and regional TileJSON | SaanSeoi carousel and custom-style prompt | Own-data prompt and urban-density calculation example | Needed      |
| Mobile embed       | MapLibre Native Android or iOS guide; other frameworks have a deliberate hand-off           | MapLibre Native Android and iOS hand-off links                          | Public-key hand-off only               | SaanSeoi carousel and custom-style prompt | Own-data prompt and urban-density calculation example | Needed      |
| Jupyter Notebook   | Local JupyterLab, Colab or JupyterHub; MapLibre Python or Folium first-cell path            | MapLibre Python or Folium starter cell; public-key integration hand-off | Public-key hand-off only               | SaanSeoi carousel and custom-style prompt | Own-data prompt and urban-density calculation example | Needed      |

## Renderer coverage

| Renderer       | Current guide support                                                                                                   | Copy review |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------- |
| MapLibre GL JS | Recommended package, map shell, live npm major-version notice, direct public-key vector basemap configuration           | Needed      |
| Mapbox GL JS   | Package and map shell; users must provide their separate Mapbox token; direct public-key SaanSeoi request configuration | Needed      |
| Leaflet        | Package and raster starter shell; directly passes the public key to a vector-tile plugin for SaanSeoi basemaps          | Needed      |

## Data coverage

| Data choice                    | Current guide support                                                                                                                                                                               | Release condition                                                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing data                  | Privacy-aware discovery prompt for an LLM or community helper                                                                                                                                       | Review after the first supported import path is published                                                                                                               |
| SaanSeoi urban-density example | Tutorial-sized browser calculation for Hong Kong, Kowloon and the New Territories; sourced from District geometry, precision-snapped z14 basemap MVT land-use coverage and C&amp;SD population data | Verify the published Statistics collection, its download/API contract, the documented MVT approximation and the region/District grouping before marking fully available |
| Planned sushi Places example   | Use Places search in pages of no more than 100 results and keep each search query within 200 characters                                                                                             | Verify the published Places snapshot, category vocabulary, pagination design and public-key flow before adding it to the tutorial                                       |

## Review checklist

- Verify every manual snippet against the pinned package version and current Bun setup.
- Check every LLM hand-over prompt in both a web chat and a coding harness.
- Exercise Windows, macOS and Linux setup selections for every destination.
- Verify host-specific deployment and iframe instructions before presenting them as an
  end-to-end production deployment path.
- Test direct SaanSeoi `pk.` key use from a browser build, including TileJSON query
  propagation and selected-host build-variable configuration. Confirm private
  credentials are never exposed.
- Confirm each region's TileJSON and every shown style URL exist in the target
  environment.
- Recalculate the urban-density example from pinned releases and check that its land-use
  classes match the stated definition. Verify that decoded features share one global z14
  precision grid, tile overlaps are dissolved before strict-core clipping, and the
  District-clipped coverage is dissolved once before measuring. Keep the deliberate
  boundary-snap trade-off explicit.
- Before replacing the temporary C&amp;SD population input, verify the published
  Statistics collection's endpoint, schema, reference-year semantics and download
  pagination.
- Before adding the sushi example, verify that it respects the Places API maximum of 100
  results per request and does not depend on unbounded search responses.
- Review the mobile, notebook and Leaflet hand-offs with a practitioner before
  presenting them as full integrations.
