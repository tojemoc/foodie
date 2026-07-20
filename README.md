# Foodie — Food & Grocery Tracker

A PWA that tracks food and grocery items (expiry, placement, product lookup) with passkey / magic-link auth and Cloudflare KV sync.

**Current version:** `2.1.4`  
**Stack:** Vanilla TypeScript + Vite 8 frontend · Cloudflare Worker API · KV · Brevo email · `vite-plugin-pwa`

```
foodie/
├── src/                     # Vite + TypeScript frontend
│   ├── api.ts               # Worker fetch client
│   ├── types.ts             # Shared Card / Session types
│   ├── main.ts              # App entry, event wiring
│   ├── auth/                # Passkey, magic link, JWT session
│   ├── cards/               # localStorage store, sync, LWW merge
│   ├── scanner/             # Camera barcode + expiry OCR
│   ├── services/            # Open Food Facts lookup
│   ├── notifications/       # In-app expiry alerts
│   ├── ui/                  # Auth, cards, toast
│   └── styles/
├── worker/                  # Cloudflare Worker (TypeScript)
│   └── src/
│       ├── index.ts         # Router + cron entry
│       ├── cards.ts         # GET/POST /cards
│       ├── auth/            # WebAuthn, magic link, JWT
│       ├── scheduled/       # Morning expiry digest email
│       └── lib/             # CBOR, COSE, Brevo, KV, CORS
├── public/                  # Icons + web manifest
├── index.html
└── .github/workflows/       # Staging + production deploy
```

---

## Project history

Foodie did not arrive at this architecture in one step. The short version:

### 1. React PoC (early)

The first implementation was a **Vite + React** PWA grocery expiry tracker: camera barcode scan (`@zxing`), Tesseract OCR for dates, IndexedDB via Dexie, Open Food Facts product lookup, and local expiry notifications. That proved the product idea (scan → confirm → place → track expiry) but stayed device-local.

### 2. Auth + sync on a Cardex shell

Separately, a vanilla TypeScript **loyalty-card wallet** (Cardex) shipped passkeys (WebAuthn), magic-link email, JWT sessions, and Cloudflare KV sync with offline cache. Foodie needed that cloud story more than another React rewrite, so the repo was **reset onto the Cardex shell** and the grocery domain was rebuilt on top of it.

### 3. Rebrand and product features

Cardex was **rebranded to Foodie**. Grocery flows returned on the new stack: Open Food Facts lookup, expiry OCR (`TextDetector` where available), a two-step add-item / placement wizard, ZXing fallback for Safari/iOS barcode scan, expiry-first UI (barcode/QR display removed), in-app expiry notifications, and a Worker cron that emails a morning digest via Brevo.

### Why this shape

| Choice | Reason |
|---|---|
| Vanilla TS + Vite (not React) | Smaller PWA surface; auth/sync shell already worked |
| Cloudflare Worker + KV | Simple multi-device sync without a full database |
| Passkey + magic link | Passwordless; works across devices when passkeys do not |
| PWA first | Ship fast on iOS/Android install; native app is later |
| Brevo only | One email provider for magic links and digests |

---

## Features that have landed

| Area | Status |
|---|---|
| Passkey register / login (WebAuthn) | Done |
| Magic-link auth (Brevo) | Done |
| JWT session + auth gate | Done |
| Cloud-primary KV sync + localStorage offline cache | Done |
| Last-write-wins merge + tombstones (multi-device) | Done |
| Add / edit / delete items, search, export / import JSON | Done |
| Two-step add wizard (details → placement) | Done |
| Fresh-item templates (fruit, dairy, meat, …) | Done |
| Camera barcode scan (`BarcodeDetector` + ZXing fallback) | Done |
| Open Food Facts product lookup | Done |
| Expiry date OCR (`TextDetector`, Chromium) | Done |
| Expiry-focused tiles / detail UI | Done |
| In-app expiry notifications (on open / focus) | Done |
| Daily morning digest email (Worker cron → Brevo) | Done |
| iOS Home Screen vs Safari auth storage hint | Done |
| PWA install (manifest + service worker via vite-plugin-pwa) | Done |
| Staging CI/CD (Worker + Pages on `main`) | Done |
| Production release workflow (tag `v*`) | Done |
| Dependabot + auto-merge for safe bumps | Done |

---

## Roadmap

Near term (still PWA):

