# Where Does Your Paycheck Go?

An interactive exploration of how location changes the purchasing power of a full-time salary.

## Current checkpoint

The feature branch contains the source-backed build: 361,780 validated occupation × state × year rows across 2015–2024, 51 state/DC contexts, and 988 occupations. The published `main` branch can remain the submitted design checkpoint until this branch is reviewed and merged.

The project question is:

> How does location affect the purchasing power of a full-time salary?

The site adds two connected lenses: whether a paycheck has kept up with the cost of a basic life over 2015–2024, and what the same bedroom/bathroom/square-footage housing profile costs in different states. Observed wages, price levels, CPI indexes, and ACS housing context are kept separate from explicit household and budget assumptions.

## Files

- `index.html` — scrollable report homepage with the project story and findings.
- `dashboard.html` — interactive scenario dashboard.
- `styles.css` — shared dark financial/home design system.
- `app.js` — calculations, controls, rankings, and visual rendering.
- `data/prototype-data.js` — safe fallback data if the generated source file is unavailable.
- `data/source-data.js` — generated browser contract from the validated panel.
- The dashboard includes a 50-state click map, map measure toggles, a time scrubber, a selected-state story card, full occupation search, and source-backed scenario calculations.
- `data/README.md` — panel grain, source map, field definitions, and reproducibility notes.
- `scripts/build_dataset.py` — source-backed BLS/BEA/ACS panel builder and rubric validator.

## Preview

Open `index.html` for the report homepage and `dashboard.html` for the separate interactive dashboard. For the eventual GitHub Pages version, these files can be published as static pages without a server-side database.

## Final data shape

The source-backed panel is designed at one occupation × state × year per row. Ten annual periods across roughly 50 states and hundreds of occupations should provide far more than the 50,000-row class requirement. The long grain also keeps the data reusable for the separate future Excel project, but the website itself is focused on the affordability analysis rather than pivot-table features.

Run the pipeline from the `fda-python` repository root with `uv run python ..\paycheck-atlas\scripts\build_dataset.py`, then run `uv run python ..\paycheck-atlas\scripts\build_web_data.py`. The builder caches official raw downloads, joins the sources, checks row count/group/time coverage, rejects duplicate keys and incomplete context fields, and writes processed CSV/Parquet outputs. Public official summary-file caches mean Census and BEA API keys are not required for this validated build; API keys remain supported as local-only fallbacks and must never be committed or shared. `--allow-missing-rpp` exists only for debugging and is not a final-data workflow.

The 2020 ACS caveat is documented in the data contract: Census did not publish a standard ACS 1-year release for 2020, so the official 2020 ACS 5-year summary file is used for that year and labeled as such.
