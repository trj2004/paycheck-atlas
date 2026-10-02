"""Build the source-backed affordability panel.

Run from the fda-python repository root:

    uv run python ..\\paycheck-atlas\\scripts\\build_dataset.py --help

The BLS OEWS and CPI endpoints are official BLS sources. The ACS and BEA
inputs use official public summary files and the official BEA SARPP ZIP
archive, with API-key fallbacks supported for local rebuilds. The final build
is intentionally strict: it will not write a finished panel when a required
source is missing. Use --allow-missing-rpp only for debugging the wage/ACS
join locally.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import os
import time
import zipfile
from pathlib import Path

import pandas as pd
import requests

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = PROJECT_ROOT / "data" / "raw"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
USER_AGENT = "Paycheck Atlas student research project"
CPI_SERIES = {
    "cpi_all": "CUSR0000SA0",
    "cpi_food": "CUSR0000SAF1",
    "cpi_shelter": "CUSR0000SAH1",
    "cpi_transport": "CUSR0000SETB",
    "cpi_medical": "CUSR0000SAM2",
}

STATE_FIPS = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA",
    "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL",
    "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN",
    "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME",
    "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS",
    "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
    "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
    "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
    "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
    "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI",
    "56": "WY",
}
STATE_NAMES = {
    "ALABAMA": "AL", "ALASKA": "AK", "ARIZONA": "AZ", "ARKANSAS": "AR",
    "CALIFORNIA": "CA", "COLORADO": "CO", "CONNECTICUT": "CT", "DELAWARE": "DE",
    "DISTRICT OF COLUMBIA": "DC", "FLORIDA": "FL", "GEORGIA": "GA", "HAWAII": "HI",
    "IDAHO": "ID", "ILLINOIS": "IL", "INDIANA": "IN", "IOWA": "IA", "KANSAS": "KS",
    "KENTUCKY": "KY", "LOUISIANA": "LA", "MAINE": "ME", "MARYLAND": "MD",
    "MASSACHUSETTS": "MA", "MICHIGAN": "MI", "MINNESOTA": "MN", "MISSISSIPPI": "MS",
    "MISSOURI": "MO", "MONTANA": "MT", "NEBRASKA": "NE", "NEVADA": "NV",
    "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
    "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", "OHIO": "OH", "OKLAHOMA": "OK",
    "OREGON": "OR", "PENNSYLVANIA": "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
    "SOUTH DAKOTA": "SD", "TENNESSEE": "TN", "TEXAS": "TX", "UTAH": "UT",
    "VERMONT": "VT", "VIRGINIA": "VA", "WASHINGTON": "WA", "WEST VIRGINIA": "WV",
    "WISCONSIN": "WI", "WYOMING": "WY",
}

STATE_ARCHIVE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "DC": "DistrictofColumbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii",
    "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "NewHampshire", "NJ": "NewJersey", "NM": "NewMexico", "NY": "NewYork",
    "NC": "NorthCarolina", "ND": "NorthDakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "RhodeIsland", "SC": "SouthCarolina",
    "SD": "SouthDakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "WestVirginia",
    "WI": "Wisconsin", "WY": "Wyoming",
}

ACS_FIELDS = [
    "median_gross_rent", "median_home_value", "median_household_income", "population",
    "median_gross_rent_0br", "median_gross_rent_1br", "median_gross_rent_2br",
    "median_gross_rent_3br", "median_gross_rent_4br", "median_gross_rent_5plus_br",
]
ACS_TABLE_COLUMNS = {
    "B25064": {"B25064_001E": "median_gross_rent"},
    "B25077": {"B25077_001E": "median_home_value"},
    "B19013": {"B19013_001E": "median_household_income"},
    "B01003": {"B01003_001E": "population"},
    "B25031": {
        "B25031_002E": "median_gross_rent_0br",
        "B25031_003E": "median_gross_rent_1br",
        "B25031_004E": "median_gross_rent_2br",
        "B25031_005E": "median_gross_rent_3br",
        "B25031_006E": "median_gross_rent_4br",
        "B25031_007E": "median_gross_rent_5plus_br",
    },
}

# The Census Bureau did not publish a standard ACS 1-year summary file for
# 2020. Its official public substitute for this panel is the 2020 ACS 5-year
# table-based summary file. We keep the product distinction in the panel so it
# can be disclosed in the website methodology.
ACS_TABLE_BASES = {
    **{year: "https://www2.census.gov/programs-surveys/acs/summary_file/"
              f"{year}/prototype/1YRData/" for year in (2018, 2019)},
    2020: "https://www2.census.gov/programs-surveys/acs/summary_file/2020/prototype/5YRData/",
    **{year: "https://www2.census.gov/programs-surveys/acs/summary_file/"
              f"{year}/table-based-SF/data/1YRData/" for year in (2021, 2022, 2023, 2024)},
}
ACS_TABLE_PERIOD = {year: ("5y" if year == 2020 else "1y") for year in ACS_TABLE_BASES}

# Sequence-based ACS summary files used before the table-based release. The
# positions are verified against each year's official Summary File Templates.
LEGACY_SEQUENCE_POSITIONS = {
    2015: {
        "B01003": {"B01003_001E": 129},
        "B19013": {"B19013_001E": 176},
        "B25031": {f"B25031_{number:03d}E": 133 + number for number in range(2, 8)},
        "B25064": {"B25064_001E": 117},
        "B25077": {"B25077_001E": 98},
    },
    2016: {
        "B01003": {"B01003_001E": 129},
        "B19013": {"B19013_001E": 176},
        "B25031": {f"B25031_{number:03d}E": 133 + number for number in range(2, 8)},
        "B25064": {"B25064_001E": 117},
        "B25077": {"B25077_001E": 98},
    },
    2017: {
        "B01003": {"B01003_001E": 129},
        "B19013": {"B19013_001E": 176},
        "B25031": {f"B25031_{number:03d}E": 133 + number for number in range(2, 8)},
        "B25064": {"B25064_001E": 117},
        "B25077": {"B25077_001E": 98},
    },
}
LEGACY_SEQUENCE_NUMBERS = {
    2015: {"B01003": 3, "B19013": 77, "B25031": 139, "B25064": 141, "B25077": 142},
    2016: {"B01003": 3, "B19013": 78, "B25031": 140, "B25064": 142, "B25077": 143},
    2017: {"B01003": 3, "B19013": 78, "B25031": 140, "B25064": 142, "B25077": 143},
}


def fetch_bytes(url: str, target: Path, force: bool = False) -> bytes:
    """Download a public file once and keep a local raw copy."""
    if target.exists() and not force:
        return target.read_bytes()
    target.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(6):
        response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=90)
        if response.status_code == 429:
            delay = 5 * (attempt + 1)
            logging.warning("Public source rate-limited request; retrying in %ss: %s", delay, url)
            time.sleep(delay)
            continue
        response.raise_for_status()
        target.write_bytes(response.content)
        time.sleep(0.15)
        return response.content
    raise RuntimeError(f"Public source continued rate-limiting after retries: {url}")


def find_header_row(raw: pd.DataFrame) -> int:
    for index, row in raw.iterrows():
        values = {str(value).strip().upper() for value in row.tolist()}
        if "OCC_CODE" in values and ("OCC_TITLE" in values or "AREA_TITLE" in values):
            return int(index)
    raise ValueError("Could not locate an OEWS header row.")


def read_bls_year(year: int, force: bool = False) -> pd.DataFrame:
    """Read the official BLS state OEWS workbook for one May survey year."""
    parsed_cache = RAW_DIR / f"bls_state_{year}_parsed.parquet"
    if parsed_cache.exists() and not force:
        return pd.read_parquet(parsed_cache)
    short_year = str(year)[-2:]
    url = f"https://www.bls.gov/oes/special-requests/oesm{short_year}st.zip"
    archive_path = RAW_DIR / f"bls_state_{year}.zip"
    content = fetch_bytes(url, archive_path, force=force)

    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        candidates = [
            name for name in archive.namelist()
            if name.lower().endswith((".xlsx", ".xls")) and not name.startswith("__")
        ]
        if not candidates:
            raise ValueError(f"No Excel workbook found in {url}.")
        state_candidates = [name for name in candidates if "state" in name.lower()]
        workbook = archive.read(sorted(state_candidates or candidates)[0])

    excel = pd.ExcelFile(io.BytesIO(workbook))
    frames: list[pd.DataFrame] = []
    for sheet in excel.sheet_names:
        raw = pd.read_excel(io.BytesIO(workbook), sheet_name=sheet, header=None)
        try:
            header = find_header_row(raw)
        except ValueError:
            continue
        frame = raw.iloc[header + 1:].copy()
        frame.columns = [str(value).strip() for value in raw.iloc[header].tolist()]
        frame["source_sheet"] = sheet
        frames.append(frame)

    if not frames:
        raise ValueError(f"No readable OEWS sheet found in {url}.")
    data = pd.concat(frames, ignore_index=True)
    data.columns = [str(column).strip().upper().replace(" ", "_") for column in data.columns]
    data["year"] = year

    state_column = next(
        (column for column in ("ST", "STATE", "STATE_NAME", "AREA_TITLE", "AREA_NAME")
         if column in data.columns),
        None,
    )
    if state_column is None:
        raise ValueError("The OEWS workbook did not contain a state-identifying column.")

    state_text = data[state_column].astype("string").str.upper().str.strip()
    data["state_code"] = state_text.map(STATE_NAMES)
    data.loc[data["state_code"].isna(), "state_code"] = state_text.where(state_text.isin(STATE_FIPS.values()))
    data.loc[data["state_code"].isna(), "state_code"] = (
        data["SOURCE_SHEET"].astype("string").str.upper().str.extract(r"\b([A-Z]{2})\b", expand=False)
    )

    rename = {
        "OCC_CODE": "occupation_code",
        "OCC_TITLE": "occupation_title",
        "OCC_GROUP": "occupation_group",
        "TOT_EMP": "employment",
        "A_MEAN": "annual_mean_wage",
        "A_MEDIAN": "annual_median_wage",
        "A_PCT10": "annual_p10_wage",
        "A_PCT25": "annual_p25_wage",
        "A_PCT75": "annual_p75_wage",
        "A_PCT90": "annual_p90_wage",
    }
    data = data.rename(columns=rename)
    required = [
        "state_code", "year", "occupation_code", "occupation_title",
        "annual_mean_wage", "annual_median_wage", "annual_p10_wage",
        "annual_p25_wage", "annual_p75_wage", "annual_p90_wage",
    ]
    for column in required:
        if column not in data.columns:
            data[column] = pd.NA
    data["occupation_code"] = data["occupation_code"].astype("string").str.strip()
    data = data[data["occupation_code"].str.fullmatch(r"\d{2}-\d{4}", na=False)]
    data = data[data["state_code"].isin(STATE_FIPS.values())]
    for column in required[4:]:
        data[column] = pd.to_numeric(
            data[column].astype("string").str.replace(",", "", regex=False).replace({"*": pd.NA, "#": pd.NA}),
            errors="coerce",
        )
    parsed = data[required].drop_duplicates(["state_code", "year", "occupation_code"])
    parsed.to_parquet(parsed_cache, index=False)
    return parsed


def _normalize_acs_frame(frame: pd.DataFrame, year: int, product: str) -> pd.DataFrame:
    """Apply the common state/year schema to API or static ACS results."""
    frame = frame.copy()
    frame["year"] = year
    frame["acs_product"] = product
    frame["state_code"] = frame["state_code"].map(lambda value: str(value).upper())
    for column in ACS_FIELDS:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    return frame[["state_code", "year", "NAME", *ACS_FIELDS, "acs_product"]]


def read_acs_table_based_year(year: int, force: bool = False) -> pd.DataFrame:
    """Read state rows from the official Census table-based summary files."""
    base_url = ACS_TABLE_BASES[year]
    period = ACS_TABLE_PERIOD[year]
    product = "ACS 5-year" if period == "5y" else "ACS 1-year"
    frames: list[pd.DataFrame] = []
    for table, columns in ACS_TABLE_COLUMNS.items():
        filename = f"acsdt{period}{year}-{table.lower()}.dat"
        content = fetch_bytes(base_url + filename, RAW_DIR / filename, force=force)
        table_frame = pd.read_csv(io.BytesIO(content), sep="|", dtype="string", encoding="utf-8")
        table_frame.columns = [str(column).lstrip("#") for column in table_frame.columns]
        if "GEO_ID" not in table_frame.columns:
            raise ValueError(f"ACS {year} table {table} has no GEO_ID column.")
        table_frame["state_fips"] = table_frame["GEO_ID"].str.extract(r"0400000US(\d{2})", expand=False)
        table_frame = table_frame[table_frame["state_fips"].isin(STATE_FIPS)].copy()
        source_columns: dict[str, str] = {}
        for variable in columns:
            source = variable
            if source not in table_frame.columns:
                match = pd.Series([variable]).str.extract(r"^(B\d+)_([0-9]{3})E$").iloc[0]
                alternate = f"{match.iloc[0]}_E{match.iloc[1]}" if match.notna().all() else variable
                source = alternate if alternate in table_frame.columns else variable
            if source not in table_frame.columns:
                raise KeyError(f"ACS {year} table {table} is missing {variable}.")
            source_columns[source] = columns[variable]
        table_frame = table_frame[["state_fips", *source_columns]].rename(columns=source_columns)
        frames.append(table_frame)

    frame = frames[0]
    for table_frame in frames[1:]:
        frame = frame.merge(table_frame, on="state_fips", how="outer", validate="one_to_one")
    frame["state_code"] = frame["state_fips"].map(STATE_FIPS)
    frame["NAME"] = frame["state_code"].map({code: name.title() for name, code in STATE_NAMES.items()})
    return _normalize_acs_frame(frame, year, product)


def _read_legacy_sequence_state(content: bytes, year: int, state_code: str, sequence: int) -> list[str]:
    """Return the official state-level estimate row from one legacy sequence ZIP."""
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        estimate_files = [name for name in archive.namelist() if name.startswith("e") and name.endswith(".txt")]
        if not estimate_files:
            raise ValueError(f"ACS {year} sequence {sequence} has no estimate text file.")
        with archive.open(sorted(estimate_files)[0]) as raw_file:
            for row in csv.reader(io.TextIOWrapper(raw_file, encoding="utf-8")):
                if len(row) > 5 and row[5] == "0000001":
                    return row
    raise ValueError(f"ACS {year} {state_code} sequence {sequence} has no state-level row.")


def read_acs_legacy_year(year: int, force: bool = False) -> pd.DataFrame:
    """Read 2015–2017 state rows from the official sequence-based archives."""
    positions = LEGACY_SEQUENCE_POSITIONS[year]
    sequence_numbers = LEGACY_SEQUENCE_NUMBERS[year]
    records: list[dict[str, object]] = []
    for fips, state_code in STATE_FIPS.items():
        state_name = next(name for name, code in STATE_NAMES.items() if code == state_code).title()
        record: dict[str, object] = {"state_code": state_code, "NAME": state_name}
        for table, variable_positions in positions.items():
            sequence = sequence_numbers[table]
            archive_name = f"acs_{year}_{state_code.lower()}_{sequence:04d}.zip"
            archive_path = RAW_DIR / "acs_legacy" / archive_name
            url = (
                f"https://www2.census.gov/programs-surveys/acs/summary_file/{year}/data/"
                f"1_year_seq_by_state/{STATE_ARCHIVE_NAMES[state_code]}/"
                f"{year}1{state_code.lower()}{sequence:04d}000.zip"
            )
            content = fetch_bytes(url, archive_path, force=force)
            row = _read_legacy_sequence_state(content, year, state_code, sequence)
            for variable, position in variable_positions.items():
                field = ACS_TABLE_COLUMNS[table][variable]
                record[field] = row[position] if position < len(row) else pd.NA
        records.append(record)
    frame = pd.DataFrame(records)
    return _normalize_acs_frame(frame, year, "ACS 1-year")


def read_acs_year(year: int, force: bool = False) -> pd.DataFrame:
    """Read state-level ACS housing and income context from official sources."""
    variables = ",".join(["NAME", *[variable for columns in ACS_TABLE_COLUMNS.values() for variable in columns]])
    url = f"https://api.census.gov/data/{year}/acs/acs1"
    params = {"get": variables, "for": "state:*"}
    api_key = os.getenv("CENSUS_API_KEY")
    if api_key:
        params["key"] = api_key
    cache = RAW_DIR / f"acs_state_{year}.json"
    if cache.exists() and not force:
        payload = json.loads(cache.read_text(encoding="utf-8"))
        if not isinstance(payload, list) or len(payload) < 2:
            raise ValueError(f"ACS {year} response was not a tabular state result.")
        frame = pd.DataFrame(payload[1:], columns=payload[0])
        frame["state_code"] = frame["state"].map(STATE_FIPS)
        frame = frame.rename(columns={variable: field for columns in ACS_TABLE_COLUMNS.values() for variable, field in columns.items()})
        return _normalize_acs_frame(frame, year, "ACS 1-year")
    if api_key:
        response = requests.get(url, params=params, headers={"User-Agent": USER_AGENT}, timeout=90)
        response.raise_for_status()
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(response.text, encoding="utf-8")
        frame = pd.DataFrame(response.json()[1:], columns=response.json()[0])
        frame["state_code"] = frame["state"].map(STATE_FIPS)
        frame = frame.rename(columns={variable: field for columns in ACS_TABLE_COLUMNS.values() for variable, field in columns.items()})
        return _normalize_acs_frame(frame, year, "ACS 1-year")
    if year in LEGACY_SEQUENCE_POSITIONS:
        return read_acs_legacy_year(year, force=force)
    if year in ACS_TABLE_BASES:
        return read_acs_table_based_year(year, force=force)
    raise RuntimeError(
        f"No official no-key ACS cache is configured for {year}. Set CENSUS_API_KEY locally "
        "or add the public Census summary-file path before building."
    )


def read_cpi(years: list[int], force: bool = False) -> pd.DataFrame:
    """Read annual-average CPI-U indexes from the public BLS API."""
    cache = RAW_DIR / "bls_cpi_annual.json"
    if cache.exists() and not force:
        payload = json.loads(cache.read_text(encoding="utf-8"))
    else:
        response = requests.post(
            "https://api.bls.gov/publicAPI/v2/timeseries/data/",
            json={
                "seriesid": list(CPI_SERIES.values()),
                "startyear": str(min(years)),
                "endyear": str(max(years)),
            },
            headers={"User-Agent": USER_AGENT},
            timeout=90,
        )
        response.raise_for_status()
        payload = response.json()
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(payload), encoding="utf-8")
    if payload.get("status") != "REQUEST_SUCCEEDED":
        raise ValueError(f"BLS CPI request failed: {payload.get('message', 'unknown error')}")
    series_by_id = {series_id: name for name, series_id in CPI_SERIES.items()}
    annual_values: dict[tuple[int, str], list[float]] = {}
    for series in payload.get("Results", {}).get("series", []):
        field = series_by_id.get(series.get("seriesID"))
        if not field:
            continue
        for row in series.get("data", []):
            period = str(row.get("period", ""))
            if period != "M13" and not period.startswith("M"):
                continue
            value = pd.to_numeric(row.get("value"), errors="coerce")
            if pd.isna(value):
                continue
            key = (int(row["year"]), field)
            annual_values.setdefault(key, []).append(float(value))
    records: list[dict[str, object]] = []
    for year in years:
        record: dict[str, object] = {"year": year}
        for field in CPI_SERIES:
            values = annual_values.get((year, field), [])
            if values:
                record[field] = values[0] if len(values) == 1 else sum(values) / len(values)
        records.append(record)
    frame = pd.DataFrame(records)
    required = ["year", *CPI_SERIES.keys()]
    missing = set(required) - set(frame.columns)
    if missing:
        raise ValueError(f"BLS CPI response is missing fields: {sorted(missing)}")
    frame = frame[frame["year"].isin(years)]
    if set(frame["year"]) != set(years):
        missing_years = sorted(set(years) - set(frame["year"]))
        raise ValueError(f"BLS CPI response is missing requested years: {missing_years}")
    return frame[required].sort_values("year").reset_index(drop=True)


def read_bea_rpp_year(year: int, force: bool = False, allow_missing: bool = False) -> pd.DataFrame:
    """Read BEA SARPP lines from the official ZIP cache or API."""
    columns = ["state_code", "year", "rpp_all_items", "rpp_goods", "rpp_rents", "rpp_utilities", "rpp_other_services"]
    archive_path = RAW_DIR / "bea_sarpp.zip"
    line_names = {1: "rpp_all_items", 2: "rpp_goods", 3: "rpp_rents", 4: "rpp_utilities", 5: "rpp_other_services"}

    if archive_path.exists() and not force:
        with zipfile.ZipFile(archive_path) as archive:
            with archive.open("SARPP_STATE_2008_2024.csv") as csv_file:
                frame = pd.read_csv(csv_file, dtype={"GeoFIPS": "string"}, skipinitialspace=True)
        year_column = str(year)
        if year_column not in frame.columns:
            raise ValueError(f"The cached BEA SARPP archive has no {year} column.")
        frame["state_code"] = (
            frame["GeoFIPS"].astype("string").str.strip().str.replace('"', "", regex=False).str[:2].map(STATE_FIPS)
        )
        frame["LineCode"] = pd.to_numeric(frame["LineCode"], errors="coerce")
        frame = frame[frame["state_code"].notna() & frame["LineCode"].isin(line_names)]
        values = frame.pivot_table(index="state_code", columns="LineCode", values=year_column, aggfunc="first")
        records = []
        for state_code, row in values.iterrows():
            record = {"state_code": state_code, "year": year}
            for line_code, field in line_names.items():
                record[field] = pd.to_numeric(row.get(line_code), errors="coerce")
            records.append(record)
        return pd.DataFrame(records, columns=columns)

    api_key = os.getenv("BEA_API_KEY")
    if not api_key:
        if not allow_missing:
            raise RuntimeError(
                "BEA_API_KEY is required for the final build because regional price levels "
                "drive the location comparison. Set it locally; do not commit or share the key."
            )
        logging.warning("BEA_API_KEY is not set; RPP columns will remain missing for %s.", year)
        return pd.DataFrame(columns=columns)

    records: dict[str, dict[str, object]] = {}
    for line_code, field in line_names.items():
        response = requests.get(
            "https://apps.bea.gov/api/data/",
            params={
                "UserID": api_key,
                "method": "GetData",
                "datasetname": "Regional",
                "TableName": "SARPP",
                "LineCode": line_code,
                "Year": year,
                "GeoFips": "STATE",
                "ResultFormat": "json",
            },
            headers={"User-Agent": USER_AGENT},
            timeout=90,
        )
        response.raise_for_status()
        payload = response.json()
        for row in payload["BEAAPI"]["Results"]["Data"]:
            fips = str(row.get("GeoFips", "")).zfill(5)[:2]
            state_code = STATE_FIPS.get(fips)
            if not state_code:
                continue
            record = records.setdefault(state_code, {"state_code": state_code, "year": year})
            record[field] = pd.to_numeric(row.get("DataValue"), errors="coerce")
    return pd.DataFrame(records.values(), columns=columns)


def build(years: list[int], force: bool = False, allow_missing_rpp: bool = False) -> pd.DataFrame:
    wage_frames = [read_bls_year(year, force=force) for year in years]
    acs_frames = [read_acs_year(year, force=force) for year in years]
    cpi = read_cpi(years, force=force)
    rpp_frames = [
        read_bea_rpp_year(year, force=force, allow_missing=allow_missing_rpp)
        for year in years
    ]
    wages = pd.concat(wage_frames, ignore_index=True)
    context = pd.concat(acs_frames, ignore_index=True)
    rpp = pd.concat([frame for frame in rpp_frames if not frame.empty], ignore_index=True) if any(not frame.empty for frame in rpp_frames) else pd.DataFrame()
    panel = wages.merge(context, on=["state_code", "year"], how="left", validate="many_to_one")
    if not rpp.empty:
        panel = panel.merge(rpp, on=["state_code", "year"], how="left", validate="many_to_one")
    else:
        for column in ["rpp_all_items", "rpp_goods", "rpp_rents", "rpp_utilities", "rpp_other_services"]:
            panel[column] = pd.NA
    panel = panel.merge(cpi, on="year", how="left", validate="many_to_one")
    panel["real_wage_at_national_price"] = panel["annual_median_wage"] / (panel["rpp_all_items"] / 100)
    panel["rent_share_of_median_income"] = panel["median_gross_rent"] * 12 / panel["median_household_income"]
    return panel.sort_values(["year", "state_code", "occupation_code"]).reset_index(drop=True)


def validate(panel: pd.DataFrame, years: list[int], allow_missing_rpp: bool = False) -> None:
    required = {
        "state_code", "year", "occupation_code", "occupation_title",
        "annual_mean_wage", "annual_median_wage", "annual_p25_wage",
        "annual_p75_wage", "median_gross_rent", "median_household_income",
        "median_gross_rent_1br", "median_gross_rent_2br", "median_gross_rent_3br",
        "rpp_all_items", "cpi_all", "cpi_food", "cpi_shelter", "cpi_transport", "cpi_medical",
    }
    missing = required - set(panel.columns)
    if missing:
        raise ValueError(f"Missing required fields: {sorted(missing)}")
    states = panel["state_code"].nunique()
    periods = panel["year"].nunique()
    logging.info("Panel rows: %s", f"{len(panel):,}")
    logging.info("States: %s | years: %s | occupations: %s", states, periods, panel["occupation_code"].nunique())
    if len(panel) < 50_000:
        raise ValueError("Class requirement not met: panel has fewer than 50,000 rows.")
    if states < 10 or periods < 5:
        raise ValueError("Class requirement not met: need at least 10 groups and 5 periods.")
    if set(years) != set(panel["year"].unique()):
        raise ValueError("Not all requested years are represented.")
    if panel.duplicated(["state_code", "year", "occupation_code"]).any():
        raise ValueError("The panel contains duplicate state/year/occupation keys.")
    observed_context = [
        "median_gross_rent", "median_gross_rent_1br", "median_gross_rent_2br",
        "median_gross_rent_3br", "median_household_income", "population",
    ]
    missing_context = {
        field: float(panel[field].isna().mean())
        for field in observed_context
        if panel[field].isna().any()
    }
    if missing_context:
        raise ValueError(f"ACS coverage is incomplete: {missing_context}")
    cpi_coverage = panel["cpi_all"].notna().mean()
    if cpi_coverage < 1:
        raise ValueError(f"CPI coverage is incomplete: {cpi_coverage:.1%}.")
    rpp_coverage = panel["rpp_all_items"].notna().mean()
    if not allow_missing_rpp and rpp_coverage < 1:
        raise ValueError(f"BEA RPP coverage is incomplete: {rpp_coverage:.1%}.")
    if allow_missing_rpp and rpp_coverage < 1:
        logging.warning("Debug build: BEA RPP coverage is only %.1f%%.", rpp_coverage * 100)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--years", nargs="+", type=int, default=list(range(2015, 2025)))
    parser.add_argument("--force", action="store_true", help="redownload cached raw files")
    parser.add_argument(
        "--allow-missing-rpp",
        action="store_true",
        help="debug only: keep RPP fields missing instead of failing the final validation",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    panel = build(args.years, force=args.force, allow_missing_rpp=args.allow_missing_rpp)
    validate(panel, args.years, allow_missing_rpp=args.allow_missing_rpp)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    panel.to_csv(PROCESSED_DIR / "affordability_panel.csv", index=False)
    panel.to_parquet(PROCESSED_DIR / "affordability_panel.parquet", index=False)
    logging.info("Wrote processed panel to %s", PROCESSED_DIR)


if __name__ == "__main__":
    main()
