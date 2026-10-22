import type { GuideCopy } from "./copy-types"

export const PT_BR_GUIDE_COPY: GuideCopy = {
  stages: ["Entender o Uso", "Encontrar o Trabalho", "Comparar Horários"],
  steps: [
    { title: "Ler a Atividade de Hoje", body: "Comece pelo uso por hora de hoje para ver quando o trabalho se concentrou.", points: [["Horas", "Atividade de hoje, hora a hora"], ["Altura", "Tokens utilizados"], ["Cores", "Composição de modelos"]] },
    { title: "Consultar a Cota Restante", body: "Estes são os limites da sua conta Codex, diferentes do gráfico de atividade local acima.", points: [["Sessão", "Cota restante no período curto"], ["Semanal", "Parcela da cota semanal ainda disponível"], ["Redefinição", "Quando cada cota é renovada"]] },
    { title: "Escolha “30 Dias”", body: "Amplie de hoje para o último mês e compare o uso diário e os modelos." },
    { title: "Experimente “Cores dos modelos”", body: "Abra a paleta no canto superior direito, escolha uma posição, mude a cor e clique em Aplicar.", points: [["Prévia ao Vivo", "O gráfico mostra a mudança imediatamente"], ["Aplicar", "Mantém as cores durante esta prática"]] },
    { title: "Mude Para “Valor de API”", body: "Converta os mesmos Tokens em dinheiro usando os preços de API de cada modelo.", points: [["Valor estimado", "Serve para comparar o uso, não é uma fatura"], ["Gráfico", "A altura passa a mostrar o valor de API"]] },
    { title: "Encontrar um Dia Para Rever", body: "A barra mais alta tem o maior valor no modo atual do gráfico." },
    { title: "Clique em “Projects”", body: "Abra o trabalho do dia selecionado." },
    { title: "Encontrar Detalhes da Esquerda Para a Direita", body: "Escolha uma conversa, depois um Prompt e veja seus detalhes.", points: [["Esquerda", "Projetos e conversas Session"], ["Centro", "Resumo e Prompts da conversa escolhida"], ["Direita", "Detalhes do Prompt selecionado"]] },
    { title: "Selecione “{featuredSession}”", body: "Veja os Prompts desta conversa." },
    { title: "Projeto Acima, Conversa Abaixo", body: "Cada linha soma seu histórico completo; a data filtra apenas a lista de Prompts abaixo.", points: [["Project", "Todas as conversas deste projeto"], ["Session", "Somente a conversa selecionada"], ["Três métricas", "Tokens, cota semanal acumulada e execução"]] },
    { title: "Selecione o Prompt de 18M", body: "Ele começa com “{featuredPromptLead}”." },
    { title: "Rever a Instrução Original", body: "Leia o Prompt completo que enviou ou copie para usar novamente." },
    { title: "Quando Começou e Quanto Durou", body: "O início é o momento do envio. A execução soma apenas o tempo ativo registrado.", points: [["Início", "Situa este Prompt no tempo"], ["Execução", "Exclui períodos sem registro ou interrompidos"]] },
    { title: "Ler o Uso Deste Prompt", body: "Veja o total, a entrada e a saída. Cache e raciocínio já estão incluídos neles.", points: [["Total", "Entrada mais saída de todos os agentes"], ["Entrada / Cache", "A entrada já inclui as leituras de cache"], ["Saída / Raciocínio", "A saída já inclui os Tokens de raciocínio"]] },
    { title: "Ver Quais Agentes Compartilharam o Trabalho", body: "O total acima já inclui o agente principal e os subagentes. Não some novamente.", points: [["Main Agent", "55% do uso deste Prompt"], ["Sub Agent", "Dois subagentes: 25% e 20%"], ["Participação", "Os três agentes somam 100%"]] },
    { title: "Clique em “Linha do Tempo” Acima", body: "Compare conversas do mesmo dia selecionado." },
    { title: "Ler a Linha do Tempo de 1 a 4", body: "Acima você escolhe os registros; abaixo compara quando cada conversa ocorreu.", points: [["1 Filtros", "Escolha datas, modelos, projetos ou busque instruções"], ["2 Mapa temporal", "O quadro laranja marca o intervalo mostrado abaixo"], ["3 Conversas", "Uma Session por linha, com seu projeto"], ["4 Marcas de Prompt", "Posição: envio; altura: uso de Tokens"]] },
    { title: "Arraste o Centro do Quadro Para os Lados", body: "O gráfico abaixo acompanha o intervalo de tempo." },
    { title: "Arraste o Triângulo Direito Para os Lados", body: "Mude o intervalo para ampliar ou reduzir o gráfico abaixo." },
    { title: "Selecione o Registro Destacado de “{featuredSession}”", body: "Veja a instrução e o uso deste Prompt.", points: [["Números de grupo", "Vários Prompts"], ["Altura da linha", "Tokens, não duração"]] },
  ],
  chrome: {
    exit: "Sair do Guia", skip: "Pular Guia", close: "Fechar Guia", retry: "Tentar Este Passo Novamente", failure: "A área deste passo não está disponível. Tente novamente ou saia do guia.", completedTask: "Concluído",
    panKeyboard: "Teclado: foque o intervalo e pressione ← ou →", zoomKeyboard: "Teclado: foque a alça direita e pressione ← ou →",
    backToOpening: "Voltar ao Início", previous: "Anterior", finish: "Concluir Guia", continue: "Continuar", next: "Próximo",
    demoMode: "Modo de Demonstração", demoDetail: "Apenas para praticar; o espaço anterior será restaurado ao sair", demoAccount: "Conta de Demonstração",
  },
  welcome: {
    kicker: "Guia Interativo", range: "3 Etapas · 20 Passos", title: "Do Uso ao Trabalho", body: "Pratique Visão Geral, Projetos e Linha do Tempo com dados de exemplo. Seus registros não serão alterados.",
    stageDetails: ["Leia gráficos e cotas para encontrar um dia que vale rever.", "Relacione conversas e instruções ao trabalho e ao uso.", "Mova e amplie para comparar trabalhos no mesmo horário."], stepsUnit: "passos", explore: "Explorar por Conta Própria", start: "Iniciar Guia",
  },
  finishCard: { kicker: "3 Etapas · Concluídas", title: "Guia Concluído", body: "Encontre um período na Visão Geral e veja detalhes em Projetos ou na Linha do Tempo. Agora volte aos seus registros de trabalho.", route: ["Entender o Uso", "Encontrar o Trabalho", "Comparar Horários"], returnToWorkspace: "Voltar ao Meu Espaço" },
}
