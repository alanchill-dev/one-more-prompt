<p align="center"><img src="public/icon.png" alt="One More Prompt" width="96" height="96"></p>
<h1 align="center">One More Prompt</h1>
<p align="center"><strong>Comprenez Votre Usage de Codex et Gardez le Fil de Votre Travail.</strong></p>
<p align="center"><a href="README.md">English</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.de.md">Deutsch</a> · <strong>Français</strong></p>

One More Prompt est une application de bureau privilégiant les données locales pour **les limites Codex, l’activité des Tokens et l’historique des prompts**. Retrouvez le projet, la conversation et le prompt à l’origine d’un pic sans envoyer votre historique à un service d’analyse.

<p align="center"><img src="assets/brand/hero.png" alt="One More Prompt — Demo Data" width="100%"></p>

<details>
<summary>Découvrir L’Espace De Travail</summary>

![Projets, Prompts Et Utilisation Des Agents](assets/brand/projects-demo.png)

![Chronologie D’Une Journée Complète De Démonstration](assets/brand/timeline-demo.png)

![Mode D’Estimation API](assets/brand/api-valuation-demo.png)

![Aperçu Des Couleurs Des Modèles](assets/brand/palette-demo.png)

</details>

## État de la Version

> v1.0.0 est la première version publique stable pour macOS (Apple Silicon) et Windows (x64).

[GitHub](https://github.com/alanchill-dev/one-more-prompt) · [macOS / Windows](https://github.com/alanchill-dev/one-more-prompt/releases) · [Notes de version](docs/release-notes/v1.0.0.fr.md)

## Fonctionnalités

- **Consulter Vos Limites.** Affichez les limites du compte, les heures de réinitialisation et le quota restant dans la barre des menus ou la zone de notification.
- **Comprendre Votre Activité.** Commencez par Aujourd’hui, comparez les périodes, personnalisez les couleurs des modèles et alternez entre Tokens et estimation API. Les estimations et les calculs de prix suivent la devise choisie. Ces montants servent de repère et ne sont pas une facture.
- **Retrouver le Travail Derrière un Chiffre.** Parcourez Projets → Sessions → Prompts pour lire les instructions originales et la contribution des agents, ou retrouvez les mêmes données dans la chronologie. Un `>` devant une durée signale un total incomplet.
- **Garder l’Essentiel à Portée de Main.** Épinglez projets et conversations même en changeant de date. Les fichiers ordinaires et les archives `.jsonl.zst` partagent les mêmes calculs et possibilités de navigation.
- **Apprendre Sans Risque.** Choisissez la langue sur le premier écran de configuration : elle reste enregistrée pour la configuration, l’espace de travail et le guide facultatif. Les projets, conversations, prompts et agents de démonstration sont traduits dans les neuf langues. Revoir le guide et revérifier Codex sont deux actions séparées.
- **Rester à Jour.** Vérifiez les versions stables automatiquement ; la vérification manuelle dans les réglages reste toujours accessible. L’icône avec un point, immédiatement à gauche des réglages, apparaît uniquement lorsqu’une version stable plus récente pour votre plateforme est confirmée. Vous choisissez quand télécharger et remplacer l’application.

## Télécharger et Démarrer

- **macOS · Apple Silicon:** Ouvrez le DMG Apple Silicon signé et notarié par Apple, glissez **One More Prompt.app** dans Applications, puis lancez-la.
- **Windows · x64:** Téléchargez le ZIP portable Windows x64 non signé, extrayez **tout le dossier**, puis lancez `one-more-prompt.exe`. Gardez les fichiers associés ensemble.

Windows nécessite [Microsoft WebView2](https://developer.microsoft.com/microsoft-edge/webview2/#download-section). SmartScreen ou une politique d’entreprise peut avertir ou bloquer les applications non signées. Aucun paquet Linux, Mac Intel ou Windows ARM natif n’est fourni.

Connectez-vous à Codex avec sa configuration locale standard. Les données existantes sont détectées sans clé API ni copie manuelle des identifiants. Le premier écran propose les neuf langues ci-dessus, avec l’anglais sélectionné initialement. Vous pouvez ensuite modifier la langue enregistrée dans les réglages.

## Mises à Jour

L’application consulte la dernière version stable de GitHub au lancement puis, lorsque l’intervalle de six heures arrive à échéance, tant qu’elle est visible ou à votre retour dans l’application. La vérification manuelle dans les réglages est immédiate, sans envoyer d’identifiants Codex ni d’historique de prompts. Téléchargez le paquet, quittez l’application et remplacez l’app ou tout le dossier Windows. Les préférences et données locales restent dans l’emplacement habituel de l’utilisateur. Il n’y a ni installation automatique ni flux de mise à jour. Consultez [l’aide aux mises à jour](docs/updates.md).

## Locale par Conception

Les prompts, noms de projets et sessions et la navigation restent sur votre ordinateur. L’actualisation des quotas utilise vos identifiants locaux Codex auprès d’OpenAI ; les vérifications de version contactent GitHub anonymement. L’API locale en lecture seule écoute uniquement sur `127.0.0.1:6736` et exclut les détails des prompts. Aucune télémétrie d’installation n’est collectée.

## Documentation

- [Premiers pas](docs/getting-started.md)
- [Données et authentification Codex](docs/providers/codex.md)
- [Mises à jour](docs/updates.md)
- [API HTTP locale](docs/local-http-api.md)
- [Alertes d’usage](docs/notifications.md)
- [Configuration du proxy](docs/proxy.md)
- [Journaux de diagnostic](docs/capture-logs.md)
- [Guide de publication](docs/releasing.md)

## Compiler Depuis les Sources

Bun et une chaîne d’outils Rust sont nécessaires. macOS requiert Xcode Command Line Tools ; Windows, Visual Studio C++ Build Tools et WebView2. La compilation et les tests sont locaux ; GitHub Actions n’est pas utilisé.

```sh
bun install
bun run bundle:plugins
bun run test --run
cargo test --locked --manifest-path src-tauri/Cargo.toml
bun run build
bun run tauri dev
```

Consultez [Contribuer](CONTRIBUTING.md) pour les vérifications et le [guide de publication](docs/releasing.md) pour les DMG signés et notariés et les ZIP Windows. Ce dépôt intègre **uniquement Codex**. Linux est prévu.

## Assistance et Licence

Consultez [Assistance](SUPPORT.md) pour les problèmes et suggestions, et [Sécurité](SECURITY.md) pour les vulnérabilités. One More Prompt est indépendant et n’est pas un produit officiel d’OpenAI. Il est distribué sous [licence MIT](LICENSE) ; les mentions obligatoires de tiers sont conservées dans [NOTICE](NOTICE) et [Marques et attribution](TRADEMARK.md).
