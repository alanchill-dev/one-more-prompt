---
name: release-tauri
description: >-
  Prepare and publish a One More Prompt release using local builds and manual
  GitHub Releases uploads: align versions, curate notes, build unsigned Windows
  x64 portable ZIPs and signed/notarized macOS DMGs, complete native acceptance,
  and verify uploaded assets. Use for version bumps, release candidates, tags,
  or GitHub Releases. Do not use for an updater feed or Linux packaging.
---

# Release One More Prompt

Produce one reviewed release through local packaging, native testing, and manual
GitHub publication. GitHub Actions is not part of this process.

## Required Context

Read the [release guide](../../../docs/releasing.md) completely. For Windows,
also read [portable testing](../../../docs/windows-portable-test.md).

Confirm the candidate, repository, advertised platforms/architectures, and
current authorization before making changes. Preserve unrelated work and never
publish against `upstream`.

Fixed policy:

- Windows uses an unsigned x64 portable ZIP. Do not substitute NSIS or
  self-signing. Keep normal per-user app data and disclose unsigned status and
  possible SmartScreen restrictions.
- macOS uses the existing valid local Developer ID Application certificate and
  local Apple notarization. Exact identities and credentials stay out of source
  and GitHub secrets. Reuse an authenticated local notarytool profile selected by
  NOTARY_PROFILE (default lutin-notary). The helper auto-selects a Developer ID
  only when exactly one valid identity is available; otherwise supply
  APPLE_SIGNING_IDENTITY locally. Use LUTIN_BIN for a CLI outside PATH.
- There is no updater feed, updater signature, or `latest.json` asset.
- Packaging/testing and publication are phases of one release. A local build does
  not prove native acceptance.

Prepare the safe local work within the user's requested scope. Version changes,
commits, pushes, tags, publication, and remote configuration changes require the
corresponding task authorization. Do not ask again for an action already
covered by that authorization. If a needed action is outside it, finish the
reviewable local work before requesting the missing authorization.

## 1. Prepare the Version and Notes

Read the current version, latest applicable tag, and relevant changes. Use a
SemVer version supported by `scripts/bump-version.mjs`. Keep notes concise and
based on actual shipped behavior. Preserve known contributor attribution.

When version changes are in scope:

```sh
bun run version:bump <version>
```

Add the matching `CHANGELOG.md` section and verify version alignment in
`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and the
`one-more-prompt` package entry in `src-tauri/Cargo.lock`.

## 2. Verify and Build Locally

Run the local checks in `CONTRIBUTING.md` and the release-mode plugin isolation
check in the release guide. Record results and any reviewed dependency-audit
exception. No GitHub Actions result is required or implied.

Build the selected candidates:

```sh
bun run build:windows-portable
bun run build:release
```

Run only commands for the selected platforms. The Windows command creates the
unsigned ZIP and Windows checksum manifest. The macOS command requires local
Developer ID signing and Apple notarization authentication; an ad-hoc bundle is
not a substitute.

Use `./scripts/build-release.sh --preflight` to check the local identity, existing
keychain profile, and config without building. It never creates credentials or
prints exact identities/accounts. `python3 scripts/test-build-release.py` checks
the preflight branches with isolated tools, without a real keychain or build.
Keep private release diagnostics local; do not upload them as Release assets.

Inspect archive contents and checksums. Verify each Mac DMG's Developer ID
signature, stapled notarization ticket, Gatekeeper acceptance, bundle identity,
and advertised architecture. Keep private records out of all release assets.

## 3. Complete Native Acceptance

Run the Windows portable checklist and the macOS clean-account checklist for
every advertised target. Record first launch, setup, tray behavior, startup,
quit/relaunch, upgrade with preserved data, and removal results. For Windows,
verify Test Notification, app name/icon, operating-system suppression, folder
move registration refresh, and notification cleanup without deleting user data.
Do not treat a successful notification API call as proof of displayed delivery.

If native acceptance is pending, state that precisely and keep preview status.
Do not call a cross-build, screenshot, or local installation complete release
acceptance. Existing installer-preview evidence does not prove ZIP acceptance.
An explicit owner-accepted limitation applies only to the exact reviewed
candidate. Record it without calling the missing check passed or executed,
and do not carry it into another release automatically.

## 4. Tag and Upload Manually

After the release gates pass and the task authorizes the relevant actions:

- Commit only the reviewed release candidate and create its matching annotated
  tag. Push to the project-owned `origin`.
- Prepare the exact advertised assets and checksum manifests from verified local
  outputs. Do not start another build merely by pushing a tag.
- Use the GitHub Releases UI or `gh release create` to upload those assets with the
  reviewed notes. Publish a non-draft Release with the intended prerelease status.
- Never replace an existing stable release asset silently.

A local-preparation-only task ends with the concrete candidates and results; it
does not proceed to versioning, tagging, pushing, or publication.

## 5. Verify the Published Result

Inspect the project repository's Release and require the exact reviewed tag and
commit, `isDraft: false`, intended prerelease status, all advertised packages and
checksums, and no updater metadata.

Download every asset and compare its checksum with the verified local output.
Repeat all Mac signature, notarization, Gatekeeper, identity, and architecture
checks. Confirm the downloaded packages still launch on their tested platforms.

Completion requires recorded acceptance evidence, including any explicit
owner-accepted Windows limitation for the current round, and one published
non-draft Release with the exact verified assets. Report any unmet gate plainly.
