# Verifier Alliance Stats (Next.js)

Simple Next.js App Router dashboard for `https://export.verifieralliance.org/?prefix=v2/`.

## What this app does

- Exposes `GET /api/stats`:
  - Fetches the XML bucket listing from Verifier Alliance.
  - Parses listing entries into JSON.
  - Aggregates global stats and per-table stats.
- Renders a dark stats dashboard on `/` with:
  - Hero section.
  - Summary cards (total files, total size, latest update).
  - Per-table stats table.
  - Download commands (`aws s3 sync`, `curl`) and raw endpoint links.

## Local development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.
