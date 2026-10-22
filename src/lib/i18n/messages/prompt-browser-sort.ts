const en = {
  "promptUsage.sortTokens": "Most Tokens",
  "promptUsage.sortName": "Name",
  "promptUsage.sortRecentDescription": "Latest activity first",
  "promptUsage.sortPromptsDescription": "Highest prompt count first",
  "promptUsage.sortTokensDescription": "Highest recorded Token usage first",
  "promptUsage.sortNameDescription": "Project and session names in order",
  "promptUsage.sortCodexDescription": "Follow the recorded Codex sidebar order",
} as const

type SortMessages = { [K in keyof typeof en]: string }
const translated = (values: string[]): SortMessages => Object.fromEntries(Object.keys(en).map((key, index) => [key, values[index]])) as SortMessages
export const PROMPT_BROWSER_SORT_MESSAGES = {
  en,
  "zh-TW": translated(["Token 最多", "名稱", "最近有活動的排在前面", "依提示詞數量由多至少", "依已記錄的 Token 用量由多至少", "依專案與工作階段名稱排列", "沿用已記錄的 Codex 側邊欄順序"]),
  "zh-CN": translated(["Token 最多", "名称", "最近有活动的排在前面", "按提示词数量从多到少", "按已记录的 Token 用量从多到少", "按项目与会话名称排列", "沿用已记录的 Codex 侧边栏顺序"]),
  ja: translated(["Token が多い順", "名前順", "最近のアクティビティを先に表示", "プロンプト数が多い順に表示", "記録された Token 使用量が多い順", "プロジェクトとセッションを名前順に表示", "記録された Codex サイドバーの順序"]),
  ko: translated(["Token 많은 순", "이름순", "최근 활동을 먼저 표시", "프롬프트 수가 많은 순서", "기록된 Token 사용량이 많은 순서", "프로젝트 및 세션 이름순", "기록된 Codex 사이드바 순서"]),
  es: translated(["Más Tokens", "Nombre", "Actividad más reciente primero", "Mayor cantidad de prompts primero", "Mayor uso registrado de Tokens primero", "Proyectos y sesiones por nombre", "Orden registrado de la barra lateral de Codex"]),
  "pt-BR": translated(["Mais Tokens", "Nome", "Atividade mais recente primeiro", "Maior quantidade de prompts primeiro", "Maior uso registrado de Tokens primeiro", "Projetos e sessões por nome", "Ordem registrada da barra lateral do Codex"]),
  de: translated(["Meiste Tokens", "Name", "Neueste Aktivität zuerst", "Höchste Prompt-Anzahl zuerst", "Höchster erfasster Token-Verbrauch zuerst", "Projekte und Sitzungen nach Namen", "Erfasste Reihenfolge der Codex-Seitenleiste"]),
  fr: translated(["Plus De Tokens", "Nom", "Activité la plus récente en premier", "Nombre de prompts décroissant", "Utilisation enregistrée des Tokens décroissante", "Projets et sessions par nom", "Ordre enregistré de la barre latérale Codex"]),
} as const
