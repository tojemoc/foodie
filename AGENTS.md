# Foodie — Food & Grocery Tracker

PWA food / grocery tracker with passkey + magic-link auth and Cloudflare KV sync. Two packages: Vite frontend (repo root) and Cloudflare Worker API (`worker/`).

**Version:** `2.1.4` · Vanilla TypeScript (not React) · long-term goal: native mobile app on a stable Worker API.

## Project status (for agents)

### How we got here
1. **React PoC** — Vite + React grocery expiry PWA (ZXing, Tesseract OCR, Dexie IndexedDB, Open Food Facts). Proved scan → place → track; stayed local-only.
2. **Architecture reset** — Repo switched to the **Cardex** vanilla-TS shell (passkey/magic-link + KV sync + offline cache). Auth/sync mattered more than keeping the React PoC.
3. **Rebrand + product** — Cardex rebranded to **Foodie**; grocery features rebuilt on that shell (wizard, scan, OCR, digests, expiry UI).

### Landed features
- Passkey (WebAuthn) + magic link (Brevo) + JWT session gate
- Cloud-primary KV sync, localStorage offline cache, LWW merge + tombstones
- Add/edit/delete, search, JSON export/import, placement wizard, fresh-item templates
- Barcode scan (`BarcodeDetector` + ZXing), Open Food Facts lookup, expiry OCR (`TextDetector`)
- Expiry-focused UI, in-app expiry notifications, daily Worker cron digest email
- Staging/production GitHub Actions, Dependabot auto-merge, iOS PWA auth hint

### Roadmap
- Near term: passkey list/revoke, install CTA, broader OCR, shared/family inventories, prod hardening
- **Long term: native iOS/Android app** — PWA is intentional first; keep Worker API + card schema stable so a native client (Capacitor / RN / native) can reuse them

Prefer reading `README.md` for the full narrative and deploy URLs.

## Cursor Cloud specific instructions

### Project structure
- **Frontend** (root): Vanilla TypeScript + Vite 8, PWA via `vite-plugin-pwa`. Dev server: `npm run dev` → `http://localhost:5173`
- **Worker API** (`worker/`): Cloudflare Worker + Wrangler 4. Dev server: `cd worker && npm run dev` → `http://localhost:8787` (local KV emulated by Miniflare). Existing `wrangler.toml` and deploy scripts are v4-compatible.

### Local environment files (not committed)
- `.env.local` at root — must contain `VITE_API_URL=http://localhost:8787`
- `worker/.dev.vars` — must contain `JWT_SECRET=<any-random-string>` (and optionally `BREVO_API_KEY` for magic-link + digest email)

### Running dev servers
Start both servers — order doesn't matter:
```
# Terminal 1 — Worker API
cd worker && npm run dev

# Terminal 2 — Frontend
npm run dev
```
The worker uses `wrangler dev` which emulates KV locally in `.wrangler/` — no Cloudflare account needed for local dev.

### Lint / type-check
- Frontend: `npm run type-check`
- Worker: `cd worker && npm run type-check`
- No ESLint or Prettier configured in this repo.

### Build
- `npm run build` (`tsc && vite build`) — `manualChunks` in `vite.config.ts` is already a function (Rolldown-compatible). If build fails, check Vite/Rolldown peer issues and `vite-plugin-pwa` first.
- Dev server is the reliable local path regardless.

### CORS for local dev
The worker reads `Origin` and reflects it in CORS responses. `http://localhost:5173` works with `wrangler dev`.

### Dependencies
- `npm install --legacy-peer-deps` at root (`vite-plugin-pwa@1.x` peer range does not cover `vite@8`).
- `npm install` in `worker/` needs no special flags.

### Passkey auth on localhost
Chrome allows WebAuthn on `localhost` without HTTPS. The worker’s `FRONTEND_RP_ID` in `wrangler.toml` usually points at staging/prod; passkey registration may fail locally with an RP ID mismatch. Item CRUD works fully in offline/localStorage mode without authentication.

### Deploy reminders
- Staging: push to `main` → `.github/workflows/staging.yml`
- Production: tag `v*` → `.github/workflows/release.yml`
- Cron digest: `[triggers] crons = ["0 6 * * *"]` in `worker/wrangler.toml`; requires `BREVO_API_KEY`
