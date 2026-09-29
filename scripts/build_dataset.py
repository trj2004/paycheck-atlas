"""Build the source-backed affordability panel.

Run from the fda-python repository root:

    uv run python ..\\paycheck-atlas\\scripts\\build_dataset.py --help

The BLS and ACS endpoints are public downloads. BEA's API requires a free
BEA_API_KEY environment variable; the script keeps the RPP columns present
and reports the missing join when that key is not supplied.
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import zipfile
from pathlib import Path

import pandas as pd
import requests

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = PROJECT_ROOT / "data" / "raw"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
USER_AGENT = "Paycheck Atlas student research project"

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


def fetch_bytes(url: str, target: Path, force: bool = False) -> bytes:
    """Download a public file once and keep a local raw copy."""
    if target.exists() and not force:
        return target.read_bytes()
    target.parent.mkdir(parents=True, exist_ok=True)
    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=90)
    response.raise_for_status()
    target.write_bytes(response.content)
    return response.content


def find_header_row(raw: pd.DataFrame) -> int:
    for index, row in raw.iterrows():
        values = {str(value).strip().upper() for value in row.tolist()}
        if "OCC_CODE" in values and ("OCC_TITLE" in values or "AREA_TITLE" in values):
            return int(index)
    raise ValueError("Could not locate an OEWS header row.")


def read_bls_year(year: int, force: bool = False) -> pd.DataFrame:
    """Read the official BLS state OEWS workbook for one May survey year."""
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
        workbook = archive.read(candidates[0])

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
        data["source_sheet"].astype("string").str.upper().str.extract(r"\b([A-Z]{2})\b", expand=False)
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
    return data[required].drop_duplicates(["state_code", "year", "occupation_code"])


def read_acs_year(year: int, force: bool = False) -> pd.DataFrame:
    """Read state-level ACS housing and income context."""
    variables = "NAME,B25064_001E,B25077_001E,B19013_001E,B01003_001E"
    url = f"https://api.census.gov/data/{year}/acs/acs1"
    params = {"get": variables, "for": "state:*"}
    api_key = os.getenv("CENSUS_API_KEY")
    if api_key:
        params["key"] = api_key
    cache = RAW_DIR / f"acs_state_{year}.json"
    if cache.exists() and not force:
        payload = json.loads(cache.read_text(encoding="utf-8"))
    else:
        response = requests.get(url, params=params, headers={"User-Agent": USER_AGENT}, timeout=90)
        response.raise_for_status()
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(response.text, encoding="utf-8")
        payload = response.json()
    frame = pd.DataFrame(payload[1:], columns=payload[0])
    frame["state_code"] = frame["state"].map(STATE_FIPS)
    frame["year"] = year
    frame = frame.rename(columns={
        "B25064_001E": "median_gross_rent",
        "B25077_001E": "median_home_value",
        "B19013_001E": "median_household_income",
        "B01003_001E": "population",
    })
    for column in ["median_gross_rent", "median_home_value", "median_household_income", "population"]:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    return frame[["state_code", "year", "NAME", "median_gross_rent", "median_home_value", "median_household_income", "population"]]


def read_bea_rpp_year(year: int, force: bool = False) -> pd.DataFrame:
    """Read BEA SARPP lines when a BEA API key is available."""
    columns = ["state_code", "year", "rpp_all_items", "rpp_goods", "rpp_rents", "rpp_utilities", "rpp_other_services"]
    api_key = os.getenv("BEA_API_KEY")
    if not api_key:
        logging.warning("BEA_API_KEY is not set; RPP columns will remain missing for %s.", year)
        return pd.DataFrame(columns=columns)

    records: dict[str, dict[str, object]] = {}
    line_names = {1: "rpp_all_items", 2: "rpp_goods", 3: "rpp_rents", 4: "rpp_utilities", 5: "rpp_other_services"}
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


def build(years: list[int], force: bool = False) -> pd.DataFrame:
    wage_frames = [read_bls_year(year, force=force) for year in years]
    acs_frames = [read_acs_year(year, force=force) for year in years]
    rpp_frames = [read_bea_rpp_year(year, force=force) for year in years]
    wages = pd.concat(wage_frames, ignore_index=True)
    context = pd.concat(acs_frames, ignore_index=True)
    rpp = pd.concat([frame for frame in rpp_frames if not frame.empty], ignore_index=True) if any(not frame.empty for frame in rpp_frames) else pd.DataFrame()
    panel = wages.merge(context, on=["state_code", "year"], how="left", validate="many_to_one")
    if not rpp.empty:
        panel = panel.merge(rpp, on=["state_code", "year"], how="left", validate="many_to_one")
    else:
        for column in ["rpp_all_items", "rpp_goods", "rpp_rents", "rpp_utilities", "rpp_other_services"]:
            panel[column] = pd.NA
    panel["real_wage_at_national_price"] = panel["annual_median_wage"] / (panel["rpp_all_items"] / 100)
    panel["rent_share_of_median_income"] = panel["median_gross_rent"] * 12 / panel["median_household_income"]
    return panel.sort_values(["year", "state_code", "occupation_code"]).reset_index(drop=True)


def validate(panel: pd.DataFrame, years: list[int]) -> None:
    required = {
        "state_code", "year", "occupation_code", "occupation_title",
        "annual_mean_wage", "annual_median_wage", "annual_p25_wage",
        "annual_p75_wage", "median_gross_rent", "median_household_income",
        "rpp_all_items",
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
    rpp_coverage = panel["rpp_all_items"].notna().mean()
    if rpp_coverage == 0:
        logging.warning("The panel is structurally complete but has no BEA RPP coverage yet.")
    elif rpp_coverage < 0.95:
        logging.warning("BEA RPP coverage is only %.1f%%.", rpp_coverage * 100)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--years", nargs="+", type=int, default=list(range(2018, 2025)))
    parser.add_argument("--force", action="store_true", help="redownload cached raw files")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    panel = build(args.years, force=args.force)
    validate(panel, args.years)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    panel.to_csv(PROCESSED_DIR / "affordability_panel.csv", index=False)
    panel.to_parquet(PROCESSED_DIR / "affordability_panel.parquet", index=False)
    logging.info("Wrote processed panel to %s", PROCESSED_DIR)


if __name__ == "__main__":
    main()
