FROM ghcr.io/osgeo/gdal@sha256:7383823642e98d1aebcb996932691f6d090d2ac263695db3d17cea27c46b1035

# Keep the geometry engine (GDAL/GEOS) independent from the host DuckDB build,
# while PyArrow retains Overture's nested GeoParquet fields on output.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m pip install --break-system-packages --no-cache-dir \
    pyarrow==22.0.0 \
    shapely==2.1.2 \
    pyproj==3.7.2 \
    'fsspec[http]==2025.10.0'

WORKDIR /workspace
