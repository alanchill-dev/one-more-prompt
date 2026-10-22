import type { GuideCopy } from "./copy-types"

export const ES_GUIDE_COPY: GuideCopy = {
  stages: ["Entender el Uso", "Encontrar Trabajo", "Comparar Horarios"],
  steps: [
    { title: "Leer la Actividad de Hoy", body: "Empieza con el uso por hora de hoy para ver cuándo se concentró el trabajo.", points: [["Horas", "Actividad de hoy, hora a hora"], ["Altura", "Tokens utilizados"], ["Colores", "Composición de modelos"]] },
    { title: "Consultar la Cuota Restante", body: "Estos son los límites de tu cuenta de Codex, distintos del gráfico de actividad local de arriba.", points: [["Sesión", "Cuota restante del período corto"], ["Semanal", "Porción de cuota semanal aún disponible"], ["Reinicio", "Cuándo se renueva cada cuota"]] },
    { title: "Elige «30 Días»", body: "Amplía de hoy al último mes para comparar el uso diario y los modelos." },
    { title: "Prueba «Colores de modelos»", body: "Abre la paleta arriba a la derecha, elige una casilla, cambia su color y pulsa Aplicar.", points: [["Vista Previa", "El gráfico muestra el cambio al instante"], ["Aplicar", "Conserva los colores durante esta práctica"]] },
    { title: "Cambia a «Valoración API»", body: "Convierte los mismos Tokens en dinero usando los precios API de cada modelo.", points: [["Importe estimado", "Sirve para comparar el uso, no es una factura"], ["Gráfico", "La altura pasa a mostrar la valoración API"]] },
    { title: "Encontrar un Día que Revisar", body: "La barra más alta tiene el mayor valor en el modo actual del gráfico." },
    { title: "Pulsa «Projects»", body: "Abre el trabajo del día seleccionado." },
    { title: "Encontrar Detalles de Izquierda a Derecha", body: "Elige una conversación, después un Prompt y consulta sus detalles.", points: [["Izquierda", "Proyectos y conversaciones Session"], ["Centro", "Resumen y Prompts de la conversación elegida"], ["Derecha", "Detalles del Prompt que selecciones"]] },
    { title: "Selecciona «{featuredSession}»", body: "Consulta los Prompts de esta conversación." },
    { title: "Proyecto Arriba, Conversación Abajo", body: "Cada fila suma su historial completo; la fecha solo filtra la lista de Prompts inferior.", points: [["Project", "Todas las conversaciones de este proyecto"], ["Session", "Solo la conversación seleccionada"], ["Tres métricas", "Tokens, cuota semanal acumulada y ejecución"]] },
    { title: "Selecciona el Prompt de 18M", body: "Empieza por «{featuredPromptLead}»." },
    { title: "Revisar la Instrucción Original", body: "Lee el Prompt completo que enviaste o cópialo para volver a utilizarlo." },
    { title: "Cuándo Empezó y Cuánto Duró", body: "El inicio es el momento de envío. La ejecución solo suma tiempo activo registrado.", points: [["Inicio", "Sitúa este Prompt en el tiempo"], ["Ejecución", "Excluye tiempo sin registro o interrumpido"]] },
    { title: "Leer el Uso de Este Prompt", body: "Mira el total, la entrada y la salida. La caché y el razonamiento ya están incluidos.", points: [["Total", "Entrada y salida de todos los agentes"], ["Entrada / Caché", "La entrada ya incluye las lecturas de caché"], ["Salida / Razonamiento", "La salida ya incluye los Tokens de razonamiento"]] },
    { title: "Ver Qué Agentes Compartieron el Trabajo", body: "El total superior ya incluye al agente principal y a los subagentes. No los sumes otra vez.", points: [["Main Agent", "55% del uso de este Prompt"], ["Sub Agent", "Dos subagentes: 25% y 20%"], ["Porcentajes", "Los tres agentes suman el 100%"]] },
    { title: "Pulsa «Cronología» Arriba", body: "Compara conversaciones del mismo día seleccionado." },
    { title: "Leer la Cronología del 1 al 4", body: "Arriba eliges los registros; abajo comparas cuándo ocurrió cada conversación.", points: [["1 Filtros", "Elige fechas, modelos, proyectos o busca instrucciones"], ["2 Mapa temporal", "El marco naranja señala el intervalo de abajo"], ["3 Conversaciones", "Una Session por fila, con su proyecto"], ["4 Marcas de Prompt", "Posición: hora de envío; altura: Tokens utilizados"]] },
    { title: "Arrastra el Centro del Marco a Izquierda o Derecha", body: "El gráfico de abajo sigue el intervalo de tiempo." },
    { title: "Arrastra el Triángulo Derecho a Izquierda o Derecha", body: "Cambia el intervalo para ampliar o reducir el gráfico de abajo." },
    { title: "Selecciona el Registro Resaltado de «{featuredSession}»", body: "Consulta la instrucción y el uso de este Prompt.", points: [["Números de grupo", "Varios Prompts"], ["Altura de la línea", "Tokens, no duración"]] },
  ],
  chrome: {
    exit: "Salir de la Guía", skip: "Omitir Guía", close: "Cerrar la Guía", retry: "Reintentar Este Paso", failure: "No se encuentra el área de este paso. Reinténtalo o sal de la guía.", completedTask: "Completado",
    panKeyboard: "Teclado: enfoca el intervalo y pulsa ← o →", zoomKeyboard: "Teclado: enfoca el control derecho y pulsa ← o →",
    backToOpening: "Volver al Inicio", previous: "Anterior", finish: "Terminar Guía", continue: "Continuar", next: "Siguiente",
    demoMode: "Modo de Demostración", demoDetail: "Solo para practicar; al salir volverás al espacio anterior", demoAccount: "Cuenta de Demostración",
  },
  welcome: {
    kicker: "Guía Interactiva", range: "3 Etapas · 20 Pasos", title: "Del Uso al Trabajo", body: "Practica Resumen, Proyectos y Cronología con datos de ejemplo. Tus registros no se modificarán.",
    stageDetails: ["Lee gráficos y cuotas para encontrar un día que revisar.", "Relaciona conversaciones e instrucciones con su trabajo y uso.", "Desplázate y amplía para comparar trabajos simultáneos."], stepsUnit: "pasos", explore: "Explorar por mi Cuenta", start: "Empezar Guía",
  },
  finishCard: { kicker: "3 Etapas · Completadas", title: "Guía Completada", body: "Encuentra un período en Resumen y consulta los detalles en Proyectos o Cronología. Ya puedes volver a tus registros.", route: ["Entender el Uso", "Encontrar Trabajo", "Comparar Horarios"], returnToWorkspace: "Volver a mi Espacio" },
}
