#!/usr/bin/env python3
"""Assemble the SideStore GitHub Pages site (no git push).

Writes into ``--site-dir`` (default ``site/``):
  - altstore-source.json (copied from --source)
  - index.html (short install blurb + source URL)
  - .nojekyll

Used by:
  - ``.github/workflows/mobile-artifacts.yml`` after each publish
  - ``.github/workflows/publish-sidestore-pages.yml`` for manual republish
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

INDEX_HTML = """\
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Foodie — SideStore source</title>
    <style>
      :root {{
        color-scheme: light dark;
        --bg: #0f1a14;
        --card: #16241c;
        --text: #e8f5ee;
        --muted: #93b3a3;
        --accent: #3ddc97;
      }}
      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        min-height: 100vh;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        background: radial-gradient(1200px 600px at 20% -10%, #1d3b2c 0%, var(--bg) 55%);
        color: var(--text);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
      }}
      main {{
        width: 100%;
        max-width: 28rem;
      }}
      h1 {{
        margin: 0 0 0.35rem;
        font-size: 1.85rem;
        letter-spacing: -0.02em;
        color: var(--accent);
      }}
      p {{
        margin: 0 0 1rem;
        color: var(--muted);
        line-height: 1.45;
      }}
      code {{
        display: block;
        word-break: break-all;
        padding: 0.85rem 1rem;
        border-radius: 10px;
        background: var(--card);
        color: var(--text);
        font-size: 0.85rem;
      }}
      a {{ color: var(--accent); }}
    </style>
  </head>
  <body>
    <main>
      <h1>Foodie</h1>
      <p>Add this AltStore / SideStore source URL:</p>
      <code>{source_url}</code>
      <p style="margin-top:1.25rem">
        <a href="{source_url}">altstore-source.json</a>
        · <a href="{repo_url}">GitHub</a>
      </p>
    </main>
  </body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        default="docs/altstore-source.json",
        help="Generated AltStore source JSON to publish",
    )
    parser.add_argument(
        "--site-dir",
        default="site",
        help="Output directory for the Pages artifact",
    )
    parser.add_argument(
        "--owner",
        default=os.environ.get("GITHUB_REPOSITORY_OWNER"),
        help="GitHub owner (for the public source URL)",
    )
    parser.add_argument(
        "--repo-name",
        default=os.environ.get("GITHUB_REPOSITORY_NAME")
        or (os.environ.get("GITHUB_REPOSITORY") or "").split("/")[-1],
        help="Repository name (for the public source URL)",
    )
    args = parser.parse_args()

    source = Path(args.source)
    if not source.is_file():
        print(f"error: missing AltStore source at {source}", file=sys.stderr)
        return 1

    # Validate JSON before publishing a broken SideStore feed.
    with source.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict) or "apps" not in payload:
        print(f"error: {source} is not a valid AltStore source", file=sys.stderr)
        return 1

    apps = payload.get("apps")
    if not isinstance(apps, list) or not apps:
        print(f"error: {source} has no apps entry", file=sys.stderr)
        return 1
    app = apps[0]
    if not isinstance(app, dict):
        print(f"error: {source} apps[0] is not an object", file=sys.stderr)
        return 1
    versions = app.get("versions")
    if not isinstance(versions, list) or not versions:
        print(
            f"error: {source} has no installable versions "
            "(refusing to publish an empty SideStore feed)",
            file=sys.stderr,
        )
        return 1

    owner = args.owner
    repo_name = args.repo_name
    if not owner or not repo_name:
        print(
            "error: --owner/--repo-name or GITHUB_REPOSITORY_OWNER + "
            "GITHUB_REPOSITORY_NAME / GITHUB_REPOSITORY required",
            file=sys.stderr,
        )
        return 1

    site_dir = Path(args.site_dir)
    if site_dir.exists():
        shutil.rmtree(site_dir)
    site_dir.mkdir(parents=True)

    shutil.copy2(source, site_dir / "altstore-source.json")
    (site_dir / ".nojekyll").write_text("", encoding="utf-8")

    source_url = f"https://{owner}.github.io/{repo_name}/altstore-source.json"
    repo_url = f"https://github.com/{owner}/{repo_name}"
    (site_dir / "index.html").write_text(
        INDEX_HTML.format(source_url=source_url, repo_url=repo_url),
        encoding="utf-8",
    )

    print(
        f"Wrote {site_dir}/ with altstore-source.json "
        f"({len(versions)} version(s)) → {source_url}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
