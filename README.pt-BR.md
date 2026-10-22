<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/brand/logo-light.svg">
    <img src="assets/brand/logo-light.svg" alt="One More Prompt" width="96" height="96">
  </picture>
</p>
<h1 align="center">One More Prompt</h1>
<p align="center"><strong>Entenda Seu Uso do Codex e Mantenha o Trabalho à Vista.</strong></p>
<p align="center"><a href="README.md">English</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <strong>Português (Brasil)</strong> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a></p>

One More Prompt é um aplicativo de desktop que prioriza dados locais para **limites do Codex, atividade de Tokens e histórico de prompts**. Vá de um pico de uso ao projeto, à conversa e ao prompt original sem enviar seu histórico a um serviço de análise.

<p align="center"><img src="assets/brand/hero.png" alt="One More Prompt — Demo Data" width="100%"></p>

<details>
<summary>Conheça O Espaço De Trabalho</summary>

![Projetos, Prompts E Uso Dos Agentes](assets/brand/projects-demo.png)

![Linha Do Tempo De Um Dia Completo De Demonstração](assets/brand/timeline-demo.png)

![Modo De Estimativa API](assets/brand/api-valuation-demo.png)

![Prévia Das Cores Dos Modelos](assets/brand/palette-demo.png)

</details>

## Status da Versão

> v1.0.0 é a primeira versão pública estável para macOS (Apple Silicon) e Windows (x64).

[GitHub](https://github.com/alanchill-dev/one-more-prompt) · [macOS / Windows](https://github.com/alanchill-dev/one-more-prompt/releases) · [Notas da versão](docs/release-notes/v1.0.0.pt-BR.md)

## O Que Você Pode Fazer

- **Veja Seus Limites.** Consulte limites da conta, horários de redefinição e cota restante na barra de menus ou na bandeja do sistema.
- **Entenda Sua Atividade.** Comece por Hoje, compare períodos, personalize as cores dos modelos e alterne entre Tokens e estimativa de API. As estimativas e os cálculos de preços seguem a moeda escolhida; são uma referência de uso, não uma fatura.
- **Encontre o Trabalho por Trás dos Números.** Explore Projetos → Sessões → Prompts para ler instruções originais e contribuições de agentes, ou veja os mesmos registros na linha do tempo. Um `>` antes da duração indica um total incompleto.
- **Mantenha o Importante por Perto.** Fixe projetos e conversas mesmo ao mudar de data. Registros comuns e compactados em `.jsonl.zst` usam os mesmos cálculos e recursos de navegação.
- **Aprenda sem Risco.** Escolha o idioma na primeira tela de configuração: ele é mantido na configuração, no espaço de trabalho e no guia opcional. Projetos, conversas, prompts e agentes de demonstração estão traduzidos para os nove idiomas. Rever o guia e verificar o Codex novamente são ações independentes.
- **Saiba das Novidades.** Verifique versões estáveis automaticamente; a verificação manual em Configurações está sempre disponível. O ícone com um ponto, imediatamente à esquerda de Configurações, só aparece após confirmar uma versão estável mais recente para sua plataforma. Você decide quando baixar e substituir o app.

## Baixar e Começar

- **macOS · Apple Silicon:** Abra o DMG para Apple Silicon assinado e notarizado pela Apple, arraste **One More Prompt.app** para Aplicativos e inicie o app.
- **Windows · x64:** Baixe o ZIP portátil Windows x64 sem assinatura, extraia **a pasta inteira** e execute `one-more-prompt.exe`. Mantenha todos os arquivos juntos.

O Windows precisa do [Microsoft WebView2](https://developer.microsoft.com/microsoft-edge/webview2/#download-section). O SmartScreen ou políticas corporativas podem alertar ou bloquear apps sem assinatura. Não há pacotes para Linux, Mac Intel ou Windows ARM nativo.

Para instalar ou executar o app, basta baixar o DMG ou o ZIP. [SHA256SUMS.txt](https://github.com/alanchill-dev/one-more-prompt/releases/download/v1.0.0/SHA256SUMS.txt) contém hashes para a verificação opcional da integridade do download; não é um instalador nem uma assinatura digital.

Entre no Codex com a configuração local padrão. O app encontra os registros existentes sem chave de API nem cópia manual de credenciais. A primeira tela oferece os nove idiomas acima, com inglês selecionado inicialmente. Você pode alterar o idioma salvo em Configurações.

## Atualizações

O app consulta a versão estável mais recente do GitHub ao iniciar e, depois, quando o intervalo de seis horas vence com a janela visível ou quando você retorna ao app. Verificar atualizações em Configurações faz a consulta imediatamente, sem enviar credenciais do Codex nem histórico de prompts. Baixe o pacote, encerre o app e substitua o aplicativo ou a pasta completa do Windows. Preferências e dados locais permanecem no local habitual do usuário. Não há instalação automática nem feed de atualizador. Consulte a [ajuda de atualização](docs/updates.md).

## Local por Princípio

Prompts, nomes de projetos e sessões e a navegação ficam no computador. A atualização de cota usa as credenciais locais do Codex para acessar a OpenAI; a consulta de versões acessa o GitHub anonimamente. A API local somente leitura escuta em `127.0.0.1:6736` e exclui detalhes de prompts. Não há telemetria de instalação.

## Documentação

- [Primeiros passos](docs/getting-started.md)
- [Dados e autenticação do Codex](docs/providers/codex.md)
- [Atualizações](docs/updates.md)
- [API HTTP local](docs/local-http-api.md)
- [Alertas de uso](docs/notifications.md)
- [Configuração de proxy](docs/proxy.md)
- [Logs de diagnóstico](docs/capture-logs.md)
- [Guia de publicação](docs/releasing.md)

## Compilar a Partir do Código

É preciso ter Bun e Rust. No macOS, instale Xcode Command Line Tools; no Windows, Visual Studio C++ Build Tools e WebView2. Compilação e testes são locais; GitHub Actions não é usado.

```sh
bun install
bun run bundle:plugins
bun run test --run
cargo test --locked --manifest-path src-tauri/Cargo.toml
bun run build
bun run tauri dev
```

Consulte [Contribuição](CONTRIBUTING.md) para verificações e o [guia de publicação](docs/releasing.md) para DMGs assinados e notarizados e ZIPs de Windows. Este repositório integra **somente o Codex**. Linux está nos planos.

## Suporte e Licença

Consulte [Suporte](SUPPORT.md) para erros e sugestões e [Segurança](SECURITY.md) para vulnerabilidades. One More Prompt é independente e não é um produto oficial da OpenAI. É distribuído sob a [licença MIT](LICENSE); os avisos obrigatórios de terceiros são preservados em [NOTICE](NOTICE) e [Marcas e atribuição](TRADEMARK.md).
