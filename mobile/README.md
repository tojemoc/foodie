# Foodie mobile (Expo)

React Native client for SideStore / AltStore distribution. Reuses the existing
Cloudflare Worker API (`/cards`, magic-link auth) so inventory sync stays
compatible with the PWA schema.

## Why native

The vanilla PWA hit a fix-one-break-another loop around camera, OCR, and iOS
install quirks. This app is the React rewrite (inspired by the early Vite+React
PoC and the Expo layout in `tojemoc/vmp`) with:

- On-device barcode scan (`expo-camera`)
- Multi-format best-before date parser (no LLM) + optional ML Kit OCR
- Multi-source product lookup: Open Food Facts → Open Products Facts → Open Beauty Facts → UPCitemdb, with AsyncStorage cache
- Offline produce catalog + colour/label recognition (bananas & quantity heuristics) — corrections stay on device
- Magic-link auth + LWW KV sync via the Worker

## Develop

```bash
cd mobile
npm ci
EXPO_PUBLIC_API_URL=http://127.0.0.1:8787 npx expo start
```

| Host | Typical `EXPO_PUBLIC_API_URL` |
| --- | --- |
| iOS simulator | `http://127.0.0.1:8787` |
| Android emulator | `http://10.0.2.2:8787` |
| Physical device | `http://<lan-ip>:8787` |

```bash
npm run typecheck
npm test
```

## SideStore

1. Run **Actions → Mobile artifacts → Run workflow** from `main` (or a feature branch with `publish_release=false`).
2. Download the IPA artifact, or enable publish to create a GitHub Release + `docs/altstore-source.json`.
3. In SideStore: **Sources → +** and add  
   `https://<owner>.github.io/foodie/altstore-source.json`  
   (after Pages is wired to serve that file).

Unsigned IPAs are re-signed by SideStore with your personal Apple ID.

## Optional on-device OCR native module

After `npx expo prebuild`, you can add:

```bash
npm install @react-native-ml-kit/text-recognition
```

The app already probes for this module and falls back to paste/manual date entry when it is absent (Expo Go).
