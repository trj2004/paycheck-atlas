# Where Does Your Paycheck Go?

An interactive exploration of how location changes the purchasing power of a full-time salary.

## Current checkpoint

The report page and dashboard are currently a design prototype. They use clearly labeled illustrative scenario data while the source-backed panel is being assembled and validated. The production build is intentionally kept on a feature branch until every requested year, state, occupation, CPI series, and regional price-level join passes validation.

The final dataset will use annual occupation wages, regional price levels, CPI categories, standardized housing benchmarks, and household expense assumptions. The intended research question is:

> How does location affect the purchasing power of a full-time salary?

The prototype also demonstrates a second lens: whether a paycheck has kept up with the cost of a basic life over a ten-year window (2015–2024), and what the same bedroom/bathroom/square-footage housing profile costs in different states. Those screens are ready to receive the validated panel; they should not be read as empirical findings yet.

## Files

- `index.html` — scrollable report homepage with the project story and findings.
- `dashboard.html` — interactive scenario dashboard.
- `styles.css` — shared dark financial/home design system.
- `app.js` — calculations, controls, rankings, and visual rendering.
- `data/prototype-data.js` — temporary illustrative inputs for the design checkpoint.
- The prototype dashboard includes a 50-state click map, map measure toggles, a time scrubber, and a selected-state story card.
- `data/README.md` — panel grain, source map, field definitions, and reproducibility notes.
- `scripts/build_dataset.py` — source-backed BLS/BEA/ACS panel builder and rubric validator.

## Preview

Open `index.html` for the report homepage and `dashboard.html` for the separate interactive dashboard. For the eventual GitHub Pages version, these files can be published as static pages without a server-side database.

## Final data shape

The source-backed panel is designed at one occupation × state × year per row. Ten annual periods across roughly 50 states and hundreds of occupations should provide far more than the 50,000-row class requirement. The long grain also keeps the data reusable for the separate future Excel project, but the website itself is focused on the affordability analysis rather than pivot-table features.

Run the pipeline from the `fda-python` repository root with `uv run python ..\paycheck-atlas\scripts\build_dataset.py`. The script caches raw downloads, joins the sources, checks the required row count/group/time coverage, rejects duplicate keys and incomplete context fields, and writes processed CSV/Parquet outputs. The final build requires local `CENSUS_API_KEY` and `BEA_API_KEY` environment variables. Do not commit or share either key. `--allow-missing-rpp` exists only for debugging and is not a final-data workflow.

The prototype is not the final analytical dataset. It is intentionally separated from the later source-backed data pipeline so design decisions can be evaluated first.
