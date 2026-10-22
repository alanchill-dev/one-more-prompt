<p align="center"><img src="public/icon.png" alt="One More Prompt" width="96" height="96"></p>
<h1 align="center">One More Prompt</h1>
<p align="center"><strong>Codex-Nutzung Verstehen und Die Arbeit Im Blick Behalten.</strong></p>
<p align="center"><a href="README.md">English</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <strong>Deutsch</strong> · <a href="README.fr.md">Français</a></p>

One More Prompt ist eine lokal ausgerichtete Desktop-App für **Codex-Kontolimits, Token-Aktivität und Prompt-Verlauf**. Von einer Nutzungsspitze gelangen Sie zum Projekt, zur Unterhaltung und zum ursprünglichen Prompt, ohne den Verlauf an einen Analysedienst zu senden.

<p align="center"><img src="assets/brand/hero.png" alt="One More Prompt — Demo Data" width="100%"></p>

<details>
<summary>Arbeitsbereich Ansehen</summary>

![Projekte, Prompts Und Agentennutzung](assets/brand/projects-demo.png)

![Zeitleiste Eines Vollständigen Beispieltags](assets/brand/timeline-demo.png)

![API-Schätzmodus](assets/brand/api-valuation-demo.png)

![Vorschau Eigener Modellfarben](assets/brand/palette-demo.png)

</details>

## Veröffentlichungsstatus

> v1.0.0 ist die erste stabile öffentliche Version für macOS (Apple Silicon) und Windows (x64).

[GitHub](https://github.com/alanchill-dev/one-more-prompt) · [macOS / Windows](https://github.com/alanchill-dev/one-more-prompt/releases) · [Versionshinweise](docs/release-notes/v1.0.0.de.md)

## Funktionen

- **Limits Schnell Prüfen.** Kontolimits, Rücksetzzeiten und verbleibendes Kontingent direkt in Menüleiste oder Infobereich ansehen.
- **Aktivität Verstehen.** Mit Heute beginnen, Zeiträume vergleichen, Modellfarben anpassen und zwischen Tokens und API-Schätzung wechseln. Schätzwerte und Preisberechnungen verwenden Ihre gewählte Währung. Sie dienen dem Vergleich und sind keine Rechnung.
- **Die Arbeit Hinter Der Zahl Finden.** Projekte → Sitzungen → Prompts durchsuchen, ursprüngliche Anweisungen und Agentenbeiträge lesen oder dieselben Einträge auf der Zeitleiste ansehen. Ein `>` vor einer Dauer kennzeichnet eine unvollständige Gesamtdauer.
- **Wichtiges Anheften.** Projekte und Unterhaltungen bleiben auch beim Datumswechsel angeheftet. Normale und komprimierte `.jsonl.zst`-Einträge verwenden dieselbe Berechnung und Navigation.
- **Gefahrlos Lernen.** Wählen Sie die Sprache auf dem ersten Einrichtungsbildschirm. Die Wahl bleibt für Einrichtung, Arbeitsbereich und optionale Anleitung gespeichert. Demo-Projekte, Gespräche, Prompts und Agenten sind in allen neun Sprachen verfügbar. Anleitung erneut ansehen und Codex erneut prüfen sind getrennte Aktionen.
- **Aktuell Bleiben.** Stabile Versionen automatisch prüfen; die manuelle Prüfung in den Einstellungen bleibt jederzeit verfügbar. Das Symbol mit einem Punkt direkt links neben Einstellungen erscheint erst, wenn eine neuere stabile Version für Ihre Plattform bestätigt ist. Download und Austausch erfolgen zu Ihrem gewählten Zeitpunkt.

## Herunterladen und Starten

- **macOS · Apple Silicon:** Das signierte und von Apple notarisierte Apple-Silicon-DMG öffnen, **One More Prompt.app** in Programme ziehen und starten.
- **Windows · x64:** Das unsignierte portable Windows-x64-ZIP herunterladen, den **gesamten Ordner** entpacken und `one-more-prompt.exe` starten. Alle zugehörigen Dateien zusammenhalten.

Windows benötigt [Microsoft WebView2](https://developer.microsoft.com/microsoft-edge/webview2/#download-section). SmartScreen oder Unternehmensrichtlinien können vor unsignierten Apps warnen oder sie blockieren. Linux-, Intel-Mac- und native Windows-ARM-Pakete sind nicht enthalten.

Mit der üblichen lokalen Codex-Konfiguration anmelden. Vorhandene Einträge werden ohne API-Schlüssel oder manuelles Kopieren von Zugangsdaten gefunden. Der erste Einrichtungsbildschirm bietet alle neun Sprachen oben an; zunächst ist Englisch ausgewählt. Die gespeicherte Sprache lässt sich später in den Einstellungen ändern.

## Updates

Die App prüft beim Start die neueste stabile GitHub-Version und danach bei Fälligkeit des Sechs-Stunden-Intervalls, solange sie sichtbar ist, oder bei der Rückkehr zur App. Die manuelle Update-Prüfung in den Einstellungen erfolgt sofort, ohne Codex-Zugangsdaten oder Prompt-Verlauf zu senden. Paket herunterladen, App beenden und die App beziehungsweise den gesamten Windows-Ordner ersetzen. Einstellungen und lokale Daten bleiben im üblichen Benutzerdatenordner erhalten. Es gibt keine automatische Installation und keinen Updater-Feed. Siehe [Update-Hilfe](docs/updates.md).

## Lokal Konzipiert

Prompts, Projekt- und Sitzungsnamen sowie die Navigation bleiben auf Ihrem Computer. Kontingentabfragen nutzen vorhandene lokale Codex-Zugangsdaten bei OpenAI. Versionsabfragen kontaktieren GitHub anonym. Die schreibgeschützte lokale API bindet nur an `127.0.0.1:6736` und enthält keine Prompt-Details. Es gibt keine Installationstelemetrie.

## Dokumentation

- [Erste Schritte](docs/getting-started.md)
- [Codex-Daten und Anmeldung](docs/providers/codex.md)
- [Updates](docs/updates.md)
- [Lokale HTTP-API](docs/local-http-api.md)
- [Nutzungshinweise](docs/notifications.md)
- [Proxy-Konfiguration](docs/proxy.md)
- [Diagnoseprotokolle](docs/capture-logs.md)
- [Release-Anleitung](docs/releasing.md)

## Aus Dem Quellcode Bauen

Bun und eine Rust-Toolchain werden benötigt. macOS erfordert Xcode Command Line Tools, Windows Visual Studio C++ Build Tools und WebView2. Builds und Tests laufen lokal; GitHub Actions wird nicht verwendet.

```sh
bun install
bun run bundle:plugins
bun run test --run
cargo test --locked --manifest-path src-tauri/Cargo.toml
bun run build
bun run tauri dev
```

Prüfungen stehen unter [Mitwirken](CONTRIBUTING.md), signierte/notarisierte macOS-DMGs und Windows-ZIPs in der [Release-Anleitung](docs/releasing.md). Dieses Repository integriert **ausschließlich Codex**. Linux ist geplant.

## Support und Lizenz

Bei Fehlern und Vorschlägen hilft [Support](SUPPORT.md), bei Schwachstellen die [Sicherheitsrichtlinie](SECURITY.md). One More Prompt wird unabhängig gepflegt und ist kein offizielles OpenAI-Produkt. Es gilt die [MIT-Lizenz](LICENSE); erforderliche Urheberrechts- und Herkunftshinweise bleiben in [NOTICE](NOTICE) und [Marken und Namensnennung](TRADEMARK.md) erhalten.
