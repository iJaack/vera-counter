import Link from "next/link";
import {
  RAW_LISTING_URL,
  formatDate,
  formatNumber,
  formatSize,
  getTableCommands,
  getVerifierAllianceStats,
} from "@/lib/verifier-alliance";

export const revalidate = 3600;

export default async function Page() {
  try {
    const stats = await getVerifierAllianceStats();

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
