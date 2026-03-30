# Frontend

React + Vite frontend for the Coloring Book Generator.

## Setup

```bash
npm install
```

## Run (dev)

```bash
npm run dev
# http://localhost:5173
```

Vite proxies `/jobs`, `/generated`, and `/health` to `http://localhost:8000`,
so no CORS configuration is needed in development.

## Build (production)

```bash
npm run build
```

Static files are output to `dist/`.
