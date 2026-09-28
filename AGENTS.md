# Foodie — Food & Grocery Tracker

PWA + Expo native food / grocery tracker with passkey + magic-link auth and Cloudflare KV sync.

**Versions:** PWA `2.1.4` · Mobile `3.0.0`  
**Packages:** Vite PWA (repo root) · Expo app (`mobile/`) · Cloudflare Worker API (`worker/`).

## Project status (for agents)

### How we got here
1. **React PoC** — Vite + React grocery expiry PWA (ZXing, Tesseract, Dexie, Open Food Facts).
2. **Architecture reset** — Repo switched to the **Cardex** vanilla-TS shell (passkey/magic-link + KV sync).
3. **Rebrand + PWA product** — Cardex → Foodie; grocery features on that shell.
4. **Native Expo rewrite** — PWA camera/OCR/iOS install fragility pushed a SideStore-installable React Native client that reuses the Worker API. Patterns borrowed from the early React PoC and `tojemoc/vmp`’s Expo mobile app.

### Landed features
- Passkey (WebAuthn) + magic link (Brevo) + JWT session gate (PWA)
- Cloud-primary KV sync, LWW merge + tombstones (PWA + mobile)
- Expo mobile: barcode scan, multi-format best-before parser (no LLM), multi-source product lookup + cache, offline produce catalog / photo recognition
- SideStore IPA workflow (`.github/workflows/mobile-artifacts.yml`)
- PWA: placement wizard, Web Push + morning digest, staging/prod CI

### Roadmap
- ML Kit OCR in prebuild, shared inventories, prod hardening
- Keep Worker `/items` schema stable for all clients (`/cards` is a legacy alias)

### SideStore / GitHub Pages
- Install site: `https://tojemoc.github.io/foodie/` (`altstore-source.json`, `downloads.json` with nightly.link IPA + APK)
- Published by `mobile-artifacts.yml` (on `publish_release`, waits for Android when enabled) and `publish-sidestore-pages.yml`
- Artifact names: `mobile-ios-ipa`, `mobile-android-apk`
- Do not re-run GitHub’s dynamic `pages-build-deployment` — it wipes the Actions site

Prefer reading `README.md` and `mobile/README.md`.

## Cursor Cloud specific instructions

### Project structure
- **PWA** (root): Vanilla TypeScript + Vite 8. Dev: `npm run dev` → `http://localhost:5173`
- **Mobile** (`mobile/`): Expo 57 + Expo Router. Dev: `cd mobile && npx expo start`
- **Worker API** (`worker/`): Cloudflare Worker + Wrangler 4. Dev: `cd worker && npm run dev` → `http://localhost:8787`

### Local environment files (not committed)
- `.env.local` at root — `VITE_API_URL=http://localhost:8787`
- `mobile/.env.local` — `EXPO_PUBLIC_API_URL=http://127.0.0.1:8787` (use LAN IP on a physical device)
- `worker/.dev.vars` — `JWT_SECRET=…`, optional VAPID + `BREVO_API_KEY`

### Running dev servers
```
# Worker
cd worker && npm run dev

# PWA
npm run dev

# Mobile (separate terminal)
cd mobile && EXPO_PUBLIC_API_URL=http://127.0.0.1:8787 npx expo start
```

### Lint / type-check / test
- PWA: `npm run type-check`
- Worker: `cd worker && npm run type-check`
- Mobile: `cd mobile && npm run typecheck && npm test`
- No ESLint/Prettier at repo root.

### Dependencies
- Root: `npm install --legacy-peer-deps`
- `mobile/` and `worker/`: plain `npm install` / `npm ci`

### Passkey / SideStore notes
- Passkeys: PWA / localhost RP ID caveats still apply.
- Mobile auth: magic link + deep link `foodie://` / Universal Links.
- SideStore: see `docs/ios-sidestore-distribution-playbook.md`. IPA builds need the macOS job in `mobile-artifacts.yml` (`macos-26` / Xcode 26.4+ for Expo SDK 57).

### Deploy reminders
- Staging: push to `main` → `.github/workflows/staging.yml`
- Production: tag `v*` → `.github/workflows/release.yml`
- Mobile IPA: workflow_dispatch → `.github/workflows/mobile-artifacts.yml`
- Cron digest: hourly `[triggers] crons = ["0 * * * *"]` in `worker/wrangler.toml` — delivers around 08:00 in each user’s `prefs.timezone` (default `Europe/Bratislava`) for items expiring within 7 days; email requires `prefs.emailDigest`
