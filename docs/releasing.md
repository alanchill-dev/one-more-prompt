# Releasing One More Prompt Locally

Build and verify locally, complete native acceptance, then manually upload the
reviewed assets to GitHub Releases. Packaging, testing, and publication are
phases of one release. A successful build alone does not complete a release.

## Release Policy

- GitHub remains the source repository and Release host. GitHub Actions is not
  used for testing, signing, packaging, or publication.
- Windows first distribution is an unsigned x64 portable ZIP. Extract the whole
  folder and run the app; do not substitute NSIS or self-signing. Settings and
  cache remain in normal per-user app data, rather than moving with the ZIP.
- macOS uses the existing valid Developer ID Application certificate in the local
  keychain. Sign locally, notarize with Apple, and staple the ticket locally.
- Keep exact signing identities and Apple credentials out of source and GitHub
  secrets. `lutin.yml` retains its fail-closed signing placeholder.
- Use bundle identity `com.alanchill.onemoreprompt` and retain the Codex-only plugin scope.
  Verify one-time migration from existing installations before packaging.
- Release checking uses the project-owned GitHub stable-release API, followed by
  user-controlled download and replacement. There is no installation updater
  feed. Keep `bundle.createUpdaterArtifacts: false` in
  `src-tauri/tauri.conf.json`; do not upload `latest.json` or updater signatures.
- Build only from the reviewed candidate. Advertise only platforms and
  architectures that have passed their native acceptance checks.
- Local preparation does not authorize a version change, commit, push, tag,
  publication, repository rename, visibility change, or remote configuration
  change. Use the authorization already given for the current task.

## Public Repository

Public source and releases are hosted in `alanchill-dev/one-more-prompt`.
Version v1.0.0 is the first formal public release, with `isDraft: false`
and `isPrerelease: false`.

The initial public repository contains the reviewed source snapshot in a new
Git history. Preserve required MIT copyright and license notices. Do not
upload private development history, diagnostics, user-data fixtures, or
preparation-only working files.

Record the source revision, package checksums, completed checks, and any
explicit owner-accepted limitations for each release. A build or package
check is not native acceptance.

## Prepare the Candidate

1. Review the worktree and preserve unrelated changes. Record the candidate
   commit SHA and check that only the intended release files are included.
2. For an authorized version change, use `bun run version:bump <version>`.
   Confirm the same version in `package.json`, `src-tauri/Cargo.toml`,
   `src-tauri/tauri.conf.json`, and the `one-more-prompt` entry in `src-tauri/Cargo.lock`.
3. Update `CHANGELOG.md` and `docs/release-notes/v1.0.0*.md`. English is the
   default; include the eight matching translations. Keep features, filenames,
   unsigned Windows status, privacy, and known limitations equivalent. Remove
   local-preparation banners as part of the authorized publication; verify the
   final text matches the published result.
4. Run the local checks in [Contributing](../CONTRIBUTING.md), including frontend
   and Rust tests, dependency audits, generated bindings, and the production
   build. Record the commands, results, and any reviewed audit exception.
5. Verify release-mode plugin isolation from `src-tauri`:

   ```sh
   cargo test --release --locked -p one-more-prompt \
     plugin_engine::tests::release_builds_ignore_development_plugin_directories \
     -- --exact
   ```

Both packaging scripts remap local Rust and native C source paths during
compilation. Inspect the final executables for developer paths before upload;
these flags do not remove actual credentials or user data from an archive.

A build or cross-build does not replace native acceptance. Complete required
native checks or record an explicit owner-accepted limitation for the exact
candidate before publication. Never report an accepted limitation as a test pass.

## Build the Windows ZIP

