# Data contract

The source-backed dataset uses a clean long grain. The core panel begins at:

> one occupation × one state × one annual survey year

The housing extension adds a standardized home benchmark (bedroom count, bathroom count, and square-footage band) so the same home can be compared across locations without changing the rest of the scenario. Bedroom count can drive observed rent benchmarks; bathroom count and square footage are explicit home-profile attributes until a source supports direct matching. The inflation extension adds CPI category indexes so the dashboard can compare paycheck growth with the cost of a basic-life basket over a ten-year panel.

That grain is intentionally reusable for the later Excel project. The website uses it to answer questions such as:

- How does the same occupation's pay differ across states?
- Which state has the highest affordability ratio for a selected wage percentile?
- How did wages, rent, and price levels move together over time?
- Does the ranking change when the user switches from salary to leftover income?

## Planned source fields

| Source | Fields used | Role |
| --- | --- | --- |
| [BLS OEWS](https://www.bls.gov/oes/tables.htm) | occupation code/title, employment, mean, median, P10/P25/P75/P90 annual wages | observed occupation wages |
| [BLS CPI-U API](https://api.bls.gov/publicAPI/v2/timeseries/data/) | all-items, shelter, food, transportation, medical care, utilities, and other category indexes | inflation/time lens |
| [BEA Regional API](https://apps.bea.gov/api/data/) | all-items, goods, services, rent, utility, and other-services price levels | geographic price adjustment |
| [Census ACS 1-year API](https://api.census.gov/data.html) | median gross rent, bedroom-specific rent, median household income, population, median home value | housing and household context |
| [HUD FMR / SAFMR](https://www.huduser.gov/portal/datasets/fmr.html) | bedroom-specific rents by metro, county, and selected small areas | optional local-market housing sensitivity extension |

The final dashboard will not treat one observed statistic as “the cost of living.” It will combine observed location measures with clearly named scenario assumptions for household size, taxes, discretionary spending, savings, bathrooms, and square footage. Bedroom-specific rent is observed from ACS; bathroom count and square footage define the standardized home profile rather than pretending that ACS directly matches one exact house.

## Reproducibility

\`scripts/build_dataset.py\` downloads the source files, normalizes names and numeric fields, joins on \`state_code\` and \`year\`, and validates the class requirements before writing processed files. The final build also requires complete CPI, ACS context, and BEA RPP coverage. Raw downloads are intentionally ignored by Git because they are reproducible source snapshots rather than hand-edited project data.

## Local credentials and source status

The Census API and BEA Regional API keys are local environment variables only:

```powershell
$env:CENSUS_API_KEY = "your-local-census-key"
$env:BEA_API_KEY = "your-local-bea-key"
uv run python ..\paycheck-atlas\scripts\build_dataset.py
```

Never place those values in HTML, JavaScript, Git, or a class submission. The official BLS state OEWS archives are downloaded by the script and may also be placed in `data/raw/` manually if the BLS server blocks an automated request. Save them with the matching names `bls_state_2015.zip` through `bls_state_2024.zip`; the builder will reuse each cached file and still validate its contents.
