#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"

# Keep local Rust and native C source paths out of the distributed executable.
export RUSTFLAGS="${RUSTFLAGS:+$RUSTFLAGS }--remap-path-prefix=$HOME=/build"
export CFLAGS="${CFLAGS:+$CFLAGS }-ffile-prefix-map=$HOME=/build"
export CXXFLAGS="${CXXFLAGS:+$CXXFLAGS }-ffile-prefix-map=$HOME=/build"

preflight_only=false
if [[ "${1:-}" == --preflight ]]; then
  preflight_only=true
  shift
fi
lutin_command="${LUTIN_BIN:-lutin}"
notary_profile="${NOTARY_PROFILE:-lutin-notary}"
for command_name in bun cargo "$lutin_command" security codesign xcrun spctl hdiutil trash; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

# Read only valid signing identities; never print names, fingerprints, or accounts.
signing_fingerprint="$(security find-identity -v -p codesigning | bun -e '
  const {readFileSync} = require("fs");
  const matches = [...readFileSync(0, "utf8").matchAll(/^\s*\d+\)\s+([A-Fa-f0-9]{40})\s+"(Developer ID Application:[^"]+)"/gm)];
  const requested = process.env.APPLE_SIGNING_IDENTITY;
  const selected = requested ? matches.filter(m => m[1] === requested || m[2] === requested) : matches;
  if (selected.length !== 1) {
    console.error(requested ? "The selected valid Developer ID Application identity is unavailable." : "Exactly one valid Developer ID Application identity is required; otherwise set APPLE_SIGNING_IDENTITY locally.");
    process.exit(1);
  }
  process.stdout.write(selected[0][1]);
')"

mkdir -p src-tauri/target/release-diagnostics
chmod 700 src-tauri/target/release-diagnostics
release_log="$(mktemp "$PWD/src-tauri/target/release-diagnostics/build.log.XXXXXX")"
run_private() {
  local stage="$1"
  shift
  if "$@" >> "$release_log" 2>&1; then
    return
  else
    local status=$?
    echo "$stage failed (exit $status). Private local diagnostics: $release_log" >&2
    return "$status"
  fi
}

echo "Checking the local Apple notarization profile..."
run_private "Notarization authentication; configure NOTARY_PROFILE in the local keychain" \
  xcrun notarytool history --keychain-profile "$notary_profile" --output-format json

release_config="$(mktemp "${TMPDIR:-/tmp}/one-more-prompt-lutin.yml.XXXXXX")"
mounted_dir=""
cleanup() {
  if [[ -n "$mounted_dir" ]]; then
    if hdiutil detach "$mounted_dir" >> "$release_log" 2>&1; then
      trash "$mounted_dir"
    else
      echo "Temporary DMG cleanup failed. Private local diagnostics: $release_log" >&2
    fi
  fi
  trash "$release_config"
}
trap cleanup EXIT

# Lutin resolves paths relative to the config, which is outside the repository.
OMP_RELEASE_FINGERPRINT="$signing_fingerprint" OMP_NOTARY_PROFILE="$notary_profile" bun -e '
  const {readFileSync} = require("fs");
  const {resolve} = require("path");
  let config = readFileSync("lutin.yml", "utf8");
  const replacements = [
    ["  identity: '\''RELEASE_BLOCKED_SET_APPLE_SIGNING_IDENTITY'\''", "  identity: " + JSON.stringify(process.env.OMP_RELEASE_FINGERPRINT)],
    ["  profile: lutin-notary", "  profile: " + JSON.stringify(process.env.OMP_NOTARY_PROFILE)],
    ["  path: ./src-tauri/target/release/bundle/macos/One More Prompt.app", "  path: " + JSON.stringify(resolve("src-tauri/target/release/bundle/macos/One More Prompt.app"))],
    ["  directory: ./src-tauri/target/release/bundle/lutin", "  directory: " + JSON.stringify(resolve("src-tauri/target/release/bundle/lutin"))],
  ];
  for (const [source, destination] of replacements) {
    if (!config.includes(source)) throw new Error("A required release config placeholder is missing.");
    config = config.replace(source, destination);
  }
  process.stdout.write(config);
' > "$release_config"
run_private "Release configuration validation" "$lutin_command" validate --config "$release_config"

if "$preflight_only"; then
  echo "Release preflight passed: valid Developer ID, authenticated local profile, and valid packaging config. No build performed."
  exit 0
fi

echo "Building the Developer ID signed application bundle..."
# Tauri signs locally; Lutin performs notarization using the existing profile.
run_private "Tauri signed build" env -u APPLE_ID -u APPLE_PASSWORD -u APPLE_TEAM_ID \
  APPLE_SIGNING_IDENTITY="$signing_fingerprint" bun run tauri build --bundles app "$@"

verify_developer_id() {
  local target="$1"
  local metadata
  run_private "Code signature verification" codesign --verify --deep --strict "$target"
  metadata="$(codesign --display --verbose=4 "$target" 2>&1)"
  if [[ "$metadata" != *"Authority=Developer ID Application:"* || "$metadata" != *"Timestamp="* ]]; then
    echo "The artifact lacks a timestamped Developer ID Application signature." >&2
    exit 1
  fi
  if [[ "$target" == *.app && ( "$metadata" != *"Identifier=com.alanchill.onemoreprompt"* || "$metadata" != *"(runtime)"* ) ]]; then
    echo "The app's bundle identity or hardened runtime is incorrect." >&2
    exit 1
  fi
}

app_bundle="$PWD/src-tauri/target/release/bundle/macos/One More Prompt.app"
test -d "$app_bundle"
verify_developer_id "$app_bundle"
echo "Signing and notarizing the DMG with the existing local profile..."
run_private "Lutin signing and notarization" "$lutin_command" release --config "$release_config" --json

version="$(bun -e 'console.log(require("./package.json").version)')"
dmg="$PWD/src-tauri/target/release/bundle/lutin/One-More-Prompt-${version}.dmg"
test -s "$dmg"
verify_developer_id "$dmg"
run_private "Stapled notarization validation" xcrun stapler validate "$dmg"
run_private "DMG Gatekeeper assessment" spctl --assess --type open --context context:primary-signature "$dmg"

mounted_dir="$(mktemp -d "${TMPDIR:-/tmp}/one-more-prompt-dmg.XXXXXX")"
run_private "Read-only DMG inspection" hdiutil attach -readonly -nobrowse -mountpoint "$mounted_dir" "$dmg"
verify_developer_id "$mounted_dir/One More Prompt.app"
run_private "Contained app Gatekeeper assessment" spctl --assess --type execute "$mounted_dir/One More Prompt.app"
run_private "DMG detach" hdiutil detach "$mounted_dir"
trash "$mounted_dir"
mounted_dir=""

echo "Release candidate verified: $dmg"
