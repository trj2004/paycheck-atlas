"""Create the small browser data contract from a validated panel.

Run from the fda-python repository root after build_dataset.py succeeds:

    uv run python paycheck-atlas/scripts/build_web_data.py

The generated JavaScript is intentionally a presentation layer. The full CSV
and Parquet panel remains the analytical source; this file contains only the
fields the static report and dashboard need to render in a browser.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "data" / "processed" / "affordability_panel.csv"
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "source-data.js"

STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii",
    "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming",
}

HOUSING = [
    {"id": "studio", "label": "Studio · 1 bath · 500 sq ft", "bedrooms": 0, "bathrooms": 1, "sqft": 500, "rentFactor": 1.0},
    {"id": "one-bedroom", "label": "1 bedroom · 1 bath · 750 sq ft", "bedrooms": 1, "bathrooms": 1, "sqft": 750, "rentFactor": 1.0},
    {"id": "two-bedroom", "label": "2 bedrooms · 1.5 baths · 1,000 sq ft", "bedrooms": 2, "bathrooms": 1.5, "sqft": 1000, "rentFactor": 1.0},
    {"id": "three-bedroom", "label": "3 bedrooms · 2 baths · 1,400 sq ft", "bedrooms": 3, "bathrooms": 2, "sqft": 1400, "rentFactor": 1.0},
]

HOUSEHOLDS = [
    {"id": "solo", "name": "Solo renter", "adults": 1, "children": 0, "home": 1.0, "food": 1.0, "health": 1.0, "transport": 1.0, "childcare": 0},
    {"id": "couple", "name": "Two adults", "adults": 2, "children": 0, "home": 1.28, "food": 1.58, "health": 1.55, "transport": 1.22, "childcare": 0},
    {"id": "family", "name": "Two adults + two children", "adults": 2, "children": 2, "home": 1.42, "food": 2.15, "health": 2.10, "transport": 1.42, "childcare": 1},
    {"id": "single-parent", "name": "One adult + one child", "adults": 1, "children": 1, "home": 1.20, "food": 1.46, "health": 1.45, "transport": 1.18, "childcare": 1},
]

MODES = [
    {"id": "essential", "name": "Essentials only", "discretionary": 0, "savings": 0, "description": "A minimum but adequate budget for core needs."},
    {"id": "balanced", "name": "Balanced life", "discretionary": 275, "savings": 350, "description": "Core needs plus modest personal spending and emergency savings."},
    {"id": "comfortable", "name": "Comfortable plan", "discretionary": 750, "savings": 800, "description": "More room for lifestyle choices, flexibility, and savings."},
]

PERCENTILES = {
    "lower": {"label": "25th percentile", "multiplier": 1.0},
    "median": {"label": "Median", "multiplier": 1.0},
    "upper": {"label": "75th percentile", "multiplier": 1.0},
}


def numeric(value: object) -> float | None:
    if pd.isna(value):
        return None
    return float(value)


def occupation_family(code: str) -> str:
    groups = {
        "11": "Management", "13": "Business & finance", "15": "Technology",
        "17": "Engineering", "19": "Science", "21": "Community & social service",
        "23": "Legal", "25": "Education", "27": "Arts & media", "29": "Health & care",
        "31": "Healthcare support", "33": "Protective service", "35": "Food service",
        "37": "Building & grounds", "39": "Personal care", "41": "Sales",
        "43": "Office & administration", "45": "Farming", "47": "Construction",
        "49": "Installation & repair", "51": "Production", "53": "Transportation",
}
    return groups.get(code[:2], "Other occupations")


def career_icon(family: str) -> str:
    return {
        "Health & care": "✚", "Technology": "</>", "Education": "✦",
        "Engineering": "⌁", "Construction": "ϟ", "Arts & media": "✎",
    }.get(family, "◈")


def career_id(code: str) -> str:
    return "occ-" + code.replace("-", "_")


def stable_career_id(title: str, code: str) -> str:
    lowered = title.lower()
    aliases = {
        "nurse": ("registered nurse", "registered nurses"),
        "developer": ("software developer", "web developer"),
        "teacher": ("secondary school teacher", "high school teacher"),
        "analyst": ("data scientist", "operations research analyst"),
        "electrician": ("electrician",),
        "mechanic": ("automotive service technician", "automotive technician"),
        "retail": ("first-line supervisors of retail sales workers",),
        "designer": ("graphic designer",),
    }
    for alias, keywords in aliases.items():
        if any(keyword in lowered for keyword in keywords):
            return alias
    return career_id(code)


def make_cpi(frame: pd.DataFrame) -> list[dict[str, float | int]]:
    rows = frame.groupby("year", as_index=False).first().sort_values("year")
    return [
        {
            "year": int(row.year),
            "all": numeric(row.cpi_all),
            "housing": numeric(row.cpi_shelter),
            "food": numeric(row.cpi_food),
            "transport": numeric(row.cpi_transport),
            "health": numeric(row.cpi_medical),
            "utilities": numeric(row.cpi_all),
            "other": numeric(row.cpi_all),
        }
        for row in rows.itertuples()
    ]


def make_states(frame: pd.DataFrame) -> list[dict[str, object]]:
    states: list[dict[str, object]] = []
    for code, state_frame in frame.groupby("state_code", sort=True):
        # The supplied inline map is a 50-state map. DC remains in the
        # analytical panel but is excluded from this geographic view so the
        # count and the visual map agree.
        if code == "DC":
            continue
        rpp_by_year: dict[str, dict[str, float | None]] = {}
        rent_by_year: dict[str, dict[str, float | None]] = {}
        for row in state_frame.drop_duplicates("year").itertuples():
            year = str(int(row.year))
            rpp_by_year[year] = {
                "all": numeric(row.rpp_all_items),
                "goods": numeric(row.rpp_goods),
                "rents": numeric(row.rpp_rents),
                "utilities": numeric(row.rpp_utilities),
                "otherServices": numeric(row.rpp_other_services),
            }
            rent_by_year[year] = {
                "0": numeric(row.median_gross_rent_0br),
                "1": numeric(row.median_gross_rent_1br),
                "2": numeric(row.median_gross_rent_2br),
                "3": numeric(row.median_gross_rent_3br),
            }
        latest = state_frame.sort_values("year").iloc[-1]
        latest_rpp = numeric(latest.rpp_all_items) or 100.0
        latest_rent = numeric(latest.median_gross_rent_1br) or numeric(latest.median_gross_rent) or 0.0
        states.append({
            "code": code,
            "name": STATE_NAMES.get(code, code),
            "rpp": latest_rpp,
            "rent": latest_rent,
            "transport": 380,
            "tax": 0.22,
            "rppByYear": rpp_by_year,
            "rentByYear": rent_by_year,
        })
    return states


def make_careers(frame: pd.DataFrame) -> tuple[list[dict[str, object]], list[str]]:
    careers: list[dict[str, object]] = []
    for code, occupation_frame in frame.groupby("occupation_code", sort=True):
        title = str(occupation_frame["occupation_title"].dropna().iloc[0])
        family = occupation_family(code)
        latest = occupation_frame[occupation_frame.year == occupation_frame.year.max()]
        base = numeric(latest["annual_median_wage"].median()) or 0.0
        wages: dict[str, dict[str, dict[str, float | None]]] = {}
        for (state, year), rows in occupation_frame.groupby(["state_code", "year"]):
            wages.setdefault(state, {})[str(int(year))] = {
                "lower": numeric(rows["annual_p25_wage"].median()),
                "median": numeric(rows["annual_median_wage"].median()),
                "upper": numeric(rows["annual_p75_wage"].median()),
            }
        careers.append({
            "id": stable_career_id(title, code),
            "name": title,
            "family": family,
            "icon": career_icon(family),
            "base": base,
            "occupationCode": code,
            "wages": wages,
        })

    keyword_groups = {
        "nurse": ("registered nurse", "nursing"),
        "developer": ("software developer", "web developer"),
        "teacher": ("secondary school teachers", "high school teachers"),
        "analyst": ("data scientist", "operations research analyst"),
        "electrician": ("electrician",),
    }
    featured: list[str] = []
    for keywords in keyword_groups.values():
        match = next((item for item in careers if any(keyword in item["name"].lower() for keyword in keywords)), None)
        if match:
            featured.append(str(match["id"]))
    featured.extend(item["id"] for item in careers if item["id"] not in featured)
    return careers, featured[:12]


def build_payload(frame: pd.DataFrame) -> dict[str, object]:
    years = sorted(int(year) for year in frame["year"].unique())
    careers, featured = make_careers(frame)
    states = make_states(frame)
    return {
        "metadata": {
            "status": "source-backed",
            "statusLabel": "Source-backed data · validated panel",
            "statusScope": "This view uses the validated occupation × state × year panel plus clearly labeled household and budget assumptions.",
            "statusNote": "These calculations use the validated occupation × state × year panel. Taxes, household size, savings, bathrooms, square footage, and discretionary spending remain explicit scenario assumptions.",
            "sourceBacked": True,
        },
        "years": years,
        "cpi": make_cpi(frame),
        "housing": HOUSING,
        "states": states,
        "careers": careers,
        "featuredCareerIds": featured,
        "defaultCareerId": featured[0] if featured else careers[0]["id"],
        "defaultStateCode": "TX" if any(item["code"] == "TX" for item in states) else states[0]["code"],
        "defaultCompareStateCode": "CA" if any(item["code"] == "CA" for item in states) else states[-1]["code"],
        "households": HOUSEHOLDS,
        "modes": MODES,
        "percentiles": PERCENTILES,
        "model": {
            "taxRate": 0.22,
            "food": 460,
            "health": 315,
            "transport": 380,
            "utilities": 190,
            "other": 245,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    source = args.input
    if not source.exists():
        raise FileNotFoundError(
            f"Validated panel not found at {source}. Run build_dataset.py successfully first."
        )
    frame = pd.read_parquet(source) if source.suffix.lower() == ".parquet" else pd.read_csv(source)
    required = {
        "state_code", "year", "occupation_code", "occupation_title", "annual_p25_wage",
        "annual_median_wage", "annual_p75_wage", "median_gross_rent", "median_gross_rent_0br",
        "median_gross_rent_1br", "median_gross_rent_2br", "median_gross_rent_3br", "rpp_all_items",
        "rpp_goods", "rpp_rents", "rpp_utilities", "rpp_other_services", "cpi_all", "cpi_food",
        "cpi_shelter", "cpi_transport", "cpi_medical",
    }
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"Validated panel is missing web fields: {sorted(missing)}")
    if frame[["annual_median_wage", "median_gross_rent_1br", "rpp_all_items", "cpi_all"]].isna().any().any():
        raise ValueError("Validated panel contains missing values in browser-critical fields.")
    payload = build_payload(frame)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    args.output.write_text(
        "// Generated from the validated source-backed panel. Do not hand-edit.\n"
        "window.PAYCHECK_ATLAS_SOURCE = " + serialized + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {args.output} with {len(frame):,} panel rows, {len(payload['states'])} states, and {len(payload['careers'])} occupations.")


if __name__ == "__main__":
    main()
