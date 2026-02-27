# Verifier Alliance Stats (Next.js)

Simple Next.js App Router dashboard for `https://export.verifieralliance.org/?prefix=v2/`.

## What this app does

- Exposes `GET /api/stats`:
  - Fetches the XML bucket listing from Verifier Alliance.
  - Parses listing entries into JSON.
  - Aggregates global stats and per-table stats.
- Exposes `GET /api/verified-contracts-daily`:
  - Reads `data/verified_contracts_daily_counts.csv`.
  - Returns a daily series (`day`, `count`) and summary metrics (`total`, latest day/count, 7d avg, 30d avg).
- Renders a dark stats dashboard on `/` with:
  - Hero section.
  - Summary cards (total files, total size, latest update).
  - Verified Contracts Daily section (summary cards, 60-day sparkline, latest 30-day table).
  - Per-table stats table.
  - Download commands (`aws s3 sync`, `curl`) and raw endpoint links.

## Local development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Refresh verified contracts daily counts CSV

The committed CSV lives at `data/verified_contracts_daily_counts.csv`.

To regenerate it from source parquet files:

```bash
python3 -m pip install duckdb
npm run refresh:verified-contracts
```

The refresh script (`scripts/refresh_verified_contracts_counts.py`) will:

1. List parquet files under `v2/verified_contracts/`.
2. Download each parquet into a temporary directory.
3. Aggregate daily counts with DuckDB.
4. Write the output CSV.
5. Delete temporary parquet files after completion.
