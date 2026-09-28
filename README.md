# Foodie — Food & Grocery Tracker

PWA + **Expo native** food / grocery tracker with passkey / magic-link auth and Cloudflare KV sync.

**Current version:** PWA `2.1.4` · Mobile `3.0.0`  
**Stack:** Expo React Native (`mobile/`) · Vanilla TypeScript + Vite 8 PWA (repo root) · Cloudflare Worker API (`worker/`)

```
foodie/
├── mobile/                  # Expo React Native (SideStore / AltStore)
│   ├── app/                 # Expo Router screens
│   ├── src/                 # API client, sync, OCR, produce DB, product lookup
│   └── test/
├── src/                     # Vite + TypeScript PWA frontend
├── worker/                  # Cloudflare Worker (shared API)
├── docs/                    # SideStore playbook + AltStore source meta
├── scripts/                 # IPA packaging + AltStore source generator
└── .github/workflows/       # Staging, production, mobile artifacts
```

---

## Project history

### 1. React PoC (early)

Vite + React PWA: barcode scan, Tesseract OCR, Dexie, Open Food Facts. Proved scan → place → track; stayed device-local.

### 2. Auth + sync on a Cardex shell

Vanilla TypeScript loyalty-card wallet shipped passkeys, magic link, JWT, KV sync. Foodie was reset onto that shell.

### 3. Rebrand and PWA product features

Cardex → Foodie. Grocery flows returned: OFF lookup, OCR, placement wizard, push digests.

### 4. Native Expo client (current direction)

PWA camera/OCR/iOS install quirks became an infinity loop. The product is being recreated as an **Expo React Native** app installable via **SideStore**, keeping the Worker API + `/items` schema stable. Inspiration from the early React PoC and the Expo layout in `tojemoc/vmp`.

---

## Native highlights (`mobile/`)

| Area | Approach |
|---|---|
| Best-before OCR | On-device text recognition (optional ML Kit) + multi-format parser (EU/US/packed/Julian, multilingual keywords). **No LLM.** |
| Product lookup | Open Food Facts → Open Products Facts → Open Beauty Facts → UPCitemdb + local cache |
| Produce photos | Bundled offline catalog (bananas etc.) + colour/label matching + quantity heuristics; user corrections stay on device |
| Sync | Same `/items` LWW + tombstones API as the PWA (`/cards` kept as legacy alias) |
| Auth | Magic link (passkeys remain on the web client for now) |
| Distribution | Unsigned IPA via GitHub Actions → SideStore |

See [`mobile/README.md`](mobile/README.md) and [`docs/ios-sidestore-distribution-playbook.md`](docs/ios-sidestore-distribution-playbook.md).

---

## PWA features that have landed

| Area | Status |
|---|---|
| Passkey register / login (WebAuthn) | Done |
| Magic-link auth (Brevo) | Done |
| JWT session + auth gate | Done |
| Cloud-primary KV sync + localStorage offline cache | Done |
| Last-write-wins merge + tombstones (multi-device) | Done |
| Add / edit / delete items, search, export / import JSON | Done |
| Two-step add wizard (details → placement) | Done |
| Camera barcode scan + Open Food Facts | Done |
| Expiry date OCR (Tesseract.js) | Done |
| In-app + Web Push expiry alerts + morning digest | Done |
| Staging / production CI/CD | Done |

---

## Roadmap

- [x] **Expo native client** — SideStore-ready scaffold with OCR / multi-source lookup / offline produce DB
- [x] Wire GitHub Pages to serve `altstore-source.json` + nightly.link IPA/APK install site after mobile publishes
- [ ] Optional `@react-native-ml-kit/text-recognition` in the SideStore prebuild
- [ ] Family / shared inventories
- [ ] Passkey list/revoke on Worker; native passkey if/when practical
- [ ] Production hardening

---

## Prerequisites

- Node.js 20+ (CI uses `lts/*`)
- A [Cloudflare](https://cloudflare.com) account
- A [Brevo](https://brevo.com) account (free tier is fine) for magic links and digest email

---

## Worker setup

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
wrangler secret put JWT_SECRET
wrangler secret put BREVO_API_KEY
# Optional Web Push:
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_PUBLIC_KEY
```

## Local PWA + Worker

```bash
# Terminal 1
cd worker && npm run dev

# Terminal 2 (repo root)
cp .env.example .env.local   # VITE_API_URL=http://localhost:8787
npm install --legacy-peer-deps
npm run dev
```

## Local Expo mobile

```bash
# Terminal 1 — Worker as above
# Terminal 2
cd mobile
npm ci
EXPO_PUBLIC_API_URL=http://127.0.0.1:8787 npx expo start
```

## SideStore IPA

Actions → **Mobile artifacts** → run from `main` with your Worker `api_url` and `frontend_host`.  
Details: [`docs/ios-sidestore-distribution-playbook.md`](docs/ios-sidestore-distribution-playbook.md).
