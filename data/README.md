# Data contract

The source-backed dataset will use this row grain:

> one occupation × one state × one annual survey year

That grain is intentionally long and pivot-friendly. It supports questions such as:

- How does the same occupation's pay differ across states?
- Which state has the highest affordability ratio for a selected wage percentile?
- How did wages, rent, and price levels move together over time?
- Does the ranking change when the user switches from salary to leftover income?

## Planned source fields

| Source | Fields used | Role |
| --- | --- | --- |
| BLS OEWS | occupation code/title, employment, mean, median, P10/P25/P75/P90 annual wages | observed occupation wages |
| BEA RPP | all-items, goods, services, rent, utility, and other-services price levels | geographic price adjustment |
| Census ACS 1-year | median gross rent, median household income, population, median home value | housing and household context |
| HUD FMR | 2-bedroom fair-market rent history | optional housing sensitivity model |

The final dashboard will not treat one observed statistic as “the cost of living.” It will combine observed location measures with clearly named scenario assumptions for household size, taxes, discretionary spending, and savings.

## Reproducibility

\`scripts/build_dataset.py\` downloads the source files, normalizes names and numeric fields, joins on \`state_code\` and \`year\`, and validates the class requirements before writing processed files. Raw downloads are intentionally ignored by Git.

