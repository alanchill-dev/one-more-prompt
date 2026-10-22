# Local HTTP API

One More Prompt exposes a read-only HTTP API on the loopback interface so other local apps can consume the same usage data shown in the menu bar.

**Base URL:** `http://127.0.0.1:6736`

The server starts automatically with the app. If the port is already in use, the app logs the failure and the API is unavailable for that session.

## Routes

### `GET /v1/usage`

Returns the cached Codex usage snapshot when one is available.
Old provider IDs in saved settings or caches are ignored. Upgrading does not
make a removed provider available through this route or the workspace cache;
the old data does not need to be deleted.

- **200 OK** — JSON array (may be empty `[]` if no cached data exists yet).

### `GET /v1/usage/:providerId`

Returns the cached Codex usage snapshot for `codex`.

- **200 OK** — JSON object with cached snapshot.
- **204 No Content** — Provider is known but has no cached snapshot yet.
- **404 Not Found** — Provider ID is unknown.

### Unsupported methods

Any method other than `GET` or `OPTIONS` on the above routes returns **405 Method Not Allowed**.

Unknown routes return **404 Not Found**.

## Response Shape

The `Rate Limit Resets` text line can include `resetCredits` with an `availableCount`, individual
`credits` (`id`, `grantedAt`, `expiresAt`), and official `history` events (`id`, `kind`, `occurredAt`).
Event kinds are `granted` and `used`. `historyState` is `ready`, `unavailable`, `disabled`, or
`partial`; `historyWindowStart` and `historyAsOf` describe the server's recent 30-day history window.
`credits: null` means individual details are unavailable, while `credits: []` is a confirmed empty
list. Missing dates remain null. The older `resetExpiry` field remains available. These endpoints
remain read-only and do not redeem resets.

```json
{
  "providerId": "codex",
  "displayName": "Codex",
  "plan": "Plus",
  "lines": [
    {
      "type": "progress",
      "label": "Session",
      "used": 42.0,
      "limit": 100.0,
      "format": { "kind": "percent" },
      "resetsAt": "2026-03-26T13:00:00.161Z",
      "periodDurationMs": 18000000,
      "color": null
    },
    {
      "type": "text",
      "label": "Today",
      "value": "$5.17 \u00b7 9.2M tokens",
      "color": null,
      "subtitle": null
    },
    {
      "type": "barChart",
      "label": "Usage Trend",
      "granularity": "daily",
      "points": [
        {
          "label": "3/25",
          "value": 1200000.0,
          "valueLabel": "1.2M tokens",
          "startAt": "2026-03-25T00:00:00+08:00",
          "modelUsage": [{ "name": "GPT-5.6 Sol", "tokens": 1200000.0 }]
        }
      ],
      "note": "Estimated from local logs",
      "color": null
    },
    {
      "type": "barChart",
      "label": "Today Activity",
      "granularity": "hourly",
      "points": [
        {
          "label": "14:00",
          "value": 420000.0,
          "valueLabel": "420K tokens",
          "startAt": "2026-03-26T14:00:00+08:00",
          "modelUsage": [{ "name": "GPT-5.6 Sol", "tokens": 420000.0 }]
        }
      ],
      "note": "Recorded by local Codex usage events; the current hour may be incomplete.",
      "color": null
    }
  ],
  "fetchedAt": "2026-03-26T11:16:29Z"
}
```

The `lines` array uses the same metric line types as the internal plugin output: `progress`, `text`, `badge`, and `barChart`.

Codex `barChart` lines identify their `daily` or `hourly` granularity. Each point carries a `startAt` timestamp and optional per-model Token totals. Hourly values are assigned to the local hour of the recorded usage event; they are not estimated by dividing a daily total. A long-running request is counted in the hour where its usage event was recorded.

Prompt Usage details are intentionally excluded from this HTTP API because
they can contain local prompt text and project names. They remain available
only inside the One More Prompt desktop interface.

`fetchedAt` is an ISO 8601 timestamp indicating when the snapshot was last successfully fetched.

`iconUrl` is intentionally omitted from the API response to keep payloads small.

## Filtering and Caching Behavior

- The collection endpoint (`/v1/usage`) returns the Codex snapshot when Codex data is available.
- Only **successful** probe results are cached. A failed probe never overwrites a previous successful snapshot.
- Disk writes share the current snapshot and stream it to a buffered temporary file.
  Updates received during a write remain pending for the next write. The cache
  file format is unchanged.
- HTTP responses copy only public usage lines. Private Prompt Usage history is
  excluded before copying the response.
- The single-provider endpoint is intended for `/v1/usage/codex`; unknown IDs return `404`.

## Local Request Boundary

Every request must include exactly one `Host` header naming `127.0.0.1:6736`
or `localhost:6736`. Other hosts, ports, address aliases, and duplicate Host
headers are rejected before usage data is read. Header names are case-insensitive.

Command-line tools do not need an Origin header. For example:

```sh
curl http://127.0.0.1:6736/v1/usage/codex
```

These CLI responses have no CORS headers. When a browser supplies Origin, it must
be exactly one of `http://127.0.0.1:6736`, `http://localhost:6736`,
`http://127.0.0.1`, or `http://localhost`. Only those responses include:

```text
Access-Control-Allow-Origin: <the accepted loopback origin>
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

Other origins, including `null` from local files or sandboxed documents, return
**403 Forbidden** without usage data or allowing CORS headers. Duplicate Origin
headers and malformed requests return **400 Bad Request**. This API has no
remote browser access path; local applications should use the loopback URL.

The server reads complete HTTP/1.0 or HTTP/1.1 request headers before checking
this policy, with a 4 KiB limit and a five-second total read deadline. Oversized
headers return **431 Request Header Fields Too Large**; a read timeout returns
**408 Request Timeout**. It accepts origin-form paths such as `/v1/usage` and
closes the connection after one response. Valid `OPTIONS` requests return
**204 No Content**; allowing CORS headers are included only for accepted origins.

## Error Responses

Error responses use this shape:

```json
{
  "error": "provider_not_found"
}
```

Possible error codes: `provider_not_found`, `not_found`, `method_not_allowed`,
`server_busy`, `bad_request`, `forbidden`, `request_headers_too_large`, and
`request_timeout`.

`server_busy` returns **503 Service Unavailable** when the local API is already handling the maximum number of concurrent connections. Clients should back off and retry later.
