#!/usr/bin/env python3
"""Write exact, clipped Overture division extracts from retained GeoParquet shards.

This script runs inside ``saanseoi/overture-reconstruction:2025-11``. PyArrow
keeps Overture's nested fields intact while Shapely performs the geometry operation,
avoiding the host DuckDB Spatial compatibility issue with the 2025-11 release.
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Iterable
from pathlib import Path

import fsspec
import pyarrow as pa
import pyarrow.parquet as pq
from pyproj import Transformer
from shapely import from_wkb, to_wkb
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform, unary_union

CHINA_DIVISION_ID = "fb68fc73-3ac6-41c9-a692-22fcf20cb5be"
TARGETS = {
    "Hong Kong SAR": "Hong Kong SAR",
    "Macao SAR": "Macao SAR",
}
EQUAL_AREA = Transformer.from_crs("EPSG:4326", "EPSG:6933", always_xy=True).transform


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-urls", type=Path, required=True)
    parser.add_argument("--frames", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument(
        "--feature-type",
        choices=("division_area", "division_boundary"),
        action="append",
    )
    return parser.parse_args()


def dimensions(geometry: BaseGeometry, expected: str) -> BaseGeometry | None:
    acceptable = {
        "polygon": {"Polygon", "MultiPolygon"},
        "line": {"LineString", "MultiLineString"},
    }[expected]
    if geometry.is_empty:
        return None
    if geometry.geom_type in acceptable:
        return geometry
    if not hasattr(geometry, "geoms"):
        return None
    parts = [
        part
        for child in geometry.geoms
        if (part := dimensions(child, expected)) is not None
    ]
    return unary_union(parts) if parts else None


def overlaps(bbox: dict[str, float] | None, frame: BaseGeometry) -> bool:
    if bbox is None:
        return False
    xmin, ymin, xmax, ymax = frame.bounds
    return (
        bbox["xmin"] < xmax
        and bbox["xmax"] > xmin
        and bbox["ymin"] < ymax
        and bbox["ymax"] > ymin
    )


def row_group_might_overlap(
    parquet_file: pq.ParquetFile, row_group: int, frame: BaseGeometry
) -> bool:
    """Reject row groups from their Parquet bbox statistics without reading values."""
    xmin, ymin, xmax, ymax = frame.bounds
    metadata = parquet_file.metadata
    assert metadata is not None
    column_indexes = {
        metadata.schema.column(index).path: index
        for index in range(len(metadata.schema))
    }
    checks = (
        ("bbox.xmin", lambda statistics: statistics.min < xmax),
        ("bbox.xmax", lambda statistics: statistics.max > xmin),
        ("bbox.ymin", lambda statistics: statistics.min < ymax),
        ("bbox.ymax", lambda statistics: statistics.max > ymin),
    )
    for path, predicate in checks:
        column = metadata.row_group(row_group).column(column_indexes[path])
        statistics = column.statistics
        if statistics is not None and statistics.has_min_max and not predicate(statistics):
            return False
    return True


def output_schema(source_schema: pa.Schema) -> pa.Schema:
    names = set(source_schema.names)
    schema = source_schema
    if "theme" not in names:
        schema = schema.append(pa.field("theme", pa.string()))
    if "type" not in names:
        schema = schema.append(pa.field("type", pa.string()))
    return schema


def write_extract(
    urls: Iterable[str],
    frame: BaseGeometry,
    output_file: Path,
    feature_type: str,
) -> int:
    output_file.parent.mkdir(parents=True, exist_ok=True)
    writer: pq.ParquetWriter | None = None
    features = 0

    try:
        for url in urls:
            with fsspec.open(url, "rb", block_size=16 * 1024 * 1024) as handle:
                parquet_file = pq.ParquetFile(handle)
                schema = output_schema(parquet_file.schema_arrow)
                print(
                    f"Scanning {feature_type} shard with {parquet_file.num_row_groups} row groups",
                    flush=True,
                )

                for row_group in range(parquet_file.num_row_groups):
                    if not row_group_might_overlap(parquet_file, row_group, frame):
                        continue
                    print(f"  {feature_type} row group {row_group}: filtering bbox", flush=True)
                    overview_columns = ["bbox"]
                    if feature_type == "division_area":
                        overview_columns.append("division_id")
                    overview = parquet_file.read_row_group(
                        row_group, columns=overview_columns
                    )
                    candidate_indices = [
                        index
                        for index, bbox in enumerate(overview["bbox"].to_pylist())
                        if overlaps(bbox, frame)
                        and (
                            feature_type != "division_area"
                            or overview["division_id"][index].as_py() != CHINA_DIVISION_ID
                        )
                    ]
                    if not candidate_indices:
                        continue

                    print(
                        f"  {feature_type} row group {row_group}: {len(candidate_indices)} bbox candidates",
                        flush=True,
                    )

                    candidates = parquet_file.read_row_group(row_group).take(
                        pa.array(candidate_indices, type=pa.int64())
                    )
                    rows = []
                    for row in candidates.to_pylist():
                        geometry = from_wkb(row["geometry"])
                        if not geometry.intersects(frame):
                            continue
                        clipped = dimensions(
                            geometry.intersection(frame),
                            "polygon" if feature_type == "division_area" else "line",
                        )
                        if clipped is None or clipped.is_empty:
                            continue
                        if feature_type == "division_area" and transform(EQUAL_AREA, clipped).area <= 1:
                            continue
                        xmin, ymin, xmax, ymax = clipped.bounds
                        row["geometry"] = to_wkb(clipped)
                        row["bbox"] = {
                            "xmin": float(xmin),
                            "xmax": float(xmax),
                            "ymin": float(ymin),
                            "ymax": float(ymax),
                        }
                        row["theme"] = "divisions"
                        row["type"] = feature_type
                        rows.append(row)

                    if rows:
                        table = pa.Table.from_pylist(rows, schema=schema)
                        if writer is None:
                            writer = pq.ParquetWriter(
                                output_file, schema, compression="zstd"
                            )
                        writer.write_table(table)
                        features += len(rows)
    finally:
        if writer is not None:
            writer.close()

    if features == 0:
        raise RuntimeError(f"No {feature_type} features written to {output_file}")
    return features


def main() -> None:
    args = parse_args()
    urls = json.loads(args.source_urls.read_text())
    frames = {
        name: from_wkb(bytes.fromhex(wkb))
        for name, wkb in json.loads(args.frames.read_text()).items()
    }
    source_urls = {
        "division_area": urls[2:6],
        "division_boundary": [urls[1]],
    }

    selected_types = args.feature_type or source_urls.keys()
    for feature_type in selected_types:
        inputs = source_urls[feature_type]
        for name, directory in TARGETS.items():
            output = (
                args.output_root
                / "divisions"
                / "中国"
                / directory
                / f"{feature_type}.division.intersects.clipSmart.parquet"
            )
            count = write_extract(inputs, frames[name], output, feature_type)
            print(f"{name}: {feature_type} {count} features -> {output}")


if __name__ == "__main__":
    main()
