<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/brand/logo-light.svg">
    <img src="assets/brand/logo-light.svg" alt="One More Prompt" width="96" height="96">
  </picture>
</p>
<h1 align="center">One More Prompt</h1>
<p align="center"><strong>Comprende Tu Uso de Codex y Mantén Tu Trabajo a la Vista.</strong></p>
<p align="center"><a href="README.md">English</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <strong>Español</strong> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a></p>

One More Prompt es una aplicación de escritorio con prioridad local para **límites de Codex, actividad de Tokens e historial de prompts**. Pasa de un pico de uso a su proyecto, conversación y prompt original sin subir tu historial a un servicio de análisis.

<p align="center"><img src="assets/brand/hero.png" alt="One More Prompt — Demo Data" width="100%"></p>

<details>
<summary>Explorar El Espacio De Trabajo</summary>

![Proyectos, Prompts Y Uso De Agentes](assets/brand/projects-demo.png)

![Cronología De Un Día Completo De Demostración](assets/brand/timeline-demo.png)

![Modo De Valoración API](assets/brand/api-valuation-demo.png)

![Vista Previa De Colores De Modelos](assets/brand/palette-demo.png)

</details>

## Estado de la Versión

> v1.0.0 es la primera versión pública estable para macOS (Apple Silicon) y Windows (x64).

[GitHub](https://github.com/alanchill-dev/one-more-prompt) · [macOS / Windows](https://github.com/alanchill-dev/one-more-prompt/releases) · [Notas de la versión](docs/release-notes/v1.0.0.es.md)

## Qué Puedes Hacer

- **Consulta Tus Límites.** Revisa los límites de cuenta, los reinicios y la cuota restante desde la barra de menús o la bandeja del sistema.
- **Entiende Tu Actividad.** Empieza por Hoy, compara períodos, personaliza los colores de modelos y alterna entre Tokens y valoración de API. Las estimaciones y el cálculo de precios siguen tu moneda elegida; sirven para comparar uso y no son una factura.
- **Encuentra el Trabajo Tras Cada Cifra.** Explora Proyectos → Sesiones → Prompts para leer instrucciones originales y aportes de agentes, o consulta los mismos registros en la línea de tiempo. Un `>` antes de la duración indica un total incompleto.
- **Ten Cerca lo Importante.** Fija proyectos y conversaciones incluso al cambiar de fecha. Los registros normales y los comprimidos `.jsonl.zst` comparten cálculo y navegación.
- **Aprende sin Riesgo.** Elige el idioma en la primera pantalla de configuración: se conserva en la configuración, el espacio de trabajo y la guía opcional. Los proyectos, conversaciones, prompts y agentes de demostración están traducidos a los nueve idiomas. Repetir la guía y volver a comprobar Codex son acciones separadas.
- **Mantente al Día.** Busca versiones estables automáticamente; la comprobación manual en Ajustes siempre está disponible. El icono con un punto, justo a la izquierda de Ajustes, solo aparece al confirmar una versión estable más reciente para tu plataforma. Tú decides cuándo descargarla y sustituir la aplicación.

## Descarga y Primeros Pasos

- **macOS · Apple Silicon:** Abre el DMG para Apple Silicon firmado y notarizado por Apple, arrastra **One More Prompt.app** a Aplicaciones y ejecútalo.
- **Windows · x64:** Descarga el ZIP portátil Windows x64 sin firma, extrae **toda la carpeta** y ejecuta `one-more-prompt.exe`. Mantén juntos todos sus archivos.

Windows necesita [Microsoft WebView2](https://developer.microsoft.com/microsoft-edge/webview2/#download-section). SmartScreen o las políticas de empresa pueden advertir o bloquear aplicaciones sin firma. No se incluyen paquetes para Linux, Mac Intel ni Windows ARM nativo.

Para instalar o ejecutar la aplicación, solo necesitas el DMG o el ZIP. [SHA256SUMS.txt](https://github.com/alanchill-dev/one-more-prompt/releases/download/v1.0.0/SHA256SUMS.txt) contiene hashes para comprobar opcionalmente la integridad de la descarga; no es un instalador ni una firma digital.

Inicia sesión en Codex con su configuración local estándar. Los registros existentes se detectan sin API key ni copia manual de credenciales. La primera pantalla ofrece los nueve idiomas de arriba, con inglés seleccionado inicialmente. Puedes cambiar el idioma guardado en Ajustes.

## Actualizaciones

La aplicación consulta la última versión estable de GitHub al iniciar y, después, cuando vence el intervalo de seis horas mientras está visible o cuando vuelves a ella. Buscar actualizaciones en Ajustes lo comprueba al instante, sin enviar credenciales de Codex ni historial de prompts. Descarga el paquete, cierra la aplicación y sustituye la app o toda la carpeta de Windows. Las preferencias y los datos locales permanecen en la ubicación habitual del usuario. No hay instalación automática ni feed de actualizador. Consulta la [ayuda de actualizaciones](docs/updates.md).

## Local por Diseño

Los prompts, nombres de proyectos y sesiones, y la navegación permanecen en tu equipo. La actualización de cuota contacta con OpenAI usando tus credenciales locales de Codex; la comprobación de versiones contacta con GitHub de forma anónima. La API local de solo lectura escucha en `127.0.0.1:6736` y excluye los detalles de prompts. No se recopila telemetría de instalación.

## Documentación

- [Primeros pasos](docs/getting-started.md)
- [Datos y autenticación de Codex](docs/providers/codex.md)
- [Actualizaciones](docs/updates.md)
- [API HTTP local](docs/local-http-api.md)
- [Avisos de uso](docs/notifications.md)
- [Configuración de proxy](docs/proxy.md)
- [Registros de diagnóstico](docs/capture-logs.md)
- [Guía de publicación](docs/releasing.md)

## Compilar Desde el Código

Necesitas Bun y Rust. macOS requiere Xcode Command Line Tools; Windows, Visual Studio C++ Build Tools y WebView2. La compilación y las pruebas son locales; no se utiliza GitHub Actions.

```sh
bun install
bun run bundle:plugins
bun run test --run
cargo test --locked --manifest-path src-tauri/Cargo.toml
bun run build
bun run tauri dev
```

Consulta [Contribuir](CONTRIBUTING.md) para las pruebas y la [guía de publicación](docs/releasing.md) para los DMG firmados y notarizados y los ZIP de Windows. Este repositorio integra **solo Codex**. Linux está previsto.

## Soporte y Licencia

Consulta [Soporte](SUPPORT.md) para errores y propuestas y [Seguridad](SECURITY.md) para vulnerabilidades. One More Prompt es independiente y no es un producto oficial de OpenAI. Se distribuye con [licencia MIT](LICENSE); los avisos obligatorios de terceros se conservan en [NOTICE](NOTICE) y [Marcas y atribución](TRADEMARK.md).
