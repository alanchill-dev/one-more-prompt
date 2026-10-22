import type { GuideCopy } from "./copy-types"

export const FR_GUIDE_COPY: GuideCopy = {
  stages: ["Comprendre l’Usage", "Retrouver le Travail", "Comparer les Horaires"],
  steps: [
    { title: "Lire l’Activité d’Aujourd’hui", body: "Commencez par l’usage horaire du jour pour repérer les moments de travail intense.", points: [["Heures", "L’activité du jour, heure par heure"], ["Hauteur", "Tokens utilisés"], ["Couleurs", "Répartition des modèles"]] },
    { title: "Consulter Votre Quota Restant", body: "Ce sont les limites de votre compte Codex, distinctes du graphique d’activité locale au-dessus.", points: [["Session", "Quota restant pour la courte période"], ["Hebdomadaire", "Part du quota hebdomadaire encore disponible"], ["Réinitialisation", "Quand chaque quota se renouvelle"]] },
    { title: "Choisir « 30 Jours »", body: "Passez du jour au mois écoulé pour comparer l’usage quotidien et les modèles." },
    { title: "Essayer « Couleurs des modèles »", body: "Ouvrez la palette en haut à droite, choisissez une case, changez sa couleur puis cliquez sur Appliquer.", points: [["Aperçu Direct", "Le graphique reflète immédiatement le changement"], ["Appliquer", "Conserve les couleurs pendant cet exercice"]] },
    { title: "Passer à « Valorisation API »", body: "Convertissez les mêmes Tokens en montant selon les prix API de chaque modèle.", points: [["Montant estimé", "Pour comparer l’usage, pas une facture réelle"], ["Graphique", "La hauteur indique maintenant la valorisation API"]] },
    { title: "Trouver une Journée à Revoir", body: "La barre la plus haute a la valeur la plus élevée dans le mode actuel du graphique." },
    { title: "Cliquer sur « Projects »", body: "Retrouvez le travail du jour sélectionné." },
    { title: "Trouver les Détails de Gauche à Droite", body: "Choisissez une conversation, puis un Prompt, et consultez ses détails.", points: [["Gauche", "Projets et conversations Session"], ["Centre", "Résumé et Prompts de la conversation choisie"], ["Droite", "Détails du Prompt sélectionné"]] },
    { title: "Sélectionner « {featuredSession} »", body: "Consultez les Prompts de cette conversation." },
    { title: "Projet en Haut, Conversation en Bas", body: "Chaque ligne totalise son historique complet ; la date filtre seulement la liste des Prompts en dessous.", points: [["Project", "Toutes les conversations de ce projet"], ["Session", "Uniquement la conversation sélectionnée"], ["Trois mesures", "Tokens, quota hebdomadaire cumulé et durée"]] },
    { title: "Sélectionner le Prompt de 18M", body: "Il commence par « {featuredPromptLead} »." },
    { title: "Relire Votre Instruction Originale", body: "Lisez le Prompt complet envoyé ou copiez-le pour le réutiliser." },
    { title: "Comprendre le Début et la Durée", body: "Le début est l’heure d’envoi. La durée additionne uniquement le temps actif enregistré.", points: [["Début", "Situe ce Prompt dans le temps"], ["Durée", "Exclut les périodes non enregistrées ou interrompues"]] },
    { title: "Lire l’Usage de ce Prompt", body: "Regardez le total, l’entrée et la sortie. Cache et raisonnement sont déjà compris dedans.", points: [["Total", "Entrée et sortie de tous les agents"], ["Entrée / Cache", "L’entrée inclut déjà les lectures du cache"], ["Sortie / Raisonnement", "La sortie inclut déjà les Tokens de raisonnement"]] },
    { title: "Voir Quels Agents ont Partagé le Travail", body: "Le total au-dessus inclut déjà l’agent principal et les sous-agents. Ne les ajoutez pas à nouveau.", points: [["Main Agent", "55% de l’usage de ce Prompt"], ["Sub Agent", "Deux sous-agents, à 25% et 20%"], ["Parts", "Les trois agents totalisent 100%"]] },
    { title: "Cliquer sur « Chronologie » en Haut", body: "Comparez les conversations du même jour." },
    { title: "Lire la Chronologie de 1 à 4", body: "En haut, choisissez les enregistrements ; en bas, comparez quand chaque conversation s’est déroulée.", points: [["1 Filtres", "Dates, modèles, projets ou recherche d’instructions"], ["2 Carte temporelle", "Le cadre orange indique la plage affichée en dessous"], ["3 Conversations", "Une Session par ligne, avec son projet"], ["4 Marques de Prompt", "Position : heure d’envoi ; hauteur : Tokens utilisés"]] },
    { title: "Glisser le Centre du Cadre à Gauche ou à Droite", body: "Le graphique en dessous suit la plage de temps." },
    { title: "Glisser le Triangle Droit à Gauche ou à Droite", body: "Changez la plage pour agrandir ou réduire le graphique en dessous." },
    { title: "Choisir l’Enregistrement Surligné de « {featuredSession} »", body: "Consultez l’instruction et l’usage de ce Prompt.", points: [["Nombres des groupes", "Plusieurs Prompts"], ["Hauteur des lignes", "Tokens, pas durée"]] },
  ],
  chrome: {
    exit: "Quitter le Guide", skip: "Passer le Guide", close: "Fermer le Guide", retry: "Réessayer Cette Étape", failure: "La zone de cette étape est indisponible. Réessayez ou quittez le guide.", completedTask: "Terminé",
    panKeyboard: "Clavier : cibler la plage, puis ← ou →", zoomKeyboard: "Clavier : cibler la poignée droite, puis ← ou →",
    backToOpening: "Retour à l’Introduction", previous: "Précédent", finish: "Terminer le Guide", continue: "Continuer", next: "Suivant",
    demoMode: "Mode Démonstration", demoDetail: "Pour s’exercer uniquement ; votre espace précédent revient à la sortie", demoAccount: "Compte de Démonstration",
  },
  welcome: {
    kicker: "Guide Interactif", range: "3 Phases · 20 Étapes", title: "De l’Usage au Travail", body: "Pratiquez Vue d’ensemble, Projets et Chronologie avec des exemples. Vos propres enregistrements restent inchangés.",
    stageDetails: ["Lisez graphiques et quotas pour trouver une journée à revoir.", "Reliez conversations et instructions au travail et à l’usage.", "Déplacez-vous et zoomez pour comparer les travaux simultanés."], stepsUnit: "étapes", explore: "Explorer par Moi-même", start: "Commencer le Guide",
  },
  finishCard: { kicker: "3 Phases · Terminées", title: "Guide Terminé", body: "Repérez une période dans Vue d’ensemble, puis les détails dans Projets ou Chronologie. Vous pouvez maintenant retrouver vos propres travaux.", route: ["Comprendre l’Usage", "Retrouver le Travail", "Comparer les Horaires"], returnToWorkspace: "Retour à Mon Espace" },
}
