# Foodie — SideStore distribution

## Build

Use GitHub Actions → **Mobile artifacts** (workflow file
`.github/workflows/mobile-artifacts.yml`).

Required inputs:

- `api_url` — Worker base URL baked into the binary
- `frontend_host` — host used for Universal Links / App Links

The macOS job runs on `macos-26` (Xcode 26.4+ / Swift 6.2+), runs
`expo prebuild`, builds with `CODE_SIGNING_ALLOWED=NO`, then packages
`Payload/Foodie.app` into `foodie-<version>-ios.ipa` via
`scripts/package-ios-ipa-for-sidestore.sh`.

Expo SDK 57’s `expo-modules-jsi` declares `swift-tools-version: 6.2`, so
`macos-15` (default Xcode 16.4 / Swift 6.1) fails during the
ExpoModulesJSI XCFramework build.

## Install on iPhone

1. Install [SideStore](https://sidestore.io/) and complete pairing.
2. Add the AltStore source (after the first published release):

   `https://<github-owner>.github.io/foodie/altstore-source.json`

3. Install **Foodie**. SideStore re-signs the unsigned IPA with your free
   personal Apple ID provisioning.

You can also sideload a downloaded IPA artifact directly in SideStore
without adding a source.

## GitHub Pages source

Each **Mobile artifacts** run with `publish_release=true` regenerates
`altstore-source.json` from GitHub Releases and deploys it to GitHub Pages
(Actions deploy — no git push to a `gh-pages` branch).

To refresh the source without rebuilding the IPA (for example after a
mistaken re-run of GitHub’s dynamic `pages-build-deployment` wiped the
site), run **Actions → Publish SideStore Pages** from `main`.

## Refresh

Free Apple IDs expire apps about every 7 days. Open SideStore on the same
network as your pairing machine (or use SideStore’s VPN refresh) to renew.
