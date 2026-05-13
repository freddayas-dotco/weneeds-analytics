# Weneeds Analytics API

NestJS API exposing cleaned analytics CSVs (`data/clean/*.csv`) as JSON for Power BI Desktop.

## Install & run

```bash
npm install
npm run start
```

The server listens on `http://localhost:3000` with CORS enabled.

## Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/health` | Liveness check |
| GET | `/analytics/summary` | Global KPIs |
| GET | `/analytics/top-pages?limit=20` | Most viewed pages |
| GET | `/analytics/traffic-sources` | Sessions grouped by source |
| GET | `/analytics/devices` | Sessions grouped by device + % |
| GET | `/analytics/timeline?groupBy=month` | Sessions over time (`month` \| `day` \| `hour`) |
| GET | `/analytics/browsers` | Sessions grouped by browser |

## Power BI

In Power BI Desktop: **Get Data → Web → URL** = `http://localhost:3000/analytics/<endpoint>`.
