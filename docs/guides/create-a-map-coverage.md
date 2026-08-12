# Create a Map coverage

Use this matrix when changing `apps/atlas-app/src/routes/guides/create-a-map/`. It
records whether each user choice has an intentional path and whether its copy has been
reviewed by a person with relevant mapping experience. Do not mark a cell reviewed
solely because it compiles or an LLM generated the wording.

## Objective coverage

| Objective          | Setup path                                                                                  | Render                                                                  | Basemap                                         | Style                                     | Data                                                  | Copy review |
| ------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------- | ----------------------------------------------------- | ----------- |
| Local              | OS-specific Bun install and the existing local Vite commands                                | MapLibre, Mapbox and Leaflet starter snippets                           | Public-key client utility and regional TileJSON | SaanSeoi carousel and custom-style prompt | Own-data prompt and urban-density calculation example | Needed      |
| Web                | Cloudflare Pages default; GitHub Pages, Vercel, Netlify and another-host deployment handoff | MapLibre, Mapbox and Leaflet starter snippets                           | Public-key client utility and regional TileJSON | SaanSeoi carousel and custom-style prompt | Own-data prompt and urban-density calculation example | Needed      |
| Existing web embed | WordPress, Squarespace, Wix or Webflow iframe after a standalone deployment; local fallback | Web setup plus iframe/component guidance                                | Public-key client utility and regional TileJSON | SaanSeoi carousel and custom-style prompt | Own-data prompt and urban-density calculation example | Needed      |
| Mobile embed       | MapLibre Native Android or iOS guide; other frameworks have a deliberate hand-off           | MapLibre Native Android and iOS hand-off links                          | Public-key hand-off only                        | SaanSeoi carousel and custom-style prompt | Own-data prompt and urban-density calculation example | Needed      |
| Jupyter Notebook   | Local JupyterLab, Colab or JupyterHub; MapLibre Python or Folium first-cell path            | MapLibre Python or Folium starter cell; public-key integration hand-off | Public-key hand-off only                        | SaanSeoi carousel and custom-style prompt | Own-data prompt and urban-density calculation example | Needed      |

## Renderer coverage

| Renderer       | Current guide support                                                                                               | Copy review |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | ----------- |
| MapLibre GL JS | Recommended package, map shell, live npm major-version notice, authenticated vector basemap configuration           | Needed      |
| Mapbox GL JS   | Package and map shell; users must provide their separate Mapbox token; authenticated SaanSeoi request configuration | Needed      |
| Leaflet        | Package and raster starter shell; explicitly requires a vector-tile plugin and request hook for SaanSeoi basemaps   | Needed      |

## Data coverage

| Data choice                    | Current guide support                                                                                                                                                   | Release condition                                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing data                  | Privacy-aware discovery prompt for an LLM or community helper                                                                                                           | Review after the first supported import path is published                                                                                                       |
| SaanSeoi urban-density example | Tutorial-sized Turf calculation for Hong Kong, Kowloon and the New Territories; sourced from district geometry, unclipped basemap land use and C&amp;SD population data | Verify the published Statistics collection, its download/API contract, land-use export contract and the region/district grouping before marking fully available |

## Review checklist

- Verify every manual snippet against the pinned package version and current Bun setup.
- Check every LLM hand-over prompt in both a web chat and a coding harness.
- Exercise Windows, macOS and Linux setup selections for every destination.
- Verify host-specific deployment and iframe instructions before presenting them as an
  end-to-end production deployment path.
- Test the SaanSeoi public-key client utility from a browser build, including proactive
  refresh and selected-host build-variable configuration. Confirm private credentials
  are never exposed.
- Confirm each region's TileJSON and every shown style URL exist in the target
  environment.
- Recalculate the urban-density example from pinned releases, check that its land-use
  classes match the stated definition, and verify that tile-clipped geometries are never
  used for its area totals.
- Before replacing the temporary C&amp;SD population input, verify the published
  Statistics collection's endpoint, schema, reference-year semantics and download
  pagination.
- Review the mobile, notebook and Leaflet hand-offs with a practitioner before
  presenting them as full integrations.
