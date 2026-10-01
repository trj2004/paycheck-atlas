# Data contract

The source-backed dataset will use a long, pivot-friendly grain. The core panel begins at:

> one occupation × one state × one annual survey year

The housing extension adds a standardized home benchmark (bedroom count and square-footage band) so the same home can be compared across locations without changing the rest of the scenario. The inflation extension adds CPI category indexes so the dashboard can compare paycheck growth with the cost of a basic-life basket over time.

That grain is intentionally long and pivot-friendly. It supports questions such as:

- How does the same occupation's pay differ across states?
- Which state has the highest affordability ratio for a selected wage percentile?
- How did wages, rent, and price levels move together over time?
- Does the ranking change when the user switches from salary to leftover income?

## Planned source fields

| Source | Fields used | Role |
| --- | --- | --- |
| BLS OEWS | occupation code/title, employment, mean, median, P10/P25/P75/P90 annual wages | observed occupation wages |
| BLS CPI-U | all-items, shelter, food, transportation, medical care, utilities, and other category indexes | inflation/time lens |
| BEA RPP | all-items, goods, services, rent, utility, and other-services price levels | geographic price adjustment |
| Census ACS 1-year | median gross rent, median household income, population, median home value | housing and household context |
| HUD FMR / SAFMR | bedroom-specific rents by metro, county, and selected small areas | standardized housing sensitivity model |

The final dashboard will not treat one observed statistic as “the cost of living.” It will combine observed location measures with clearly named scenario assumptions for household size, taxes, discretionary spending, and savings.

## Reproducibility

\`scripts/build_dataset.py\` downloads the source files, normalizes names and numeric fields, joins on \`state_code\` and \`year\`, and validates the class requirements before writing processed files. Raw downloads are intentionally ignored by Git.
