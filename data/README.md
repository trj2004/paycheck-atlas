# Data contract

The source-backed dataset uses a clean long grain. The core panel begins at:

> one occupation × one state × one annual survey year

The housing extension adds a standardized home benchmark (bedroom count, bathroom count, and square-footage band) so the same home can be compared across locations without changing the rest of the scenario. Bedroom count can drive observed rent benchmarks; bathroom count and square footage are explicit home-profile attributes until a source supports direct matching. The inflation extension adds CPI category indexes so the dashboard can compare paycheck growth with the cost of a basic-life basket over a ten-year panel.

That grain is intentionally reusable for the later Excel project. The website uses it to answer questions such as:

- How does the same occupation's pay differ across states?
- Which state has the highest affordability ratio for a selected wage percentile?
- How did wages, rent, and price levels move together over time?
- Does the ranking change when the user switches from salary to leftover income?

## Source fields used in the current build

| Source | Fields used | Role |
| --- | --- | --- |
| [BLS OEWS](https://www.bls.gov/oes/tables.htm) | occupation code/title, employment, mean, median, P10/P25/P75/P90 annual wages | observed occupation wages |
| [BLS CPI-U API](https://api.bls.gov/publicAPI/v2/timeseries/data/) | all-items, shelter, food, transportation, and medical-care indexes; annual averages are calculated from the monthly observations | inflation/time lens |
| [BEA Regional Price Parities](https://bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area) | all-items, goods, rent, utilities, and other-services price levels from the official SARPP archive | geographic price adjustment |
| [Census ACS Summary Files](https://www.census.gov/programs-surveys/acs/data/summary-file.html) | median gross rent, bedroom-specific rent, median household income, population, and median home value | housing and household context |
| [HUD FMR / SAFMR](https://www.huduser.gov/portal/datasets/fmr.html) | bedroom-specific rents by metro, county, and selected small areas | optional local-market housing sensitivity extension |

The final dashboard will not treat one observed statistic as “the cost of living.” It combines observed location measures with clearly named scenario assumptions for household size, taxes, discretionary spending, savings, bathrooms, and square footage. Bedroom-specific rent is observed from ACS; bathroom count and square footage define the standardized home profile rather than pretending that ACS directly matches one exact house. If BLS does not report a wage for an occupation/state/year/percentile combination, that combination is omitted from the interactive view rather than filled with an overall wage.

The ACS delivery format changes over the decade: 2015–2017 use official sequence-based summary files; 2018–2019 use official table-based 1-year files; 2021–2024 use the current table-based 1-year files. Census did not publish a standard 2020 ACS 1-year release because of the pandemic, so the official 2020 table-based 5-year summary file is used for the 2020 context and labeled as a methodological exception.

## Reproducibility

\`scripts/build_dataset.py\` downloads the source files, normalizes names and numeric fields, joins on \`state_code\` and \`year\`, and validates the class requirements before writing processed files. The build requires complete CPI, ACS context, and BEA RPP coverage. Raw downloads are intentionally ignored by Git because they are reproducible source snapshots rather than hand-edited project data.

## Local credentials and source status

API keys are optional local fallbacks only. The current validated build uses public official summary-file caches, so no key is embedded in the project:

```powershell
$env:CENSUS_API_KEY = "your-local-census-key"  # optional API fallback
$env:BEA_API_KEY = "your-local-bea-key"        # optional API fallback
uv run python ..\paycheck-atlas\scripts\build_dataset.py
```

Never place those values in HTML, JavaScript, Git, or a class submission. The official BLS state OEWS archives are downloaded by the script and may also be placed in `data/raw/` manually if the BLS server blocks an automated request. Save them with the matching names `bls_state_2015.zip` through `bls_state_2024.zip`; the builder will reuse each cached file and still validate its contents.
