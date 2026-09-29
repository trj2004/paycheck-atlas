"""Embed the local state-outline SVG so the static site works from file:// URLs."""

from __future__ import annotations

import json
from pathlib import Path

project_root = Path(__file__).resolve().parents[1]
svg_path = project_root / "assets" / "us_map.svg"
output_path = project_root / "assets" / "us_map-inline.js"
svg = svg_path.read_text(encoding="utf-8")
output_path.write_text(
    "window.PAYCHECK_ATLAS_MAP = " + json.dumps(svg) + ";\n",
    encoding="utf-8",
)
print(f"Wrote {output_path}")
