#!/usr/bin/env python3
"""Sync AltStore appPermissions with the permissions embedded in an iOS IPA."""

from __future__ import annotations

import argparse
import json
import plistlib
import re
import sys
import zipfile
from pathlib import Path
from typing import Any


IGNORED_ENTITLEMENTS = {
    "application-identifier",
    "com.apple.developer.team-identifier",
    "get-task-allow",
    "keychain-access-groups",
    "beta-reports-active",
}

APP_PLIST_RE = re.compile(r"(Payload/[^/]+\.app/)Info\.plist$")
ENTITLEMENTS_PLIST_RE = re.compile(rb"<\?xml.*?</plist>", re.DOTALL)


def find_app_dir(ipa: zipfile.ZipFile) -> str:
    for name in ipa.namelist():
        match = APP_PLIST_RE.fullmatch(name)
        if match:
            return match.group(1)
    raise ValueError("no Payload/*.app/Info.plist found; is this an IPA?")


def read_privacy(info: dict[str, Any]) -> dict[str, str]:
    return {
        key: value
        for key, value in sorted(info.items())
        if key.endswith("UsageDescription") and isinstance(value, str)
    }


def read_entitlements(binary: bytes) -> list[str]:
    found: set[str] = set()
    for match in ENTITLEMENTS_PLIST_RE.finditer(binary):
        try:
            data = plistlib.loads(match.group())
        except plistlib.InvalidFileException:
            continue
        if isinstance(data, dict) and (
            "application-identifier" in data
            or any(key.startswith("com.apple.") for key in data)
        ):
            found.update(data)
    return sorted(found - IGNORED_ENTITLEMENTS)


def build_permissions(ipa_path: str, with_entitlements: bool = True) -> dict[str, Any]:
    with zipfile.ZipFile(ipa_path) as ipa:
        app_dir = find_app_dir(ipa)
        info = plistlib.loads(ipa.read(app_dir + "Info.plist"))
        entitlements: list[str] = []
        executable = info.get("CFBundleExecutable")
        if with_entitlements and executable:
            entitlements = read_entitlements(ipa.read(app_dir + executable))

    return {"entitlements": entitlements, "privacy": read_privacy(info)}


def find_app(source: dict[str, Any], bundle_id: str) -> dict[str, Any]:
    candidates = source.get("apps")
    if not isinstance(candidates, list):
        candidates = [source.get("app")]
    app = next(
        (
            candidate
            for candidate in candidates
            if isinstance(candidate, dict)
            and candidate.get("bundleIdentifier") == bundle_id
        ),
        None,
    )
    if app is None:
        raise ValueError(f"bundle id {bundle_id} not found in source")
    return app


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ipa", help="Path to the IPA to inspect")
    parser.add_argument("--source", help="Source JSON to patch or check")
    parser.add_argument("--bundle-id", help="App bundle identifier in the source")
    parser.add_argument("--check", action="store_true", help="Fail if source is out of sync")
    parser.add_argument(
        "--no-entitlements",
        action="store_true",
        help="Only sync privacy keys; preserve declared entitlements",
    )
    args = parser.parse_args()

    try:
        permissions = build_permissions(args.ipa, with_entitlements=not args.no_entitlements)
        if not args.source:
            print(json.dumps(permissions, indent=2, ensure_ascii=False))
            return 0
        if not args.bundle_id:
            raise ValueError("--source requires --bundle-id")

        source_path = Path(args.source)
        source = json.loads(source_path.read_text(encoding="utf-8"))
        app = find_app(source, args.bundle_id)
        current = app.get("appPermissions", {})
        if args.no_entitlements:
            permissions["entitlements"] = current.get("entitlements", [])

        if current == permissions:
            print("source already in sync")
            return 0
        if args.check:
            print("source is OUT OF SYNC", file=sys.stderr)
            print("declared:", json.dumps(current, indent=2), file=sys.stderr)
            print("in IPA:  ", json.dumps(permissions, indent=2), file=sys.stderr)
            return 1

        app["appPermissions"] = permissions
        source_path.write_text(
            json.dumps(source, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"patched appPermissions for {args.bundle_id}")
        return 0
    except (OSError, ValueError, KeyError, zipfile.BadZipFile, plistlib.InvalidFileException) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
