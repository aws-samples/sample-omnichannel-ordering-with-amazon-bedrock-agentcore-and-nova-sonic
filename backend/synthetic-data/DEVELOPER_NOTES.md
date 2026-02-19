# Developer Notes — Synthetic Data

Lessons learned while building the data generation pipeline.

## Speech-Friendly Addresses from Geo Places API

The AWS Geo Places API returns addresses with abbreviations in the `Label` field (e.g., "526 Centennial Blvd, Richardson, TX 75081"). Speech models read these literally — "Blvd" becomes "B L V D" and "TX" becomes "Tea Ex".

**Solution:** Build addresses from the structured API response fields instead of using `Label`:

| Field | Returns | Example |
|-------|---------|---------|
| `Region.Name` | Full state/province name | "Texas" (not "TX") |
| `Country.Name` | Full country name | "United States" (not "US") |
| `Locality` | City name | "Richardson" |
| `StreetComponents[].BaseName` | Street base name | "Centennial" |
| `StreetComponents[].Type` | Street type abbreviation | "Blvd" |
| `StreetComponents[].TypePlacement` | Before or after base name | "AfterBaseName" |
| `AddressNumber` | House number | "526" |

The data generator (`lib/geo_places.py`) builds the address from these fields and the `lib/data_generator.py` applies a street abbreviation expansion as a safety net (e.g., "Blvd" → "Boulevard").

**Important:** `Municipality` (used in older Location Service APIs) is NOT the correct field for city name in the Geo Places API. Use `Locality` instead. `SubRegion` returns the county (e.g., "Dallas County"), not the city.

## Tested Internationally

The structured field approach was tested with both US and Chilean addresses. The fields are consistent across countries:
- US: `Region.Name` = "Texas", `Locality` = "Richardson"
- Chile: `Region.Name` = "Región Metropolitana de Santiago", `Locality` = "Peñalolén"

Street type placement varies by language (`TypePlacement: "AfterBaseName"` for English, `"BeforeBaseName"` for Spanish), and the code handles both.

## Data Cleanup Before Repopulation

When repopulating synthetic data (e.g., switching from pizza locations to burger locations), the old records must be deleted first. DynamoDB `put_item` only overwrites matching keys — if the new dataset has fewer locations, the old extras remain.

The `cleanup_data.py` script scans and batch-deletes all items from Locations, Menu, Orders, and Carts tables. It accepts a `--force` flag for non-interactive use (called by `deploy-all.sh` during repopulation).

## Brand Names

Do not use real brand names in examples, prompts, or documentation. The synthetic data generator prompts users to search for generic terms like "pizza", "burgers", or "coffee shop" instead of specific chains.
