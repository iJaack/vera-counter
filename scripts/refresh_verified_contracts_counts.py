#!/usr/bin/env python3
"""
Regenerate data/verified_contracts_daily_counts.csv from verified_contracts parquet files.
"""

from __future__ import annotations

import argparse
import html
import re
import shutil
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

VERIFIER_ALLIANCE_ORIGIN = "https://export.verifieralliance.org"
VERIFIED_CONTRACTS_PREFIX = "v2/verified_contracts/"
MAX_LISTING_PAGES = 500
REQUEST_TIMEOUT_SECONDS = 120
USER_AGENT = "vera-counter-refresh/1.0"
REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_PATH = REPO_ROOT / "data" / "verified_contracts_daily_counts.csv"


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
      description=(
          "Download verified_contracts parquet files, aggregate daily counts with duckdb, "
          "and write a CSV output."
      ),
  )
  parser.add_argument(
      "--output",
      default=str(DEFAULT_OUTPUT_PATH),
      help="CSV output path (default: data/verified_contracts_daily_counts.csv)",
  )
  return parser.parse_args()


def get_tag_value(source: str, tag: str) -> str | None:
  match = re.search(rf"<{tag}>([\s\S]*?)</{tag}>", source)
  if not match:
    return None
  return html.unescape(match.group(1).strip())


def fetch_url_bytes(url: str) -> bytes:
  request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
  with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
    return response.read()


def list_verified_contract_parquets() -> list[str]:
  keys: list[str] = []
  marker: str | None = None
  continuation_token: str | None = None
  seen_tokens: set[str] = set()

  for _ in range(MAX_LISTING_PAGES):
    token_key = f"{marker or ''}|{continuation_token or ''}"
    if token_key in seen_tokens:
      break
    seen_tokens.add(token_key)

    query: dict[str, str] = {"prefix": VERIFIED_CONTRACTS_PREFIX}
    if continuation_token:
      query["list-type"] = "2"
      query["continuation-token"] = continuation_token
    elif marker:
      query["marker"] = marker

    listing_url = f"{VERIFIER_ALLIANCE_ORIGIN}/?{urllib.parse.urlencode(query)}"
    print(f"[list] {listing_url}")
    xml = fetch_url_bytes(listing_url).decode("utf-8")

    blocks = re.findall(r"<Contents>[\s\S]*?</Contents>", xml)
    page_keys: list[str] = []
    for block in blocks:
      key = get_tag_value(block, "Key")
      if key and key.startswith(VERIFIED_CONTRACTS_PREFIX) and key.endswith(".parquet"):
        page_keys.append(key)
        keys.append(key)

    is_truncated = (get_tag_value(xml, "IsTruncated") or "").lower() == "true"
    if not is_truncated:
      break

    next_continuation_token = get_tag_value(xml, "NextContinuationToken")
    next_marker = get_tag_value(xml, "NextMarker")

    if next_continuation_token:
      continuation_token = next_continuation_token
      marker = None
      continue

    continuation_token = None
    marker = next_marker or (page_keys[-1] if page_keys else None)
    if not marker:
      break

  return sorted(set(keys))


def download_parquet_files(keys: list[str], download_dir: Path) -> None:
  total = len(keys)
  for index, key in enumerate(keys, start=1):
    relative_path = Path(key.removeprefix(VERIFIED_CONTRACTS_PREFIX))
    local_path = download_dir / relative_path
    local_path.parent.mkdir(parents=True, exist_ok=True)

    file_url = f"{VERIFIER_ALLIANCE_ORIGIN}/{urllib.parse.quote(key, safe='/')}"
    print(f"[download {index}/{total}] {key}")

    request = urllib.request.Request(file_url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
      with local_path.open("wb") as output_file:
        shutil.copyfileobj(response, output_file)


def aggregate_daily_counts(parquet_glob: str, output_path: Path) -> tuple[str, int]:
  try:
    import duckdb  # type: ignore
  except ModuleNotFoundError as error:
    raise RuntimeError(
        "duckdb is required. Install it with: python3 -m pip install duckdb",
    ) from error

  connection = duckdb.connect(database=":memory:")
  try:
    schema_rows = connection.execute(
        "DESCRIBE SELECT * FROM read_parquet(?)",
        [parquet_glob],
    ).fetchall()
    columns = [str(row[0]) for row in schema_rows]
    candidate_columns = (
        "created_at",
        "verified_at",
        "inserted_at",
        "updated_at",
        "timestamp",
        "block_timestamp",
        "date",
    )
    timestamp_column = next((name for name in candidate_columns if name in columns), None)

    if not timestamp_column:
      raise RuntimeError(
          f"Could not find a timestamp column in parquet schema. Columns: {', '.join(columns)}",
      )

    quoted_column = f'"{timestamp_column.replace("\"", "\"\"")}"'
    query = f"""
      COPY (
        WITH rows AS (
          SELECT TRY_CAST({quoted_column} AS TIMESTAMP) AS ts
          FROM read_parquet(?)
        )
        SELECT CAST(date_trunc('day', ts) AS DATE) AS day, COUNT(*)::BIGINT AS count
        FROM rows
        WHERE ts IS NOT NULL
        GROUP BY 1
        ORDER BY 1
      ) TO ? (FORMAT CSV, HEADER TRUE);
    """

    output_path.parent.mkdir(parents=True, exist_ok=True)
    connection.execute(query, [parquet_glob, str(output_path)])

    row_result = connection.execute(
        "SELECT COUNT(*) FROM read_csv_auto(?)",
        [str(output_path)],
    ).fetchone()
    row_count = int(row_result[0]) if row_result else 0
    return timestamp_column, row_count
  finally:
    connection.close()


def main() -> None:
  args = parse_args()
  output_path = Path(args.output).expanduser().resolve()

  parquet_keys = list_verified_contract_parquets()
  if not parquet_keys:
    raise RuntimeError("No parquet files were found for v2/verified_contracts.")

  print(f"Found {len(parquet_keys)} parquet files.")

  with tempfile.TemporaryDirectory(prefix="verified_contracts_daily_") as temp_dir_name:
    temp_dir = Path(temp_dir_name)
    download_parquet_files(parquet_keys, temp_dir)
    parquet_glob = str(temp_dir / "**" / "*.parquet")
    timestamp_column, rows_written = aggregate_daily_counts(parquet_glob, output_path)

  print(
      f"Wrote {output_path} using '{timestamp_column}' as the timestamp column "
      f"({rows_written} daily rows).",
  )


if __name__ == "__main__":
  main()