This is a macOS-to-Windows cross-build. Complete the
[development setup](../CONTRIBUTING.md#development-setup), then install these
additional tools:

| Required Command(s) | Installation |
| --- | --- |
| `cargo-xwin` | Follow [cargo-xwin](https://github.com/rust-cross/cargo-xwin#installation): `cargo install --locked cargo-xwin`. |
| `clang-cl`, `llvm-rc` | Install [LLVM](https://formulae.brew.sh/formula/llvm): `brew install llvm`. |
| `lld-link` | Install the separate [LLD formula](https://formulae.brew.sh/formula/lld): `brew install lld`. |
| `trash` | Follow the [trash installation instructions](https://github.com/ali-rantakari/trash#installing). |
| `zip`, `unzip`, `shasum` | Use the standard macOS command-line tools; ensure each is available on `PATH`. |

Add Rust's Windows target with `rustup target add x86_64-pc-windows-msvc`.
The script checks these commands and `bun` before building. It includes the
standard Bun, Cargo, and Apple Silicon Homebrew LLVM/LLD directories in its
process-local `PATH`; put tools installed elsewhere on `PATH` before starting.

From the repository root:

```sh
bun run build:windows-portable
```

Expected build outputs:

- `src-tauri/target/windows-portable/One-More-Prompt-<version>-windows-x64-portable.zip`
- `src-tauri/target/windows-portable/SHA256SUMS-windows.txt`

The archive must contain `one-more-prompt.exe`, its icons, the bundled Codex plugin, and
`remove-notification-registration.cmd`. WebView2 is supplied by the system, not
bundled or installed automatically; document the official Microsoft download
for machines missing it. The archive must not contain developer source or tools,
private paths, credentials, logs, or user data. Review the archive contents and checksum before
handing it to a tester.

Follow [Windows Portable Testing](windows-portable-test.md) on a clean x64
Windows account, including extraction, first launch, tray behavior, startup,
upgrade with preserved user data, and removal. Include **Test Notification**,
the app's notification name/icon, operating-system suppression, registration
refresh after moving the folder, and notification-registration cleanup. Record
any security warning and WebView2 requirement. A successful notification API
request does not prove that Windows displayed it. The ZIP remains unsigned;
do not describe a successful cross-build as native acceptance.

## Build the macOS DMG

Use Bun, Rust, Tauri's macOS build prerequisites, and the official
[Lutin CLI](https://github.com/Halloweedev/lutin). The script finds the standard
local Bun and Cargo directories without changing shell configuration. A Lutin
binary outside PATH can be supplied explicitly.

| Variable | Local Requirement |
| --- | --- |
| `NOTARY_PROFILE` | Existing authenticated `notarytool` keychain profile; defaults to `lutin-notary`. |
| `APPLE_SIGNING_IDENTITY` | Optional local identity name or fingerprint. With no override, exactly one valid Developer ID Application identity must be available. |
| `LUTIN_BIN` | Optional absolute path to the official Lutin CLI when it is outside PATH. |

Reuse an existing profile when available. If a profile must be created, run this
locally in Terminal and enter the Apple credentials into the interactive prompts:

```sh
xcrun notarytool store-credentials lutin-notary
```

The release helper does not create or overwrite keychain credentials. It checks
the selected profile with Apple before any build. Do not place exact identities,
account details, passwords, or API keys in source, GitHub secrets, or shared logs.
An ad-hoc or Apple Development signature is not a substitute for Developer ID.

From the repository root, check readiness without building:

```sh
./scripts/build-release.sh --preflight
```

If needed, prefix the command with `LUTIN_BIN=/absolute/path/to/lutin` and
`NOTARY_PROFILE=your-existing-profile`. Missing tools, an ambiguous or invalid
certificate, or failed profile authentication stop preparation with a clear
error. Detailed tool output stays in private local files under
`src-tauri/target/release-diagnostics/`; do not upload these files.

After preflight succeeds:

```sh
bun run build:release
```

The script keeps the source `lutin.yml` fail-closed and renders a private
temporary copy with absolute app/output paths. Tauri builds the app with the
selected Developer ID; Lutin signs the DMG-contained app and DMG, submits it
using the existing keychain profile, and staples the ticket. The script verifies
Developer ID, timestamps, hardened runtime, bundle identity, the contained app,
and Gatekeeper acceptance. Temporary config and mount folders are moved to Trash.
Its output is:

```text
src-tauri/target/release/bundle/lutin/One-More-Prompt-<version>.dmg
```

Check the contained architecture before naming a public asset. Build and test
each architecture that will be advertised; the current local build does not
prove another architecture. Keep the architecture visible in the Release asset
name when distributing multiple Mac builds.

Run `python3 scripts/test-build-release.py` for seven isolated preflight checks.
They cover certificate selection, the existing profile, absolute config paths,
failure handling, and private output without accessing a real keychain, building,
or notarizing. They do not prove Apple acceptance of an artifact.

## Verify macOS Assets

Run these checks on each candidate DMG and repeat them on the asset downloaded
from GitHub after publication. Replace the DMG path with the actual file:

```sh
DMG=/absolute/path/to/One-More-Prompt-<version>.dmg
MOUNT_DIR="$(mktemp -d)"

codesign --verify --strict --verbose=2 "$DMG"
codesign --display --verbose=4 "$DMG"
xcrun stapler validate "$DMG"
spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG"
hdiutil attach -readonly -nobrowse -mountpoint "$MOUNT_DIR" "$DMG"

APP="$MOUNT_DIR/One More Prompt.app"
codesign --verify --deep --strict --verbose=2 "$APP"
codesign --display --verbose=4 "$APP"
spctl --assess --type execute --verbose=4 "$APP"
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist"

EXECUTABLE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Contents/Info.plist")"
lipo -archs "$APP/Contents/MacOS/$EXECUTABLE"

hdiutil detach "$MOUNT_DIR"
```

Require valid Developer ID signatures, a valid stapled ticket, accepted
Gatekeeper assessments, the exact bundle identifier, and the advertised
architecture. No security override is a passing macOS result.

## Native macOS Acceptance

Use a clean supported Mac account for every advertised architecture, without a
repository checkout or developer environment:

1. Open the candidate DMG normally in Finder. Do not remove quarantine or use a
   right-click Open override. Drag the app to Applications and launch normally.
2. Confirm there is no unidentified-developer or damaged-app warning.
3. Complete the three-screen setup, starting with language selection. Counts or
   unavailable states must be truthful; setup must never show Prompt text.
   First setup has no Skip action. Verify waiting, discovery, checking, and
   organizing stages. Once known, real checked/total file counts include
   cache-validated files; the percentage must not advance on a timer. Open
   Workspace stays disabled until organization finishes, even after every file
   is checked. No records and scan failure stay distinct, with Retry available.
   Quit before completing setup and relaunch: setup remains required. After
   completion, Recheck Codex opens its own check with Skip Setup available;
   it does not start the guide. Reopening an already running app reveals its
   current window and retains one tray process.
4. Open Workspace offers the optional three-stage, 20-step demo guide with or
   without Codex sign-in or local history. Its interface and demo records must
   retain the selected language. Complete its Overview, Projects, and Timeline
   lessons: reading steps use Continue and action steps enable Next only after
   the requested operation. Back retains completed operations. Skip Guide,
   Escape, and Finish Guide return to the unchanged workspace. Replay Guide
   starts again at the introduction; demo actions must leave real records,
   account limits, and saved preferences intact. Overview starts with Today.
5. Verify supported languages, light/dark appearance, keyboard navigation,
   notifications, menu-bar behavior, shortcut, quit, and relaunch.
6. Upgrade from the prior version and confirm settings and local product data
   remain. Verify removal instructions without deleting Codex source data.
7. Verify the One More Prompt stable-release check: startup, six-hour checks,
   manual Check for Updates, the icon left of Settings, error/retry, and the
   correct platform download. No automatic installation or inherited updater
   service may appear. See [Update Help](updates.md). A missing public release
   must say it is not published yet, never claim the app is up to date.

Record the operating-system version, architecture, candidate filename, checksum,
and results. Screenshots and automated tests support this record; they do not
replace it. Repeat launch and checksum checks with the downloaded Release asset.

## Manually Publish the Accepted Release

Perform this phase only when the current task authorizes the relevant commit,
push, tag, and publication. Do not ask again for actions already authorized.

1. Ensure all advertised candidates passed local checks. Complete required native
   acceptance or record an explicit owner-accepted limitation for the exact
   candidate. Record package checksums and evidence; never call a limitation a pass.
2. Record the exact reviewed commit and create the matching annotated version tag
   when authorized. Push to the project-owned `origin`, never `upstream`.
3. Copy the accepted assets to one release directory. Generate a checksum manifest
   for the complete set; retain `SHA256SUMS-windows.txt` alongside the ZIP when
   including the Windows package. Verify the manifests before upload.
4. Use the GitHub Releases page or `gh release create` to upload the accepted
   assets with the reviewed notes. A tag does not start a build or publisher.
   Use English release notes first and link the eight translations. For the
   approved initial public v1.0.0, publish with `isDraft: false` and
   `isPrerelease: false`. Failed checks and unaccepted limitations block publication.
   Do not replace an existing stable asset.
5. Download every attached asset again and verify its checksum. For macOS, repeat
   signature, notarization, Gatekeeper, identity, and architecture checks above.

Inspect the published result:

```sh
gh release view <tag> --repo <owner>/<repo> \
  --json tagName,targetCommitish,isDraft,isPrerelease,assets,url
```

Require `isDraft: false`, `isPrerelease: false` for public v1.0.0, the exact reviewed tag
and commit, all advertised packages and checksums, correct notes, and no updater
metadata. GitHub must serve the same verified bytes produced locally.

## Stop Conditions

Stop and report the specific unmet condition when:

- A required local check fails, an audit finding is unresolved, or the candidate
  includes unexplained changes.
- Version files, changelog, tag, or recorded commit disagree.
- macOS signing identity is invalid or Apple notarization authentication is missing.
- A macOS signature, notarization ticket, Gatekeeper check, bundle identity, or
  architecture check fails.
- Windows archive contents are incomplete, a checksum differs, or native launch,
  tray, notifications, startup, upgrade, or removal acceptance has not passed
  without an explicit owner-accepted limitation for the current round.
- Any advertised package or checksum is missing, the Release remains a draft, or
  the uploaded/downloaded bytes differ from the verified local candidates.
- Publication or a related remote action is outside the user's authorized scope.

Fix the cause and verify again. If a published stable asset fails a gate, do not
silently replace it; produce a new patch version through the same local process.
