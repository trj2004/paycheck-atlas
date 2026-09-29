# Where Does Your Paycheck Go?

An interactive exploration of how location changes the purchasing power of a full-time salary.

## Current checkpoint

This is the first visual prototype. It uses clearly labeled illustrative scenario data so the report page and dashboard interactions can be tested before the public data pipeline is connected.

The final dataset will use annual occupation wages, regional price levels, housing costs, and household expense assumptions. The intended research question is:

> How does location affect the purchasing power of a full-time salary?

## Files

- `index.html` — scrollable report homepage with the project story and findings.
- `dashboard.html` — interactive scenario dashboard.
- `styles.css` — shared dark financial/home design system.
- `app.js` — calculations, controls, rankings, and visual rendering.
- `data/prototype-data.js` — temporary illustrative inputs for the design checkpoint.
- `data/README.md` — final panel grain, source map, and reproducibility notes.
- `scripts/build_dataset.py` — source-backed BLS/BEA/ACS panel builder and rubric validator.

## Preview

Open `index.html` for the report homepage and `dashboard.html` for the separate interactive dashboard. For the eventual GitHub Pages version, these files can be published as static pages without a server-side database.

## Final data shape

The source-backed panel is designed at one occupation × state × year per row. Seven annual periods across roughly 50 states and hundreds of occupations should provide far more than the 50,000-row class requirement while remaining straightforward to pivot.

Run the pipeline from the `fda-python` repository root with `uv run python ..\paycheck-atlas\scripts\build_dataset.py`. The script caches raw downloads, joins the sources, checks the required row count/group/time coverage, and writes processed CSV/Parquet outputs. A BEA API key is required for the RPP fields.

The prototype is not the final analytical dataset. It is intentionally separated from the later source-backed data pipeline so design decisions can be evaluated first.
