#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

# Use the local Mac cross-compiler without changing the shell configuration.
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:/opt/homebrew/opt/llvm/bin:/opt/homebrew/opt/lld/bin:/opt/homebrew/bin:$PATH"
export XWIN_CACHE_DIR="${XWIN_CACHE_DIR:-$HOME/Library/Caches/cargo-xwin}"

# Keep local Rust and native C source paths out of the distributed executable.
export RUSTFLAGS="${RUSTFLAGS:+$RUSTFLAGS }--remap-path-prefix=$HOME=/build"
export CFLAGS="${CFLAGS:+$CFLAGS }/clang:-ffile-prefix-map=$HOME=/build"
export CXXFLAGS="${CXXFLAGS:+$CXXFLAGS }/clang:-ffile-prefix-map=$HOME=/build"

for command_name in bun cargo-xwin clang-cl llvm-rc lld-link zip unzip shasum trash; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

echo "Building the unsigned Windows x64 application..."
bun run tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --no-bundle --ci

version="$(bun -e 'console.log(require("./src-tauri/tauri.conf.json").version)')"
package_name="One-More-Prompt-${version}-windows-x64-portable"
output_dir="$PWD/src-tauri/target/windows-portable"
staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/one-more-prompt-windows.XXXXXX")"
trap 'trash "$staging_dir"' EXIT
package_dir="$staging_dir/$package_name"

mkdir -p "$package_dir/icons" "$package_dir/resources"
cp src-tauri/target/x86_64-pc-windows-msvc/release/one-more-prompt.exe "$package_dir/"
cp -R src-tauri/resources/bundled_plugins "$package_dir/resources/"
cp src-tauri/icons/tray-icon.png src-tauri/icons/icon.png src-tauri/icons/icon.icns "$package_dir/icons/"
cp scripts/windows/remove-notification-registration.cmd "$package_dir/"
cp LICENSE "$package_dir/LICENSE.txt"
cp NOTICE "$package_dir/NOTICE.txt"

cat > "$package_dir/README.txt" <<'EOF'
One More Prompt - Windows x64

1. Extract the entire ZIP to a folder. Keep one-more-prompt.exe, icons, and resources together.
2. Install Microsoft Edge WebView2 Runtime if it is not already available:
   https://developer.microsoft.com/microsoft-edge/webview2/#download-section
3. Run one-more-prompt.exe from the extracted folder.

This package is unsigned. Windows SmartScreen or your organization's policies
may warn about or restrict running it. Native Windows testing must be recorded
for this exact candidate; build verification is not a native test pass.
Windows notifications use a registration for the current user. The app refreshes
its name and icon registration when it launches. Test delivery in Settings >
Menu Bar & Quick Open > Usage Alerts > Test Notification. Windows notification
permissions, Do Not Disturb, or security policies may suppress delivery.
Clicking a notification does not launch the app.

WebView2 Runtime is not included or installed automatically. If it is missing,
install it from the Microsoft download above, then reopen the app.

The ZIP makes the application portable, not its data. Settings and cached data
remain in %APPDATA%\com.alanchill.onemoreprompt. Local Codex sign-in and session
files remain in their normal Codex locations.

Before replacing the application with a newer version, quit it from the tray.
Replace the entire extracted folder so the executable and resources stay together.
Before moving or deleting the folder, disable Launch At Login in Settings.
After moving it, launch one-more-prompt.exe from its new location, then re-enable
Launch At Login if you want it to start automatically.

To remove the app:
1. Disable Launch At Login in Settings.
2. Quit One More Prompt from the tray.
3. Double-click remove-notification-registration.cmd and check its result.
4. Delete the extracted app folder after cleanup succeeds.
The cleanup tool removes only this app's current-user notification registration.
It does not delete app data, Codex files, or startup settings. Relaunching the app
creates its notification registration again.
EOF

(
  cd "$staging_dir"
  zip -qr "$package_name.zip" "$package_name"
  unzip -tq "$package_name.zip"
)

mkdir -p "$output_dir"
if [[ -e "$output_dir/$package_name.zip" ]]; then
  echo "Replacing the existing local package: $output_dir/$package_name.zip"
  trash "$output_dir/$package_name.zip"
fi
mv "$staging_dir/$package_name.zip" "$output_dir/"
(
  cd "$output_dir"
  shasum -a 256 "$package_name.zip" > SHA256SUMS-windows.txt
  shasum -a 256 -c SHA256SUMS-windows.txt
)

echo "Windows portable package verified: $output_dir/$package_name.zip"
