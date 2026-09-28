#!/usr/bin/env python3
"""Assemble the SideStore / GitHub Pages install site (no git push).

Writes into ``--site-dir`` (default ``site/``):
  - index.html (from docs/index.html.template)
  - downloads.json (nightly.link run-scoped IPA + APK pointers)
  - .nojekyll
  - altstore-source.json (required; must include at least one version)

Used by:
  - ``.github/workflows/mobile-artifacts.yml`` after each publish
  - ``.github/workflows/publish-sidestore-pages.yml`` for manual republish
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

TAG_RE = re.compile(
    r"^(?P<flavor>.+)-v(?P<version>[\d.]+)-build(?P<build>\d+)$",
    re.IGNORECASE,
)
COMMIT_RE = re.compile(r"- Commit: `([0-9a-fA-F]{40})`")

IOS_ARTIFACT = "mobile-ios-ipa"
ANDROID_ARTIFACT = "mobile-android-apk"
PUBLISH_JOB_NAME = "publish"
USER_AGENT = "foodie-build-sidestore-pages-site"


def api_get(url: str, token: str | None) -> object:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": USER_AGENT,
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode())


def api_get_paginated(url: str, token: str | None, *, list_key: str | None = None) -> list:
    """Fetch all pages. When list_key is set, items are under that key (e.g. artifacts)."""
    items: list = []
    next_url: str | None = url
    while next_url:
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": USER_AGENT,
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        request = urllib.request.Request(next_url, headers=headers)
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode())
            link = response.headers.get("Link") or ""
        if list_key:
            chunk = payload.get(list_key) or []
            if not isinstance(chunk, list):
                raise SystemExit(f"Expected list at '{list_key}' from {next_url}")
            items.extend(chunk)
        elif isinstance(payload, list):
            items.extend(payload)
        else:
            raise SystemExit(f"Unexpected non-list payload from {next_url}")
        next_url = None
        for part in link.split(","):
            if 'rel="next"' in part:
                next_url = part[part.find("<") + 1 : part.find(">")]
                break
    return items


def run_has_successful_publish_job(repo: str, run_id: int, token: str | None) -> bool:
    """True when this run's publish job concluded successfully.

    Overall workflow success is not enough: artifact-only dispatches
    (publish_release=false) still upload IPA/APK but skip Pages publish.
    """
    jobs_url = f"https://api.github.com/repos/{repo}/actions/runs/{run_id}/jobs"
    jobs = api_get_paginated(jobs_url, token, list_key="jobs")
    for job in jobs:
        if job.get("name") == PUBLISH_JOB_NAME and job.get("conclusion") == "success":
            return True
    return False


def resolve_mobile_artifacts_run_id(repo: str, token: str | None, explicit: str | None) -> int:
    if explicit:
        return int(explicit)

    workflow_path = ".github/workflows/mobile-artifacts.yml"
    url = (
        f"https://api.github.com/repos/{repo}/actions/workflows/"
        f"{urllib.parse.quote(workflow_path, safe='')}/runs"
        f"?branch=main&status=success&per_page=30"
    )
    runs = api_get_paginated(url, token, list_key="workflow_runs")
    for run in runs:
        run_id = run.get("id")
        if not run_id:
            continue
        if not run_has_successful_publish_job(repo, int(run_id), token):
            continue
        artifacts_url = f"https://api.github.com/repos/{repo}/actions/runs/{run_id}/artifacts"
        artifacts = api_get_paginated(artifacts_url, token, list_key="artifacts")
        names = {a.get("name") for a in artifacts if not a.get("expired")}
        if IOS_ARTIFACT in names:
            print(
                f"Resolved latest Mobile artifacts run with successful publish "
                f"and {IOS_ARTIFACT}: {run_id}",
                file=sys.stderr,
            )
            return int(run_id)

    # Fallback: any successful main run that still has the iOS artifact
    # (needed before the first Pages-aware publish lands on main).
    for run in runs:
        run_id = run.get("id")
        if not run_id:
            continue
        artifacts_url = f"https://api.github.com/repos/{repo}/actions/runs/{run_id}/artifacts"
        artifacts = api_get_paginated(artifacts_url, token, list_key="artifacts")
        names = {a.get("name") for a in artifacts if not a.get("expired")}
        if IOS_ARTIFACT in names:
            print(
                f"Resolved latest Mobile artifacts run with {IOS_ARTIFACT} "
                f"(no prior successful publish job yet): {run_id}",
                file=sys.stderr,
            )
            return int(run_id)

    raise SystemExit(
        f"Could not find a successful Mobile artifacts run on main with a "
        f"non-expired {IOS_ARTIFACT} artifact. Pass --run-id explicitly."
    )


def fetch_run_artifacts(repo: str, run_id: int, token: str | None) -> dict[str, int]:
    url = f"https://api.github.com/repos/{repo}/actions/runs/{run_id}/artifacts"
    artifacts = api_get_paginated(url, token, list_key="artifacts")
    out: dict[str, int] = {}
    for artifact in artifacts:
        if artifact.get("expired"):
            continue
        name = artifact.get("name")
        artifact_id = artifact.get("id")
        if isinstance(name, str) and isinstance(artifact_id, int):
            out[name] = artifact_id
    return out


def fetch_run(repo: str, run_id: int, token: str | None) -> dict:
    data = api_get(f"https://api.github.com/repos/{repo}/actions/runs/{run_id}", token)
    if not isinstance(data, dict):
        raise SystemExit(f"Unexpected run payload for {run_id}")
    return data


def find_release_for_commit(repo: str, commit_sha: str, token: str | None) -> dict | None:
    url = f"https://api.github.com/repos/{repo}/releases?per_page=40"
    releases = api_get_paginated(url, token)
    for release in releases:
        if not isinstance(release, dict):
            continue
        body = release.get("body") or ""
        match = COMMIT_RE.search(body)
        if match and match.group(1).lower() == commit_sha.lower():
            return release
        target = release.get("target_commitish") or ""
        if isinstance(target, str) and len(target) == 40 and target.lower() == commit_sha.lower():
            return release
    return None


def parse_release_identity(tag: str) -> tuple[str, str, str]:
    match = TAG_RE.match(tag)
    if not match:
        raise SystemExit(
            f"Release tag '{tag}' does not match <flavor>-v<version>-build<build>. "
            "Pass --flavor/--version/--build explicitly."
        )
    return match.group("flavor"), match.group("version"), match.group("build")


def fetch_release_by_tag(repo: str, tag: str, token: str | None) -> dict | None:
    url = f"https://api.github.com/repos/{repo}/releases/tags/{urllib.parse.quote(tag)}"
    try:
        data = api_get(url, token)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise
    return data if isinstance(data, dict) else None


def release_has_asset(release: dict | None, name: str) -> bool:
    if not release:
        return False
    for asset in release.get("assets") or []:
        if isinstance(asset, dict) and asset.get("name") == name:
            return True
    return False


def validate_altstore_source(path: Path) -> list:
    if not path.is_file():
        raise SystemExit(f"error: missing AltStore source at {path}")
    with path.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict) or "apps" not in payload:
        raise SystemExit(f"error: {path} is not a valid AltStore source")
    apps = payload.get("apps")
    if not isinstance(apps, list) or not apps:
        raise SystemExit(f"error: {path} has no apps entry")
    app = apps[0]
    if not isinstance(app, dict):
        raise SystemExit(f"error: {path} apps[0] is not an object")
    versions = app.get("versions")
    if not isinstance(versions, list) or not versions:
        raise SystemExit(
            f"error: {path} has no installable versions "
            "(refusing to publish an empty SideStore feed)"
        )
    return versions


def render_site(
    *,
    repo: str,
    owner: str,
    repo_name: str,
    flavor: str,
    version: str,
    build: str,
    run_id: int,
    ios_artifact_id: int,
    android_artifact_id: int | None,
    android_release_asset: bool,
    docs_dir: Path,
    site_dir: Path,
    altstore_source: Path,
    versions: list,
) -> None:
    tag = f"{flavor}-v{version}-build{build}"
    ipa_file = f"foodie-{version}-ios.ipa"
    ipa_url = f"https://github.com/{repo}/releases/download/{tag}/{ipa_file}"
    pages_url = f"https://{owner}.github.io/{repo_name}"
    run_url = f"https://github.com/{repo}/actions/runs/{run_id}"
    ios_nightly = f"https://nightly.link/{repo}/actions/runs/{run_id}/{IOS_ARTIFACT}.zip"
    android_nightly = (
        f"https://nightly.link/{repo}/actions/runs/{run_id}/{ANDROID_ARTIFACT}.zip"
        if android_artifact_id
        else ""
    )
    apk_file = f"foodie-{version}-android.apk"
    apk_release_url = f"https://github.com/{repo}/releases/download/{tag}/{apk_file}"
    android_btn_parts: list[str] = []
    if android_artifact_id or android_release_asset:
        # Prefer the GitHub Release asset (stable, no third-party). Also publish
        # the nightly.link zip for parity with workflow artifacts / no-login CI.
        if android_release_asset:
            android_btn_parts.append(
                f'<a class="primary-btn" href="{apk_release_url}">Download Android APK</a>'
            )
        if android_nightly:
            label = (
                "Android APK via nightly.link (zip)"
                if android_release_asset
                else "Download Android APK (nightly.link zip)"
            )
            css = "secondary-btn" if android_release_asset else "primary-btn"
            android_btn_parts.append(
                f'<a class="{css}" href="{android_nightly}">{label}</a>'
            )
    android_btn = "\n        ".join(android_btn_parts)
    altstore_source_url = f"{pages_url}/altstore-source.json"

    if site_dir.exists():
        shutil.rmtree(site_dir)
    site_dir.mkdir(parents=True)

    template_path = docs_dir / "index.html.template"
    if not template_path.is_file():
        raise SystemExit(f"error: missing install page template at {template_path}")
    index_text = template_path.read_text(encoding="utf-8")
    replacements = {
        "__VERSION__": version,
        "__FLAVOR_LABEL__": flavor,
        "__ALTSTORE_SOURCE_URL__": altstore_source_url,
        "__IOS_NIGHTLY_LINK__": ios_nightly,
        "__ANDROID_NIGHTLY_BTN__": android_btn,
        "__RUN_URL__": run_url,
        "__RUN_ID__": str(run_id),
    }
    for key, value in replacements.items():
        index_text = index_text.replace(key, value)
    (site_dir / "index.html").write_text(index_text, encoding="utf-8")

    updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload: dict = {
        "updatedAt": updated_at,
        "flavor": flavor,
        "version": version,
        "build": build,
        "releaseTag": tag,
        "runId": run_id,
        "runUrl": run_url,
        "pagesUrl": f"{pages_url}/",
        "altstoreSourceUrl": altstore_source_url,
        "note": (
            "nightly.link /workflows/{name}/{branch} only finds push/schedule runs; "
            "these run-scoped URLs work for workflow_dispatch and need no GitHub login. "
            "Do not re-run GitHub's dynamic pages-build-deployment workflow — it deploys "
            "raw /docs (markdown/templates) and wipes this install site. Use Actions → "
            "Publish SideStore Pages instead."
        ),
        "ios": {
            "artifactName": IOS_ARTIFACT,
            "artifactId": ios_artifact_id,
            "nightlyLink": ios_nightly,
            "releaseAssetUrl": ipa_url,
        },
        "android": None,
    }
    if android_artifact_id or android_release_asset:
        android_payload: dict = {}
        if android_artifact_id:
            android_payload["artifactName"] = ANDROID_ARTIFACT
            android_payload["artifactId"] = android_artifact_id
        if android_release_asset:
            android_payload["releaseAssetUrl"] = apk_release_url
        if android_nightly:
            android_payload["nightlyLink"] = android_nightly
        payload["android"] = android_payload
    (site_dir / "downloads.json").write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )

    (site_dir / ".nojekyll").write_text("", encoding="utf-8")
    shutil.copy2(altstore_source, site_dir / "altstore-source.json")

    android_note = (
        f", android nightly {android_nightly}"
        if android_nightly
        else ", android omitted"
    )
    print(
        f"Built SideStore Pages site in {site_dir}/ for {tag} "
        f"({len(versions)} AltStore version(s), run {run_id}{android_note})"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""))
    parser.add_argument("--owner", default=os.environ.get("GITHUB_REPOSITORY_OWNER", ""))
    parser.add_argument(
        "--repo-name",
        default=os.environ.get("GITHUB_REPOSITORY_NAME")
        or os.environ.get("GITHUB_EVENT_REPOSITORY_NAME", ""),
    )
    parser.add_argument("--run-id", default=os.environ.get("MOBILE_ARTIFACTS_RUN_ID", ""))
    parser.add_argument("--flavor", default=os.environ.get("FLAVOR_LABEL", ""))
    parser.add_argument("--version", default=os.environ.get("VERSION_NAME", ""))
    parser.add_argument("--build", default=os.environ.get("BUILD_NUMBER", ""))
    parser.add_argument(
        "--android-job-result",
        default=os.environ.get("ANDROID_JOB_RESULT", ""),
        help=(
            f"When set to success, require {ANDROID_ARTIFACT} on the run. "
            "Empty means include Android if the artifact exists."
        ),
    )
    parser.add_argument("--docs-dir", type=Path, default=Path("docs"))
    parser.add_argument("--site-dir", type=Path, default=Path("site"))
    parser.add_argument(
        "--altstore-source",
        "--source",
        dest="altstore_source",
        type=Path,
        default=Path("docs/altstore-source.json"),
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN"),
    )
    args = parser.parse_args()

    if not args.repo or "/" not in args.repo:
        raise SystemExit("Pass --repo owner/name or set GITHUB_REPOSITORY")
    owner = args.owner or args.repo.split("/", 1)[0]
    repo_name = args.repo_name or args.repo.split("/", 1)[1]

    versions = validate_altstore_source(args.altstore_source)

    run_id = resolve_mobile_artifacts_run_id(
        args.repo, args.token, args.run_id.strip() or None
    )
    run = fetch_run(args.repo, run_id, args.token)
    head_sha = run.get("head_sha") or ""
    artifacts = fetch_run_artifacts(args.repo, run_id, args.token)
    if IOS_ARTIFACT not in artifacts:
        raise SystemExit(
            f"Run {run_id} has no non-expired {IOS_ARTIFACT} artifact"
        )

    flavor = args.flavor.strip()
    version = args.version.strip()
    build = args.build.strip()
    if not (flavor and version and build):
        release = find_release_for_commit(args.repo, str(head_sha), args.token)
        if not release:
            raise SystemExit(
                f"No GitHub Release body matching commit {head_sha} for run {run_id}. "
                "Pass --flavor/--version/--build, or publish a release first."
            )
        tag = release.get("tag_name") or ""
        flavor, version, build = parse_release_identity(str(tag))
        print(f"Resolved release {tag} from commit {head_sha[:7]}", file=sys.stderr)

    android_id: int | None = artifacts.get(ANDROID_ARTIFACT)
    android_result = args.android_job_result.strip()
    if android_result == "success":
        if not android_id:
            raise SystemExit(
                f"Android job succeeded but {ANDROID_ARTIFACT} is missing on run {run_id}"
            )
    elif android_result in ("failure", "cancelled", "skipped"):
        if android_result in ("failure", "cancelled"):
            print(
                f"Android build {android_result}; omitting APK download buttons.",
                file=sys.stderr,
            )
        android_id = None
    # else: include Android when the artifact exists (republish path)

    tag = f"{flavor}-v{version}-build{build}"
    release = fetch_release_by_tag(args.repo, tag, args.token)
    apk_name = f"foodie-{version}-android.apk"
    android_release_asset = release_has_asset(release, apk_name)
    if android_result == "success" and not android_release_asset:
        # Release step just uploaded the APK; GitHub's API can lag briefly.
        # Still advertise the canonical Release URL for this publish.
        android_release_asset = True

    render_site(
        repo=args.repo,
        owner=owner,
        repo_name=repo_name,
        flavor=flavor,
        version=version,
        build=build,
        run_id=run_id,
        ios_artifact_id=artifacts[IOS_ARTIFACT],
        android_artifact_id=android_id,
        android_release_asset=android_release_asset,
        docs_dir=args.docs_dir,
        site_dir=args.site_dir,
        altstore_source=args.altstore_source,
        versions=versions,
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print(f"GitHub API HTTP {exc.code}: {body}", file=sys.stderr)
        raise SystemExit(1) from exc
