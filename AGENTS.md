# Agents

## Cursor Cloud-specific instructions

This repository is a **Foodie** PWA — a grocery expiry tracker built with Vite + React + TypeScript.

### Tech stack
- **Frontend**: React 19, TypeScript, Vite 8, react-router-dom v7
- **PWA**: vite-plugin-pwa (Workbox)
- **Storage**: IndexedDB via Dexie.js
- **Scanning**: @zxing/library (barcode), Tesseract.js (OCR)
- **External API**: Open Food Facts (product lookup by EAN)

### Running the dev server
```
npm run dev
```
Serves on `http://localhost:5173` (binds to `0.0.0.0`).

### Key commands
| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | TypeScript check + production build |
| `npm run lint` | ESLint check |
| `npm run preview` | Preview production build |

### Caveats for Cloud VMs
- **Camera APIs**: `getUserMedia` is not available in headless environments. The "Add Item" flow offers a "Skip — Enter manually" button at both barcode and expiry-scan steps, so manual testing works fine without a camera.
- **Notifications**: Browser notifications require user permission. In headless Chrome they may not display, but the scheduler logic still executes correctly.
- **Tesseract.js**: First OCR call downloads language data (~4 MB). Subsequent calls reuse the cached worker.
- **Vite version**: Pinned to Vite 7.x so all peer dependencies (including `vite-plugin-pwa`) resolve cleanly without `--legacy-peer-deps`.
