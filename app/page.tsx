import Link from "next/link";
import {
  RAW_LISTING_URL,
  formatDate,
  formatNumber,
  formatSize,
  getTableCommands,
  getVerifierAllianceStats,
} from "@/lib/verifier-alliance";
import {
  getVerifiedContractsDailyData,
  type VerifiedContractsDailyPoint,
} from "@/lib/verified-contracts-daily";

export const revalidate = 3600;

const averageFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatDay(day: string | null): string {
  if (!day) {
    return "-";
  }

  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return day;
  }

  return date.toLocaleDateString("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}

function buildSparklinePoints(
  series: VerifiedContractsDailyPoint[],
  width: number,
  height: number,
): string {
  if (!series.length) {
    return "";
  }

  const counts = series.map((entry) => entry.count);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const range = max - min || 1;
  const step = series.length > 1 ? (width - 8) / (series.length - 1) : 0;

  return series
    .map((entry, index) => {
      const x = 4 + index * step;
      const y = height - 4 - ((entry.count - min) / range) * (height - 8);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export default async function Page() {
  try {
    const stats = await getVerifierAllianceStats();
    const verifiedDaily = await getVerifiedContractsDailyData();
    const sparklineWidth = 560;
    const sparklineHeight = 120;
    const sparklineSeries = verifiedDaily.series.slice(-60);
    const sparklinePoints = buildSparklinePoints(
      sparklineSeries,
      sparklineWidth,
      sparklineHeight,
    );
    const tableRows = [...verifiedDaily.series.slice(-30)].reverse();
    const sparklineMin = sparklineSeries.length
      ? Math.min(...sparklineSeries.map((point) => point.count))
      : null;
    const sparklineMax = sparklineSeries.length
      ? Math.max(...sparklineSeries.map((point) => point.count))
      : null;

    return (
      <main className="page">
        <section className="hero">
          <p className="kicker">Verifier Alliance Dataset</p>
          <h1>v2 Export Stats</h1>
          <p className="heroText">
            Live snapshot of the Verifier Alliance export bucket. Metrics are refreshed on a one-hour cadence.
          </p>
          <div className="linkRow">
            <a href={RAW_LISTING_URL} target="_blank" rel="noreferrer">
              Raw XML listing
            </a>
            <Link href="/api/stats">JSON API route</Link>
            <Link href="/api/verified-contracts-daily">Verified daily API</Link>
          </div>
        </section>

        <section className="cardGrid">
          <article className="card">
            <p className="cardLabel">Total files</p>
            <p className="cardValue">{formatNumber(stats.totals.files)}</p>
          </article>
          <article className="card">
            <p className="cardLabel">Total size</p>
            <p className="cardValue">{formatSize(stats.totals.sizeGB)}</p>
          </article>
          <article className="card">
            <p className="cardLabel">Latest update</p>
            <p className="cardValue">{formatDate(stats.totals.latestUpdate)}</p>
          </article>
        </section>

        <section className="panel">
          <h2>Verified Contracts Daily</h2>
          <p className="panelText">
            Daily counts from <code>data/verified_contracts_daily_counts.csv</code>.
          </p>
          <div className="dailySummaryGrid">
            <article className="card compactCard">
              <p className="cardLabel">Total verified contracts</p>
              <p className="cardValue">{formatNumber(verifiedDaily.summary.total)}</p>
            </article>
            <article className="card compactCard">
              <p className="cardLabel">Latest day</p>
              <p className="cardValue">{formatDay(verifiedDaily.summary.latestDay)}</p>
            </article>
            <article className="card compactCard">
              <p className="cardLabel">Latest count</p>
              <p className="cardValue">
                {verifiedDaily.summary.latestCount === null
                  ? "-"
                  : formatNumber(verifiedDaily.summary.latestCount)}
              </p>
            </article>
            <article className="card compactCard">
              <p className="cardLabel">7-day average</p>
              <p className="cardValue">{averageFormatter.format(verifiedDaily.summary.average7d)}</p>
            </article>
            <article className="card compactCard">
              <p className="cardLabel">30-day average</p>
              <p className="cardValue">{averageFormatter.format(verifiedDaily.summary.average30d)}</p>
            </article>
          </div>

          <div className="dailyLayout">
            <article className="dailyTrend">
              <p className="commandTitle">Trend (last 60 days)</p>
              {sparklinePoints ? (
                <>
                  <svg
                    className="sparkline"
                    viewBox={`0 0 ${sparklineWidth} ${sparklineHeight}`}
                    role="img"
                    aria-label="Verified contracts daily count trend"
                  >
                    <polyline points={sparklinePoints} />
                  </svg>
                  <p className="sparkMeta">
                    Min {sparklineMin === null ? "-" : formatNumber(sparklineMin)} | Max{" "}
                    {sparklineMax === null ? "-" : formatNumber(sparklineMax)}
                  </p>
                </>
              ) : (
                <p className="panelText">No trend data available.</p>
              )}
            </article>

            <article className="dailyTable">
              <p className="commandTitle">Latest 30 days</p>
              <div className="tableWrap">
                <table className="compactTable">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!tableRows.length ? (
                      <tr>
                        <td colSpan={2}>No rows available.</td>
                      </tr>
                    ) : (
                      tableRows.map((entry) => (
                        <tr key={entry.day}>
                          <td>{formatDay(entry.day)}</td>
                          <td>{formatNumber(entry.count)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        </section>

        <section className="panel">
          <h2>Per-table stats</h2>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Files</th>
                  <th>Size</th>
                  <th>Latest update</th>
                  <th>Raw endpoint</th>
                </tr>
              </thead>
              <tbody>
                {stats.tables.map((table) => (
                  <tr key={table.table}>
                    <td>{table.table}</td>
                    <td>{formatNumber(table.files)}</td>
                    <td>{formatSize(table.sizeGB)}</td>
                    <td>{formatDate(table.latestUpdate)}</td>
                    <td>
                      <a href={table.endpoint} target="_blank" rel="noreferrer">
                        View listing
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <h2>Download commands</h2>
          <div className="commandCard">
            <p className="commandTitle">Full dataset (aws s3 sync)</p>
            <pre>{stats.commands.syncAll}</pre>
          </div>
          <div className="commandCard">
            <p className="commandTitle">Full listing (curl)</p>
            <pre>{stats.commands.curlListing}</pre>
          </div>
          <div className="commandGrid">
            {stats.tables.map((table) => {
              const commands = getTableCommands(table.table);

              return (
                <article className="smallCommandCard" key={table.table}>
                  <h3>{table.table}</h3>
                  <p className="commandTitle">aws s3 sync</p>
                  <pre>{commands.sync}</pre>
                  <p className="commandTitle">curl</p>
                  <pre>{commands.curl}</pre>
                </article>
              );
            })}
          </div>
        </section>

        <p className="meta">
          Generated {formatDate(stats.generatedAt)} from {stats.source.pagesFetched} listing request(s).
        </p>
      </main>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return (
      <main className="page">
        <section className="hero">
          <p className="kicker">Verifier Alliance Dataset</p>
          <h1>v2 Export Stats</h1>
          <p className="heroText">Unable to load the current listing snapshot.</p>
          <div className="linkRow">
            <a href={RAW_LISTING_URL} target="_blank" rel="noreferrer">
              Raw XML listing
            </a>
            <Link href="/api/stats">JSON API route</Link>
            <Link href="/api/verified-contracts-daily">Verified daily API</Link>
          </div>
        </section>
        <section className="panel">
          <h2>Fetch error</h2>
          <p>{message}</p>
        </section>
      </main>
    );
  }
}
