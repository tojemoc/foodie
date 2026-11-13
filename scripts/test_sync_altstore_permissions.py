import json
import plistlib
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


SCRIPT = Path(__file__).with_name("sync-altstore-permissions.py")


class SyncAltStorePermissionsTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.directory = Path(self.temp_dir.name)
        self.ipa_path = self.directory / "foodie.ipa"
        self.source_path = self.directory / "source.json"

        info = {
            "CFBundleExecutable": "Foodie",
            "NSCameraUsageDescription": "Scan barcodes",
            "NSFaceIDUsageDescription": "Unlock Foodie",
            "NotAUsageDescription": 42,
        }
        entitlements = {
            "application-identifier": "team.sk.tjm.foodie",
            "com.apple.developer.associated-domains": ["applinks:example.com"],
            "com.apple.security.application-groups": ["group.example"],
        }
        with zipfile.ZipFile(self.ipa_path, "w") as ipa:
            ipa.writestr(
                "Payload/Foodie.app/Info.plist",
                plistlib.dumps(info),
            )
            ipa.writestr(
                "Payload/Foodie.app/Foodie",
                b"binary-signature"
                + plistlib.dumps(entitlements, fmt=plistlib.FMT_XML),
            )

        self.source = {
            "app": {
                "bundleIdentifier": "sk.tjm.foodie",
                "appPermissions": {"entitlements": [], "privacy": {}},
            }
        }
        self.source_path.write_text(json.dumps(self.source), encoding="utf-8")

    def run_sync(self, *args):
        return subprocess.run(
            [sys.executable, str(SCRIPT), str(self.ipa_path), *args],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_extracts_permissions_and_filters_standard_entitlements(self):
        result = self.run_sync()

        self.assertEqual(result.returncode, 0, result.stderr)
        permissions = json.loads(result.stdout)
        self.assertEqual(
            permissions["privacy"],
            {
                "NSCameraUsageDescription": "Scan barcodes",
                "NSFaceIDUsageDescription": "Unlock Foodie",
            },
        )
        self.assertEqual(
            permissions["entitlements"],
            [
                "com.apple.developer.associated-domains",
                "com.apple.security.application-groups",
            ],
        )

    def test_syncs_repo_metadata_and_check_detects_drift(self):
        result = self.run_sync(
            "--source",
            str(self.source_path),
            "--bundle-id",
            "sk.tjm.foodie",
        )
        self.assertEqual(result.returncode, 0, result.stderr)

        synced = json.loads(self.source_path.read_text(encoding="utf-8"))
        permissions = synced["app"]["appPermissions"]
        self.assertIn("NSFaceIDUsageDescription", permissions["privacy"])
        self.assertIn("com.apple.security.application-groups", permissions["entitlements"])
        self.assertEqual(
            self.run_sync(
                "--source",
                str(self.source_path),
                "--bundle-id",
                "sk.tjm.foodie",
                "--check",
            ).returncode,
            0,
        )

    def test_check_does_not_modify_out_of_sync_source(self):
        before = self.source_path.read_text(encoding="utf-8")

        result = self.run_sync(
            "--source",
            str(self.source_path),
            "--bundle-id",
            "sk.tjm.foodie",
            "--check",
        )

        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.source_path.read_text(encoding="utf-8"), before)


if __name__ == "__main__":
    unittest.main()
