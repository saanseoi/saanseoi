#!/usr/bin/env python3
"""Simplify a WGS84 polygon coverage using Shapely's GEOS-backed operation.

The stdin/stdout contract is a JSON object with ``geometries`` and
``toleranceMetres``. Geometries remain GeoJSON WGS84 at the boundary; a local
metre plane is used only while applying the tolerance.
"""

from __future__ import annotations

import json
import math
import sys
from collections.abc import Callable
from typing import Any

import shapely

HONG_KONG_REFERENCE_LONGITUDE = 114.0
HONG_KONG_REFERENCE_LATITUDE = 22.35
METRES_PER_DEGREE_LATITUDE = 110_574.0
METRES_PER_DEGREE_LONGITUDE = 111_320.0 * math.cos(
    math.radians(HONG_KONG_REFERENCE_LATITUDE)
)

GeoJsonGeometry = dict[str, Any]


def main() -> None:
    payload = read_payload()
    geometries = payload["geometries"]
    tolerance_metres = payload["toleranceMetres"]
    if not isinstance(geometries, list) or not geometries:
        raise ValueError("Coverage simplification requires one or more geometries.")
    if not isinstance(tolerance_metres, (int, float)) or tolerance_metres <= 0:
        raise ValueError("Coverage simplification requires a positive metre tolerance.")

    local_geometries = [to_local_metre_geometry(geometry) for geometry in geometries]
    parsed = [shapely.from_geojson(json.dumps(geometry)) for geometry in local_geometries]
    repaired_indexes: list[int] = []
    polygonal = []
    for index, geometry in enumerate(parsed):
        require_polygonal(geometry, index)
        if not shapely.is_valid(geometry):
            geometry = polygonal_make_valid(geometry, index)
            repaired_indexes.append(index)
        polygonal.append(geometry)

    simplified = shapely.coverage_simplify(polygonal, tolerance_metres)
    if len(simplified) != len(polygonal):
        raise ValueError("Coverage simplification changed the geometry count.")

    output_geometries: list[GeoJsonGeometry] = []
    for index, geometry in enumerate(simplified):
        require_polygonal(geometry, index)
        if geometry.is_empty or not shapely.is_valid(geometry):
            raise ValueError(
                f"Coverage simplification produced invalid geometry at index {index}."
            )
        output_geometries.append(from_local_metre_geometry(to_geojson_geometry(geometry)))

    print(
        json.dumps(
            {
                "engine": "Shapely",
                "engineVersion": shapely.__version__,
                "geometries": output_geometries,
                "inputValidationRepairIndexes": repaired_indexes,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )


def read_payload() -> dict[str, Any]:
    value = json.load(sys.stdin)
    if not isinstance(value, dict):
        raise ValueError("Coverage simplification input must be a JSON object.")
    return value


def polygonal_make_valid(geometry: shapely.Geometry, index: int) -> shapely.Geometry:
    repaired = shapely.make_valid(geometry)
    polygonal_parts = [
        part
        for part in shapely.get_parts(repaired)
        if part.geom_type in ("Polygon", "MultiPolygon") and not part.is_empty
    ]
    if not polygonal_parts:
        raise ValueError(
            f"Input geometry at index {index} cannot be repaired to a polygonal geometry."
        )
    result = shapely.union_all(polygonal_parts)
    require_polygonal(result, index)
    if not shapely.is_valid(result):
        raise ValueError(
            f"Input geometry at index {index} remains invalid after make_valid."
        )
    return result


def require_polygonal(geometry: shapely.Geometry, index: int) -> None:
    if geometry.geom_type not in ("Polygon", "MultiPolygon"):
        raise ValueError(
            f"Coverage simplification requires Polygon or MultiPolygon geometry at index {index}."
        )


def to_geojson_geometry(geometry: shapely.Geometry) -> GeoJsonGeometry:
    value = json.loads(shapely.to_geojson(geometry))
    if not isinstance(value, dict):
        raise ValueError("Coverage simplification did not produce GeoJSON geometry.")
    return value


def to_local_metre_geometry(geometry: GeoJsonGeometry) -> GeoJsonGeometry:
    return map_geometry_positions(
        geometry,
        lambda longitude, latitude: (
            (longitude - HONG_KONG_REFERENCE_LONGITUDE)
            * METRES_PER_DEGREE_LONGITUDE,
            (latitude - HONG_KONG_REFERENCE_LATITUDE) * METRES_PER_DEGREE_LATITUDE,
        ),
    )


def from_local_metre_geometry(geometry: GeoJsonGeometry) -> GeoJsonGeometry:
    return map_geometry_positions(
        geometry,
        lambda x, y: (
            x / METRES_PER_DEGREE_LONGITUDE + HONG_KONG_REFERENCE_LONGITUDE,
            y / METRES_PER_DEGREE_LATITUDE + HONG_KONG_REFERENCE_LATITUDE,
        ),
    )


def map_geometry_positions(
    geometry: GeoJsonGeometry,
    transform: Callable[[float, float], tuple[float, float]],
) -> GeoJsonGeometry:
    geometry_type = geometry.get("type")
    if geometry_type == "GeometryCollection":
        children = geometry.get("geometries")
        if not isinstance(children, list):
            raise ValueError("GeoJSON GeometryCollection requires geometries.")
        return {
            **geometry,
            "geometries": [map_geometry_positions(child, transform) for child in children],
        }
    coordinates = geometry.get("coordinates")
    if geometry_type not in ("Polygon", "MultiPolygon") or not isinstance(coordinates, list):
        raise ValueError("Coverage simplification requires GeoJSON Polygon or MultiPolygon.")
    return {**geometry, "coordinates": map_coordinates(coordinates, transform)}


def map_coordinates(value: Any, transform: Callable[[float, float], tuple[float, float]]) -> Any:
    if not isinstance(value, list):
        raise ValueError("GeoJSON coordinates must be arrays.")
    if value and isinstance(value[0], (int, float)):
        if len(value) < 2 or not all(isinstance(coordinate, (int, float)) for coordinate in value):
            raise ValueError("GeoJSON position requires finite numeric longitude and latitude.")
        longitude, latitude = transform(float(value[0]), float(value[1]))
        return [longitude, latitude, *value[2:]]
    return [map_coordinates(child, transform) for child in value]


if __name__ == "__main__":
    try:
        main()
    except (json.JSONDecodeError, TypeError, ValueError) as error:
        raise SystemExit(str(error)) from error
