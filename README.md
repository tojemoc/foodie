# Foodie

Grocery expiry tracking PWA with barcode scanning, OCR date extraction, and push notifications.

## Quick Start

```bash
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`.

## Features

- **Barcode scanning** — Scan EAN/UPC barcodes using `@zxing/library` and auto-lookup products via the Open Food Facts API.
- **OCR date extraction** — Capture expiry dates from packaging using `tesseract.js` with an image-preprocessing pipeline (grayscale, contrast, binarization, upscaling).
- **Date parsing engine** — Regex-based extraction supporting DD/MM/YYYY, YYYY-MM-DD, MM/YY, DD MMM YYYY and more, with heuristic confidence scoring.
- **IndexedDB persistence** — Local-first storage via `Dexie.js` for items and storage locations.
- **Expiry notifications** — On-open checks for items expiring in 3 days, 1 day, or already expired.
- **Installable PWA** — Service worker via `vite-plugin-pwa` (Workbox) with offline caching and add-to-homescreen support.

## Scripts

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start Vite dev server with HMR       |
| `npm run build`   | TypeScript check + production build   |
| `npm run lint`    | Run ESLint                            |
| `npm run preview` | Preview production build              |

## Testing

Tests are not configured yet. The intended command is `npm test`.

## CI/CD (Cloudflare Pages + Worker)

Workflows live under `.github/workflows/` (modeled after [cardex](https://github.com/tojemoc/cardex/tree/main/.github/workflows)):

| Workflow | When | What |
| -------- | ---- | ---- |
| **CI** | PRs and pushes to `main` | Lint + build the PWA; typecheck the Worker |
| **Deploy to Staging** | Push to `main` (ignores `.github/**` and `*.md`) | Deploy Worker to `foodie-api-staging`, then `pages deploy` to the staging Pages project |
| **Release to Production** | Tag push `v*` (e.g. `v0.1.0`) | Deploy Worker `foodie-api`, production Pages deploy, GitHub Release |

**GitHub secrets** (repository → Settings → Secrets):

- `CLOUDFLARE_API_TOKEN` — [API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) with Workers deploy + Pages deploy (and Account read).
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID.
- `CLOUDFLARE_PAGES_PROJECT_STAGING` — Staging Pages project name (create the project once in the dashboard).
- `CLOUDFLARE_PAGES_PROJECT_PRODUCTION` — Production Pages project name.

**Worker** (`worker/`): minimal `GET /health` and `GET /version` for monitoring; extend later for APIs. Local: `cd worker && npm ci && npm run dev`.

## Caveats

- **Camera APIs**: `getUserMedia` is unavailable in headless/VM environments. The add-item flow provides "Skip — Enter manually" buttons as a fallback.
- **Notifications**: Browser notifications require user permission and may not display in headless Chrome, though scheduler logic still runs.
- **Tesseract.js**: The first OCR call downloads English language data (~4 MB). Subsequent calls reuse the cached worker.
- **Vite version**: Pinned to Vite 7.x for `vite-plugin-pwa` peer-dependency compatibility.

## Tech Stack

React 19 · TypeScript · Vite 7 · react-router-dom · Dexie.js · @zxing/library · tesseract.js · vite-plugin-pwa

## License

[GPL-2.0](LICENSE)
