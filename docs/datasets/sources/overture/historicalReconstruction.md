# Overture historical reconstructions

Overture keeps only a limited window of full release payloads. When a monthly payload
has expired, SaanSeoi does not synthesize feature properties from a neighbouring release
or from a changelog: a changelog identifies changed records but does not carry their
complete geometry and attributes.

The `2025-11-19.0` Hong Kong SAR and Macao SAR directory is explicitly marked `partial`
in `data/overture/2025-11-19.0/provenance.json`. Its retained public source contains the
three Divisions types only. `division`, `division_area`, and `division_boundary` were
reconstructed under the `division.intersects.clipSmart` contract; no non-Divisions files
were generated.

The clipping runner preserves the original nested GeoParquet schema with PyArrow and
uses Shapely for the exact intersection. It runs in the pinned GDAL-based Docker image
defined in `docker/overture-reconstruction/Dockerfile`.
