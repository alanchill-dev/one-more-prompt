#!/usr/bin/env python3
"""Check release preflight without accessing a keychain, building, or notarizing."""
import os
from pathlib import Path
import subprocess
import tempfile

repo = Path(__file__).resolve().parents[1]
fixture = Path(tempfile.mkdtemp(prefix="one-more-prompt-release-test-")).resolve()
try:
    (fixture / "scripts").mkdir()
    (fixture / "bin").mkdir()
    subprocess.run(["cp", str(repo / "scripts/build-release.sh"), str(fixture / "scripts")], check=True)
    subprocess.run(["cp", str(repo / "lutin.yml"), str(fixture)], check=True)
    (fixture / "package.json").write_text('{"version":"0.0.0"}')
    fake = fixture / "bin/fake"
    fake.write_text('''#!/usr/bin/env python3
import json, os
from pathlib import Path
import sys
name = Path(sys.argv[0]).name
if name == "security":
    mode = os.environ["CERT_CASE"]
    if mode != "none":
        prefix = "Apple Development:" if mode == "development" else "Developer ID Application:"
        print('  1) ' + 'A' * 40 + ' "' + prefix + ' Test Owner (TESTTEAM01)"')
    if mode == "ambiguous":
        print('  2) ' + 'B' * 40 + ' "Developer ID Application: Other Owner (TESTTEAM02)"')
elif name == "xcrun":
    assert sys.argv[1:3] == ["notarytool", "history"]
    assert sys.argv[sys.argv.index("--keychain-profile") + 1] == "Existing Local Profile"
    if os.environ.get("AUTH_FAIL") == "1":
        print("Private Apple authentication failure", file=sys.stderr)
        sys.exit(69)
elif name == "lutin":
    assert sys.argv[1] == "validate", "Preflight must never release an app"
    config = Path(sys.argv[sys.argv.index("--config") + 1]).read_text()
    values = {}
    for line in config.splitlines():
        if line.startswith(("  path: ", "  directory: ", "  identity: ", "  profile: ")):
            key, value = line.strip().split(": ", 1)
            values[key] = json.loads(value)
    root = Path(os.environ["FIXTURE_ROOT"])
    assert values["path"] == str(root / "src-tauri/target/release/bundle/macos/One More Prompt.app")
    assert values["directory"] == str(root / "src-tauri/target/release/bundle/lutin")
    assert values["identity"] == "A" * 40
    assert values["profile"] == "Existing Local Profile"
    assert "hardenedRuntime: true" in config and "signDmg: true" in config
    assert "staple: true" in config and "RELEASE_BLOCKED" not in config
''')
    fake.chmod(0o755)
    for name in ("security", "xcrun", "lutin"):
        (fixture / "bin" / name).symlink_to(fake)

    env = os.environ.copy()
    for name in ("APPLE_SIGNING_IDENTITY", "APPLE_ID", "APPLE_PASSWORD", "APPLE_TEAM_ID"):
        env.pop(name, None)
    env.update(PATH=str(fixture / "bin") + os.pathsep + env["PATH"],
               LUTIN_BIN=str(fixture / "bin/lutin"),
               NOTARY_PROFILE="Existing Local Profile", FIXTURE_ROOT=str(fixture))
    cases = [("unique", None, False, 0), ("ambiguous", "A" * 40, False, 0),
             ("ambiguous", None, False, 1), ("none", None, False, 1),
             ("development", None, False, 1), ("unique", "B" * 40, False, 1),
             ("unique", None, True, 69)]
    for mode, identity, auth_fail, expected in cases:
        child_env = dict(env, CERT_CASE=mode, AUTH_FAIL="1" if auth_fail else "0")
        if identity:
            child_env["APPLE_SIGNING_IDENTITY"] = identity
        result = subprocess.run(["bash", str(fixture / "scripts/build-release.sh"), "--preflight"],
                                env=child_env, capture_output=True, text=True)
        assert result.returncode == expected, (mode, expected, result.returncode, result.stderr)
        output = result.stdout + result.stderr
        assert "Test Owner" not in output and "A" * 40 not in output
        assert "Private Apple authentication failure" not in output
        if expected == 0:
            assert "No build performed" in output
    print("Release preflight: 7 cases passed; no keychain access, app build, or notarization.")
finally:
    subprocess.run(["trash", str(fixture)], check=True)
