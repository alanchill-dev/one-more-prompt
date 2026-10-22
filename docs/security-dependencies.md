# Dependency Security

Checked on 2026-10-22 against the current RustSec advisory database. The Rust lockfile has **0 known vulnerabilities**, **0 yanked
packages**, and **13 informational warnings**. Bun audit reports **0 known
vulnerabilities**. No advisories are ignored.
This result describes the checked dependency versions, not a guarantee against
future advisories or a complete application security review.

## Resolved Findings

| Dependency | Change | Result |
| --- | --- | --- |
| Rustls | 0.23.37 → 0.23.46 | Fixes the TLS handshake issue in [RUSTSEC-2026-0285](https://rustsec.org/advisories/RUSTSEC-2026-0285.html). |
| Windows notifications | `tauri-winrt-notification` 0.7.2 → 0.8.1 and `notify-rust` 4.18.0 → 4.18.2 | Removes the old XML dependency. |
| quick-xml | Removes 0.37.5; the remaining version is 0.42.0 | Resolves [RUSTSEC-2026-0194](https://rustsec.org/advisories/RUSTSEC-2026-0194.html) and [RUSTSEC-2026-0195](https://rustsec.org/advisories/RUSTSEC-2026-0195.html). |
| rust_decimal | 1.40.0 → 1.43.0 | Removes the unused optional `rkyv` 0.7.46 dependency and [RUSTSEC-2026-0235](https://rustsec.org/advisories/RUSTSEC-2026-0235.html). |
| uds_windows | 1.2.0 → 1.2.1 | Replaces a version withdrawn from crates.io. |
| Vite | 8.0.16 → 8.1.6 | Fixes the development editor-launch findings [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm), [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv), and [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw). |
| rustls-webpki | 0.103.15 → 0.103.16 | Rejects distrusted intermediate certificates described in [RUSTSEC-2026-0382](https://rustsec.org/advisories/RUSTSEC-2026-0382.html). |
| webpki-root-certs / webpki-roots | 1.0.6 / 1.0.8 → 1.0.10 | Removes the distrusted root described in [RUSTSEC-2026-0383](https://rustsec.org/advisories/RUSTSEC-2026-0383.html) and [RUSTSEC-2026-0381](https://rustsec.org/advisories/RUSTSEC-2026-0381.html). |
| rquickjs | 0.12.1 → 0.14.0 | Includes the upstream JavaScript buffer-borrowing safety fix and engine corrections described in its [changelog](https://github.com/DelSkayn/rquickjs/blob/v0.14.0/CHANGELOG.md). |

The upstream updates above remain in the lockfiles. Vitest and V8 coverage are
also pinned to 4.1.12 for the patched test-tool advisories. The app additionally
vendors a bounded auto-launch serialization/registration fix; its upstream
license and patch provenance are recorded in `src-tauri/vendor/auto-launch/VENDORING.md`.

## JavaScript Runtime Review

The rquickjs update changes the Rust APIs for borrowing JavaScript buffer data.
The app does not call those buffer-borrowing APIs or the removed
`StaticJsFunction` trait. Host callbacks exchange owned strings, string lists,
and normal JavaScript values. This source review did not establish an affected
application call path; an upstream safety fix is not itself proof of an
exploitable application vulnerability.

The runtime executes trusted bundled Codex code with the existing host access.
It is not a sandbox for arbitrary third-party scripts, and the update adds no
host permissions. Native QuickJS tests cover chained promises, genuinely
unresolved promises, and deadline interruption inside a queued callback. A
callback interrupted at its deadline now reports a timeout instead of an
unresolved promise; this classification bug was reproduced with both engine
versions before fixing the shared error handling.

## Remaining Warnings

Eleven warnings concern dependencies whose maintenance has stopped. Two concern
potentially unsafe code under conditions that do not occur in the current
macOS and Windows dependency paths. They remain visible in the audit output.

| Dependency | Current Scope And Action |
| --- | --- |
| `glib` 0.18.5 | [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) concerns string iteration. This GTK dependency is present for Linux and absent from the macOS and Windows trees. Resolve it through compatible GTK/Tauri updates before shipping Linux. |
| `rand` 0.7.3 | [RUSTSEC-2026-0097](https://rustsec.org/advisories/RUSTSEC-2026-0097.html) requires a logging/thread-local RNG interaction. Tauri's build-time `phf_generator` uses a fixed-seed `SmallRng`; the affected `log` feature is disabled in both release targets. Recheck these conditions when dependencies change. |
| `fxhash` 0.2.1 and `paste` 1.0.15 | Maintenance warnings from Tauri's HTML dependencies and Specta. Track their upstream replacements; do not replace the framework or generated bindings solely to remove these warnings. |
| `proc-macro-error` 1.0.4 | Maintenance warning from Linux GTK macros. Address with the Linux dependency update. |
| Five `unic-*` crates at 0.9.0 | Maintenance warnings from Tauri's URL-pattern support. Track a compatible upstream replacement. |
| `zbus_names` 4.3.1, `zvariant` 5.10.0 and `zvariant_derive` 5.10.0 | Maintenance warnings for Linux D-Bus support. These packages are absent from both advertised target trees; review compatible updates before shipping Linux. |

The five Unicode crates are `unic-char-property`, `unic-char-range`,
`unic-common`, `unic-ucd-ident`, and `unic-ucd-version`.

## Verification

Run the audit with Cargo available on `PATH` so that the crates.io lookup can
check withdrawn versions as well as the advisory database:

```sh
cargo audit --file src-tauri/Cargo.lock --deny yanked
```

The current source passed 2,006 frontend/plugin tests and 377 Rust workspace
tests in both debug and optimized builds. The opt-in private-history corpus
test also passed separately: compressed historical records were present, and
cold and warm history results matched. Its sources were read-only and its
indexes and raw output stayed local. The production frontend build, generated
IPC check, macOS app build, and Windows x64 cross-build passed. The retained target feature
trees exclude `glib` and the three D-Bus warning packages from macOS arm64 and
Windows x64; `rand`'s affected `log` feature is disabled in both targets.

Reproduce the source checks locally:

```sh
bun run test --run --maxWorkers=4
bun audit
bun run build
cargo test --workspace --locked --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml test_export_bindings
git diff --exit-code -- src/bindings.ts
```

Source tests and cross-compilation do not run the app on Windows. Native
acceptance and any explicit owner-accepted limitation are recorded for the exact
package separately; this dependency audit is not a native test pass.
