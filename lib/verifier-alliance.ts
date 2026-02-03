const BYTES_PER_GB = 1024 ** 3;
const MAX_LISTING_PAGES = 250;

export const VERIFIER_ALLIANCE_ORIGIN = "https://export.verifieralliance.org";
export const DATASET_PREFIX = "v2/";
export const RAW_LISTING_URL = `${VERIFIER_ALLIANCE_ORIGIN}/?prefix=${DATASET_PREFIX}`;

export const TABLES = [
  "verified_contracts",
  "sources",
  "compiled_contracts_sources",
  "compiled_contracts",
  "contract_deployments",
  "contracts",
  "code",
] as const;

export type TableName = (typeof TABLES)[number];

export interface ListingObject {
  key: string;
  size: number;
  lastModified: string;
}

export interface AggregateStats {
  files: number;
  sizeBytes: number;
  sizeGB: number;
  latestUpdate: string | null;
}

export interface TableStats extends AggregateStats {
  table: TableName;
  endpoint: string;
}

export interface VerifierAllianceStatsResponse {
  generatedAt: string;
  source: {
    origin: string;
    prefix: string;
    listingUrl: string;
    pagesFetched: number;
    pageUrls: string[];
  };
  totals: AggregateStats;
  tables: TableStats[];
  commands: {
    syncAll: string;
    curlListing: string;
  };
}

interface ParsedListingPage {
  objects: ListingObject[];
  isTruncated: boolean;
  nextMarker: string | null;
  nextContinuationToken: string | null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function getTagValue(source: string, tag: string): string | null {
  const match = source.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? decodeXml(match[1].trim()) : null;
}

function parseListingXml(xml: string): ParsedListingPage {
  const blocks = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? [];
  const objects: ListingObject[] = [];

  for (const block of blocks) {
    const key = getTagValue(block, "Key");
    const size = Number(getTagValue(block, "Size"));
    const lastModified = getTagValue(block, "LastModified");

    if (!key || !lastModified || Number.isNaN(size)) {
      continue;
    }

    objects.push({ key, size, lastModified });
  }

  const isTruncated = (getTagValue(xml, "IsTruncated") ?? "").toLowerCase() === "true";
  const nextMarker = getTagValue(xml, "NextMarker");
  const nextContinuationToken = getTagValue(xml, "NextContinuationToken");

  return { objects, isTruncated, nextMarker, nextContinuationToken };
}

async function fetchAllObjects(prefix: string): Promise<{ objects: ListingObject[]; pageUrls: string[] }> {
  const map = new Map<string, ListingObject>();
  const pageUrls: string[] = [];
  const seenTokens = new Set<string>();

  let marker: string | null = null;
  let continuationToken: string | null = null;

  for (let page = 0; page < MAX_LISTING_PAGES; page += 1) {
    const tokenKey = `${marker ?? ""}|${continuationToken ?? ""}`;
    if (seenTokens.has(tokenKey)) {
      break;
    }
    seenTokens.add(tokenKey);

    const url = new URL("/", VERIFIER_ALLIANCE_ORIGIN);
    url.searchParams.set("prefix", prefix);

    if (continuationToken) {
      url.searchParams.set("list-type", "2");
      url.searchParams.set("continuation-token", continuationToken);
    } else if (marker) {
      url.searchParams.set("marker", marker);
    }

    pageUrls.push(url.toString());

    const response = await fetch(url.toString(), {
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new Error(`Upstream listing request failed (${response.status}).`);
    }

    const xml = await response.text();
    const parsed = parseListingXml(xml);

    for (const object of parsed.objects) {
      map.set(object.key, object);
    }

    if (!parsed.isTruncated) {
      break;
    }

    if (parsed.nextContinuationToken) {
      continuationToken = parsed.nextContinuationToken;
      marker = null;
      continue;
    }

    marker = parsed.nextMarker ?? parsed.objects.at(-1)?.key ?? null;
    continuationToken = null;

    if (!marker) {
      break;
    }
  }

  return {
    objects: Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key)),
    pageUrls,
  };
}

function toGB(bytes: number): number {
  return bytes / BYTES_PER_GB;
}

function pickLatest(current: string | null, candidate: string): string {
  if (!current) {
    return candidate;
  }
  return Date.parse(candidate) > Date.parse(current) ? candidate : current;
}

function getTableFromKey(key: string): TableName | null {
  if (!key.startsWith(DATASET_PREFIX)) {
    return null;
  }

  const topLevel = key.slice(DATASET_PREFIX.length).split("/")[0] ?? "";
  const table = TABLES.find(
    (name) => topLevel === name || topLevel.startsWith(`${name}.`),
  );

  return table ?? null;
}

function emptyTableStat(table: TableName): TableStats {
  return {
    table,
    files: 0,
    sizeBytes: 0,
    sizeGB: 0,
    latestUpdate: null,
    endpoint: `${VERIFIER_ALLIANCE_ORIGIN}/?prefix=${DATASET_PREFIX}${table}/`,
  };
}

export async function getVerifierAllianceStats(): Promise<VerifierAllianceStatsResponse> {
  const { objects, pageUrls } = await fetchAllObjects(DATASET_PREFIX);

  let totalBytes = 0;
  let latestGlobal: string | null = null;

  const tableMap = new Map<TableName, TableStats>(TABLES.map((table) => [table, emptyTableStat(table)]));

  for (const object of objects) {
    totalBytes += object.size;
    latestGlobal = pickLatest(latestGlobal, object.lastModified);

    const table = getTableFromKey(object.key);
    if (!table) {
      continue;
    }

    const stat = tableMap.get(table);
    if (!stat) {
      continue;
    }

    stat.files += 1;
    stat.sizeBytes += object.size;
    stat.latestUpdate = pickLatest(stat.latestUpdate, object.lastModified);
  }

  const tables = TABLES.map((table) => {
    const stat = tableMap.get(table) ?? emptyTableStat(table);
    return {
      ...stat,
      sizeGB: toGB(stat.sizeBytes),
    };
  });

  const totals: AggregateStats = {
    files: objects.length,
    sizeBytes: totalBytes,
    sizeGB: toGB(totalBytes),
    latestUpdate: latestGlobal,
  };

  return {
    generatedAt: new Date().toISOString(),
    source: {
      origin: VERIFIER_ALLIANCE_ORIGIN,
      prefix: DATASET_PREFIX,
      listingUrl: RAW_LISTING_URL,
      pagesFetched: pageUrls.length,
      pageUrls,
    },
    totals,
    tables,
    commands: {
      syncAll: "aws s3 sync --no-sign-request s3://export.verifieralliance.org/v2 ./verifier-alliance-v2",
      curlListing: `curl -L "${RAW_LISTING_URL}" -o verifier-alliance-v2.xml`,
    },
  };
}

const numberFormatter = new Intl.NumberFormat("en-US");
const gbFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatSize(valueInGB: number): string {
  return `${gbFormatter.format(valueInGB)} GB`;
}

export function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })} UTC`;
}

export function getTableCommands(table: TableName): { sync: string; curl: string } {
  return {
    sync: `aws s3 sync --no-sign-request s3://export.verifieralliance.org/v2/${table} ./verifier-alliance-v2/${table}`,
    curl: `curl -L "${VERIFIER_ALLIANCE_ORIGIN}/?prefix=${DATASET_PREFIX}${table}/" -o ${table}.xml`,
  };
}
