# Vendored auto-launch Startup Serialization Fix

The application retains `tauri-plugin-autostart` 2.5.1 and its `auto-launch`
0.5.0 API. This local patch fixes startup serialization and missing-key handling without changing
registration ownership, platform strategy, or the `--background` launch argument.

## Source And License

- Registry package: `auto-launch` 0.5.0.
- Repository: https://github.com/zzzgydi/auto-launch
- Original source commit: `fedaeba7a5ee6a5124b056907e03c399acd6df27`.
- crates.io checksum: `1f012b8cc0c850f34117ec8252a44418f2e34a2cf501de89e29b241ae5f79471`.
- Original MIT license: `LICENSE`, copied without changes. The app's `NOTICE`
  includes that complete notice for both binary distributions.
- Backport reference: upstream commit `e2feaffbdb6d8992bf1ddc8d5ec99e915ebbe1ed`
  (`src/windows_command_line.rs` and `src/macos.rs`).

The newer upstream 0.6 line also changes platform APIs and dependencies.
Updating the entire startup stack is unnecessary for these two fixes.

## Local Changes

1. `startup_serialization.rs` backports the upstream Windows command-line quoting
   algorithm and XML text escaping into pure functions used by the real Windows
   and macOS `enable` implementations. The public 0.5 API stays unchanged.
2. Windows keeps its current-user registry key, app name, enable/disable check,
   and refresh behavior. Executable paths are quoted and literal arguments
   preserve spaces, tabs, quotes, backslashes, empty strings, and Unicode.
   Enabling creates the per-user Run key if absent; checking or disabling an
   absent key/value is an idempotent disabled state. Other access failures still
   return errors. Input serialization is validated before registration writes.
3. macOS retains LaunchAgent registration. Label, executable, and arguments are
   XML-escaped, carriage returns use numeric references, and XML 1.0-invalid
   characters return an explicit error before any file is created. The complete
   plist is written with `write_all`. Re-enabling
   replaces an older malformed plist. The app already refreshes enabled entries
   at launch; disabled entries remain disabled.
4. The Cargo patch routes Tauri's existing dependency to this crate. It is a
   workspace member so ordinary workspace tests include serialization coverage.
   The test-only `plist` parser reuses the version already in the app lockfile.
5. Upstream integration tests and doctests that enable native login items are
   deliberately not run. The nine local unit tests only serialize data and
   parse plist output; they never touch real login items or registry settings.
   `tests/windows_registry.rs` includes the actual Windows implementation with
   an isolated registry contract, exercising absent keys/values, preserved
   unrelated entries, quoted background launch, and propagated access errors.
   It does not access the real registry or claim native Windows acceptance.

`src/linux.rs`, public builder/constructors, and the dependency declarations are
otherwise unchanged. No new startup mode, installer, or updater is introduced.

## Checks

```sh
cargo test --offline --locked --manifest-path src-tauri/Cargo.toml -p auto-launch --lib
```

Before the serialization patch, five of the seven regression tests failed.
After the initial patch all seven passed. Independent review added two XML
edge regressions; those failed before their fix and all nine now pass. Windows vectors cover executable/argument
boundaries, Unicode, UNC paths, quotes, empty arguments, trailing backslashes,
and invalid inputs. macOS tests parse the actual production serializer output
and compare decoded Label, ProgramArguments, and RunAtLoad values, including
the previously malformed ampersand-path case. XML 1.0 line-ending normalization
is applied before parsing, so carriage-return tests detect silent changes.
Invalid control/noncharacter values in Label, path, and arguments must return
`InvalidInput`. No native startup pass is claimed.
