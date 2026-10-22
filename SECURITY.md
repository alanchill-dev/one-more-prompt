# Security Policy

## Reporting a Vulnerability

Please do not open a public issue for a suspected vulnerability.

Open the repository's **Security** tab and use GitHub private vulnerability reporting when it is available. If it is unavailable, submit a bug report containing only a request for a private reporting channel. Do not include vulnerability details, logs, credentials, or proof-of-concept code in that public request.

Include:

- A description of the vulnerability and its impact
- Reproduction steps or a minimal proof of concept
- The affected version or commit
- Any suggested mitigation

## Scope

In scope:

- The One More Prompt desktop application
- The bundled Codex integration
- The local HTTP API
- Build and release infrastructure maintained in this repository

Out of scope:

- OpenAI or Codex services and accounts
- Social engineering
- Denial-of-service reports without a security impact

## Sensitive Data

Do not include access tokens, session content, project names, or unredacted logs in a report. See [How to Capture Logs for a Bug Report](docs/capture-logs.md) and review every file before sharing it.

## Supported Versions

Security fixes target the latest code on `main` and the latest published release, when one exists.
