"""Embed the local state-outline SVG so the static site works from file:// URLs."""

from __future__ import annotations

import json
import re
from pathlib import Path

project_root = Path(__file__).resolve().parents[1]
svg_path = project_root / "assets" / "us_map.svg"
output_path = project_root / "assets" / "us_map-inline.js"
svg = svg_path.read_text(encoding="utf-8")
svg = re.sub(
    r'(\s+width="([0-9.]+)"\s+height="([0-9.]+)")',
    r'\1\n    viewBox="0 0 \2 \3"\n    preserveAspectRatio="xMidYMid meet"',
    svg,
    count=1,
)
output_path.write_text(
    "window.PAYCHECK_ATLAS_MAP = " + json.dumps(svg) + ";\n",
    encoding="utf-8",
)
print(f"Wrote {output_path}")