- [ ] **Multi-device passkey management** — list and revoke credentials via Worker endpoints
- [ ] **Explicit install CTA** — in-app “Add to Home Screen” affordance where the browser supports it
- [ ] **Stronger expiry OCR** — broader browser support beyond `TextDetector` (or graceful guided manual entry)
- [ ] **Family / shared inventories** — shared KV space or invite model on top of today’s per-user sync
- [ ] **Production hardening** — confirm production Worker + Pages endpoints, secrets, and RP ID for real domains

Longer term:

- [ ] **Native mobile app** — the product goal is a real iOS / Android app eventually. The PWA is the intentional first vehicle (camera, offline, install prompt) so UX and sync can settle before a Capacitor / React Native / Kotlin+Swift wrap or rewrite. Prefer keeping the Worker API and data model stable so a native client can reuse them.

---

## Prerequisites

- Node.js 20+ (CI uses `lts/*`)
- A [Cloudflare](https://cloudflare.com) account
- A [Brevo](https://brevo.com) account (free tier is fine) for magic links and digest email

---

## 1 — Worker setup

```bash
cd worker
npm install

# Create the KV namespace
wrangler kv:namespace create FOODIE_KV
# Copy the returned id into worker/wrangler.toml → kv_namespaces[0].id

# Edit wrangler.toml [vars] — set your Pages domain:
#   FRONTEND_ORIGIN = "https://your-project.pages.dev"
#   FRONTEND_RP_ID  = "your-project.pages.dev"
#   EMAIL_FROM      = "foodie@yourdomain.com"
#   EMAIL_FROM_NAME = "Foodie"

# Set secrets (never committed)
wrangler secret put JWT_SECRET      # paste any long random string
wrangler secret put BREVO_API_KEY   # xkeysib-... from app.brevo.com
```

The Worker runs a daily cron (`0 6 * * *` UTC) that emails users about items expiring soon. Digest sending is skipped when `BREVO_API_KEY` is unset.

---

## 2 — Frontend setup

```bash
# In the repo root
npm install --legacy-peer-deps

cp .env.example .env.local
# Local:
#   VITE_API_URL=http://localhost:8787
# Staging example (.env.example default):
#   VITE_API_URL=https://foodie-api-staging.tojemoc.workers.dev
```

`--legacy-peer-deps` is required because `vite-plugin-pwa@1.x` peer range does not yet cover Vite 8.

---

## 3 — Local development

```bash
# Terminal 1 — Worker
cd worker && npm run dev    # http://localhost:8787

# Terminal 2 — Frontend
npm run dev                 # http://localhost:5173
```

> Passkeys are domain-bound. Chrome on `localhost` works for WebAuthn, but the Worker’s `FRONTEND_RP_ID` in `wrangler.toml` often points at staging/prod — registration can fail locally with an RP ID mismatch. Card CRUD still works offline via localStorage without auth.

---

## 4 — Deploy

```bash
# Frontend (manual)
npm run build
wrangler pages deploy dist --project-name=your-project
```

Configured environments:

| Env | Frontend | Worker API |
|---|---|---|
| Staging | `https://foodie-staging.pages.dev/` | `https://foodie-api-staging.tojemoc.workers.dev/` |
| Production | Pages project `foodie-production` / `foodie-prod.pages.dev` (see `wrangler.toml` `FRONTEND_ORIGIN`) | Worker name `foodie-api` (default env in `wrangler.toml`) |

GitHub Actions:

- `staging.yml` — on push to `main` (and manual dispatch): type-check, build, deploy staging Worker + Pages
- `release.yml` — on tag `v*`: deploy production Worker + Pages

### GitHub Actions secrets

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token with Workers + Pages permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

Staging build injects `VITE_API_URL=https://foodie-api-staging.tojemoc.workers.dev`.  
Production build injects `VITE_API_URL=https://foodie-api.tojemoc.workers.dev`.

---

## KV key schema

| Key | Value |
|---|---|
| `user:{userId}` | `{ id, username, email, createdAt }` |
| `cred:{credentialId}` | `{ userId, publicKeyCose, counter, transports }` |
| `challenge:{token}` | `{ userId?, email?, type }` — TTL 5 min |
| `magiclink:{token}` | `{ userId, email, expires }` — TTL 15 min |
| `email:{email}` | `userId` |
| `cards:{userId}` | `Card[]` (+ tombstones in sync payload) |
