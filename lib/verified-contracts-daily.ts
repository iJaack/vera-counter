import { readFile } from "node:fs/promises";
import path from "node:path";

const VERIFIED_CONTRACTS_DAILY_CSV_PATH = path.join(
  process.cwd(),
  "data",
  "verified_contracts_daily_counts.csv",
);
const EXPECTED_HEADER = "day,count";

export interface VerifiedContractsDailyPoint {
  day: string;
  count: number;
}

export interface VerifiedContractsDailySummary {
  total: number;
  latestDay: string | null;
  latestCount: number | null;
  average7d: number;
  average30d: number;
}

export interface VerifiedContractsDailyData {
  series: VerifiedContractsDailyPoint[];
  summary: VerifiedContractsDailySummary;
}

function parseLine(line: string): VerifiedContractsDailyPoint {
  const [rawDay, rawCount, ...rest] = line.split(",");
  const day = rawDay?.trim() ?? "";
  const count = Number(rawCount?.trim());

  if (rest.length > 0 || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`Invalid CSV row: "${line}"`);
  }

  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`Invalid CSV count value: "${line}"`);
  }

  return { day, count };
}

function parseCsv(csv: string): VerifiedContractsDailyPoint[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const [header, ...rows] = lines;
  if (header.toLowerCase() !== EXPECTED_HEADER) {
    throw new Error(`Unexpected CSV header. Expected "${EXPECTED_HEADER}" but got "${header}".`);
  }

  const dayCounts = new Map<string, number>();

  for (const row of rows) {
    const entry = parseLine(row);
    dayCounts.set(entry.day, (dayCounts.get(entry.day) ?? 0) + entry.count);
  }

  return Array.from(dayCounts.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

function getRecentAverage(series: VerifiedContractsDailyPoint[], windowSize: number): number {
  const recent = series.slice(-windowSize);
  if (!recent.length) {
    return 0;
  }

  const total = recent.reduce((sum, entry) => sum + entry.count, 0);
  return Number((total / recent.length).toFixed(2));
}

function summarizeSeries(series: VerifiedContractsDailyPoint[]): VerifiedContractsDailySummary {
  const total = series.reduce((sum, entry) => sum + entry.count, 0);
  const latest = series.at(-1);

  return {
    total,
    latestDay: latest?.day ?? null,
    latestCount: latest?.count ?? null,
    average7d: getRecentAverage(series, 7),
    average30d: getRecentAverage(series, 30),
  };
}

export async function getVerifiedContractsDailyData(
  csvPath: string = VERIFIED_CONTRACTS_DAILY_CSV_PATH,
): Promise<VerifiedContractsDailyData> {
  let csv: string;

  try {
    csv = await readFile(csvPath, "utf8");
  } catch (error) {
    throw new Error(`Failed to read verified contracts CSV at "${csvPath}".`, { cause: error });
  }

  const series = parseCsv(csv);

  return {
    series,
    summary: summarizeSeries(series),
  };
}
