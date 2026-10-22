# Proxy Configuration

One More Prompt can route Codex quota HTTP requests through an optional proxy.

- Supported proxy types: `socks5://`, `http://`, `https://`
- Config file: `~/.one-more-prompt/config.json`
- Existing configuration is copied once from the previous application identity
  when the new file does not already exist. The original file is kept.
- Default: off
- UI: none

## Config File

Create `~/.one-more-prompt/config.json`:

```json
{
  "proxy": {
    "enabled": true,
    "url": "socks5://127.0.0.1:10808"
  }
}
```

You can also use an authenticated proxy URL:

```json
{
  "proxy": {
    "enabled": true,
    "url": "http://user:pass@proxy.example.com:8080"
  }
}
```

## Behavior

- Config is loaded once when the app starts.
- Restart One More Prompt after changing the file.
- `localhost`, `127.0.0.1`, and `::1` always bypass the proxy.
- Missing, disabled, invalid, or unreadable config leaves proxying off.
- Proxy credentials are redacted in logs.

## Scope

This applies to Codex HTTP requests that go through One More Prompt's built-in HTTP client.

It is not a general macOS system proxy setting and does not automatically proxy unrelated subprocess network traffic.
