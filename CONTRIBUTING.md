# Contributing to One More Prompt

One More Prompt is a local-first, Codex-only desktop app. Contributions should preserve that focused scope and keep prompt content, project names, and session names on the user's device.

Before starting a large feature, use the repository's Feature Request issue form so the scope can be discussed first.

## Development Setup

Requirements:

- Rust toolchain
- Bun
- macOS: Xcode Command Line Tools
- Windows: Visual Studio C++ Build Tools and WebView2

```bash
bun install
bun run bundle:plugins
bun run tauri dev
```

## Pull Request Workflow

1. Fork the repository and create a focused branch.
2. Make one coherent change and update affected documentation.
3. Add regression coverage for behavior changes when practical.
4. Run the relevant verification below.
5. Open a pull request against `main` and link the related issue.

For visual changes, include before and after screenshots from the real app.

## Verification

```bash
bun run test --run
bun audit
bun run build
bun run bundle:plugins
cargo test --workspace --locked --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml test_export_bindings
git diff --exit-code -- src/bindings.ts
```

Also test affected behavior with `bun run tauri dev` when the change depends on the desktop runtime. Run the Rust dependency audit locally with `cargo audit` from `src-tauri`; review findings against the affected target's dependency graph and record any accepted exception.

GitHub Actions is not used. Record local commands and results in the pull request.
Windows changes also need native Windows verification. Packaging and release
changes follow the [Windows portable test checklist](docs/windows-portable-test.md)
and [local release guide](docs/releasing.md); a cross-build does not replace native acceptance.

## Contribution Scope

Good contributions include:

- Clear bug fixes
- Codex usage or prompt-activity improvements
- Privacy, security, accessibility, and performance improvements
- Documentation corrections

Out of scope:

- Adding other AI providers
- Sending prompt or project data to an analytics service
- Unrelated product features or speculative abstractions
- New dependencies without a clear need

## Code Standards

- Use TypeScript for the frontend and Rust for the Tauri backend.
- Follow existing patterns and keep changes focused.
- Keep user-facing errors friendly while preserving useful error logging.
- Update files under `docs/` when behavior described there changes.

## License

By submitting a pull request, you agree that your contribution is licensed under the repository's [MIT License](LICENSE).

## Getting Help

See [Support](SUPPORT.md), then use the repository's Bug Report or Feature Request issue form.
