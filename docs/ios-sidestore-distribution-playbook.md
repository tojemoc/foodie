# Foodie — SideStore distribution

## Build

Use GitHub Actions → **Mobile artifacts** (workflow file
`.github/workflows/mobile-artifacts.yml`).

Required inputs:

- `api_url` — Worker base URL baked into the binary
- `frontend_host` — host used for Universal Links / App Links

Optional:

- `build_number` — defaults to the GitHub Actions **run number**. Published
  marketing version becomes `major.minor.<build>` (from `mobile/app.json`
  base + that build). A new IPA needs a unique flavor+version+build.

The macOS job runs on `macos-26` (Xcode 26.4+ / Swift 6.2+), runs
`expo prebuild`, builds with `CODE_SIGNING_ALLOWED=NO`, then packages
`Payload/Foodie.app` into `foodie-<version>-ios.ipa` via
`scripts/package-ios-ipa-for-sidestore.sh`.

Expo SDK 57’s `expo-modules-jsi` declares `swift-tools-version: 6.2`, so
`macos-15` (default Xcode 16.4 / Swift 6.1) fails during the
ExpoModulesJSI XCFramework build.

`mobile/app.json` keeps a stable `expo.version` major.minor base (e.g.
`3.0.0`). CI rewrites the published marketing version to
`major.minor.<build>` before `expo prebuild` so the IPA’s
`CFBundleShortVersionString` matches the AltStore source `version` field.

Release tags look like `<flavor>-v<semver>-build<build>`, e.g.
`development-v3.0.10-build10` (patch equals the CI build).

## SideStore update detection (important)

SideStore decides **Update** vs **Open** by comparing **SemanticVersion of
`version` / `CFBundleShortVersionString` only**. A bump to `buildVersion` /
`CFBundleVersion` alone does **not** show Update when major.minor.patch are
unchanged (upstream `InstalledApp.hasUpdate`; the older AltStore check that
also compared `buildVersion` is commented out).

Symptoms when only `buildVersion` changes: the new release appears in the
source changelog, the button stays **Open**, and new JS/native bits only
land after uninstall + reinstall.

Mitigation (same approach as [tojemoc/vmp](https://github.com/tojemoc/vmp)
PR #691 / [tojemoc/floaty](https://github.com/tojemoc/floaty)): every CI IPA
must ship a **strictly increasing** marketing version. Helper:
`scripts/ios-sidestore-marketing-version.mjs`.

## Install on iPhone

1. Install [SideStore](https://sidestore.io/) and complete pairing.
2. Add the AltStore source (after the first published release):

   `https://<github-owner>.github.io/foodie/altstore-source.json`

3. Install **Foodie**. SideStore re-signs the unsigned IPA with your free
   personal Apple ID provisioning.

You can also sideload a downloaded IPA artifact directly in SideStore
without adding a source.

## GitHub Pages install site

Before the first deploy, set **Settings → Pages → Build and deployment →
Source** to **GitHub Actions**. `actions/configure-pages` does not enable
Pages by itself. Switching Source back to a branch later can replace the
Actions-published site with whatever that branch serves (often a 404 or
raw `/docs` content).

Each **Mobile artifacts** run with `publish_release=true` regenerates
`altstore-source.json` from GitHub Releases and deploys the install site to
GitHub Pages (Actions deploy — no git push to a `gh-pages` branch):

- `https://<owner>.github.io/foodie/` — install page
- `…/altstore-source.json` — SideStore / AltStore source
- `…/downloads.json` — machine-readable IPA/APK pointers (Release + nightly.link)

Publish waits for the Android job when it ran so the APK is attached to the
GitHub Release (`foodie-<version>-android.apk`) and linked from the install
page. If Android fails or is skipped, iOS Release + Pages still publish
(without an APK button).

nightly.link’s “latest by branch” shortcut only sees `push` / `schedule`
runs, not `workflow_dispatch`, so the site also publishes **run-scoped**
nightly.link URLs after each publish. If nightly.link returns “Repository
not found” for a public repo, install the
[nightly.link GitHub App](https://github.com/apps/nightly-link) on the
repository (the Release APK link still works without it).

To refresh without rebuilding (for example after a mistaken re-run of
GitHub’s dynamic `pages-build-deployment` wiped the site), run
**Actions → Publish SideStore Pages** from `main`. Optionally pass a
`mobile_artifacts_run_id` to pin the nightly.link artifacts.

## Refresh

Free Apple IDs expire apps about every 7 days. Open SideStore on the same
network as your pairing machine (or use SideStore’s VPN refresh) to renew.
