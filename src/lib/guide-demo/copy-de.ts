import type { GuideCopy } from "./copy-types"

export const DE_GUIDE_COPY: GuideCopy = {
  stages: ["Nutzung Verstehen", "Arbeit Finden", "Zeiten Vergleichen"],
  steps: [
    { title: "Die Heutige Aktivität Lesen", body: "Sieh dir die heutige Nutzung pro Stunde an, um konzentrierte Arbeitszeiten zu erkennen.", points: [["Stunden", "Heutige Aktivität Stunde für Stunde"], ["Höhe", "Verwendete Tokens"], ["Farben", "Modellanteile"]] },
    { title: "Dein Restkontingent Prüfen", body: "Hier stehen die Limits deines Codex-Kontos, getrennt vom lokalen Aktivitätsdiagramm oben.", points: [["Sitzung", "Restkontingent im kurzen Zeitfenster"], ["Wöchentlich", "Noch verfügbarer Anteil des Wochenkontingents"], ["Rücksetzzeit", "Wann das jeweilige Kontingent erneuert wird"]] },
    { title: "„30 Tage“ Wählen", body: "Erweitere heute auf den letzten Monat und vergleiche tägliche Nutzung und Modellanteile." },
    { title: "„Modellfarben“ Ausprobieren", body: "Öffne die Palette oben rechts, wähle einen Farbplatz, ändere die Farbe und klicke auf Anwenden.", points: [["Live-Vorschau", "Änderungen erscheinen sofort im Diagramm"], ["Anwenden", "Behält die Farben für diese Übung"]] },
    { title: "Zu „API-Bewertung“ Wechseln", body: "Rechne dieselben Tokens mit den API-Preisen der Modelle in Geldbeträge um.", points: [["Schätzbetrag", "Zum Nutzungsvergleich, keine echte Rechnung"], ["Diagramm", "Die Balkenhöhe zeigt nun die API-Bewertung"]] },
    { title: "Einen Interessanten Tag Finden", body: "Der höchste Balken hat im aktuellen Diagrammmodus den größten Wert." },
    { title: "„Projects“ Anklicken", body: "Öffne die Arbeit des gewählten Tages." },
    { title: "Details Von Links Nach Rechts Finden", body: "Wähle eine Unterhaltung, dann einen Prompt und lies seine Details.", points: [["Links", "Projekte und Session-Unterhaltungen"], ["Mitte", "Zusammenfassung und Prompts der gewählten Unterhaltung"], ["Rechts", "Details des ausgewählten Prompts"]] },
    { title: "„{featuredSession}“ Auswählen", body: "Sieh die Prompts dieser Unterhaltung." },
    { title: "Oben Das Projekt, Unten Die Unterhaltung", body: "Jede Zeile summiert ihren ganzen Verlauf. Das Datum filtert nur die Prompt-Liste darunter.", points: [["Project", "Alle Unterhaltungen dieses Projekts"], ["Session", "Nur die ausgewählte Unterhaltung"], ["Drei Werte", "Tokens, kumuliertes Wochenkontingent und Laufzeit"]] },
    { title: "Den 18M-Prompt Auswählen", body: "Er beginnt mit „{featuredPromptLead}“." },
    { title: "Die Ursprüngliche Anweisung Nachlesen", body: "Lies den vollständig gesendeten Prompt oder kopiere ihn zur erneuten Verwendung." },
    { title: "Beginn Und Laufzeit Verstehen", body: "Der Beginn ist die Sendezeit. Die Laufzeit summiert nur aufgezeichnete aktive Zeit.", points: [["Beginn", "Der Zeitpunkt dieses Prompts"], ["Laufzeit", "Nicht erfasste oder unterbrochene Zeit zählt nicht"]] },
    { title: "Die Nutzung Dieses Prompts Lesen", body: "Prüfe Gesamtmenge, Eingabe und Ausgabe. Cache und Reasoning sind bereits darin enthalten.", points: [["Gesamtmenge", "Eingabe plus Ausgabe aller Agenten"], ["Eingabe / Cache", "Die Eingabe enthält bereits Cache-Lesezugriffe"], ["Ausgabe / Reasoning", "Die Ausgabe enthält bereits Reasoning-Tokens"]] },
    { title: "Die Beteiligten Agenten Verstehen", body: "Haupt- und Unteragenten sind in der Gesamtmenge oben bereits enthalten. Nicht nochmals addieren.", points: [["Main Agent", "55% der Nutzung dieses Prompts"], ["Sub Agent", "Zwei Unteragenten mit 25% und 20%"], ["Anteile", "Alle drei Agenten ergeben zusammen 100%"]] },
    { title: "Oben „Zeitleiste“ Anklicken", body: "Vergleiche Unterhaltungen am selben gewählten Tag." },
    { title: "Die Zeitleiste Von 1 Bis 4 Lesen", body: "Oben wählst du die Einträge. Darunter vergleichst du, wann jede Unterhaltung stattfand.", points: [["1 Filter", "Datum, Modelle, Projekte oder Anweisungen suchen"], ["2 Zeitkarte", "Der orange Rahmen markiert den unten sichtbaren Zeitraum"], ["3 Unterhaltungen", "Eine Session pro Zeile mit ihrem Projekt"], ["4 Prompt-Markierungen", "Position: Sendezeit; Höhe: Token-Nutzung"]] },
    { title: "Die Rahmenmitte Nach Links Oder Rechts Ziehen", body: "Das Diagramm darunter folgt dem Zeitraum." },
    { title: "Das Rechte Dreieck Nach Links Oder Rechts Ziehen", body: "Ändere den Zeitraum, um das Diagramm darunter zu vergrößern oder zu verkleinern." },
    { title: "Den Markierten Eintrag In „{featuredSession}“ Wählen", body: "Sieh Anweisung und Nutzung dieses Prompts.", points: [["Gruppenzahlen", "Mehrere Prompts"], ["Linienhöhe", "Tokens, nicht Laufzeit"]] },
  ],
  chrome: {
    exit: "Einführung Verlassen", skip: "Einführung Überspringen", close: "Einführung Schließen", retry: "Schritt Wiederholen", failure: "Der Zielbereich dieses Schritts ist nicht verfügbar. Versuche es erneut oder beende die Einführung.", completedTask: "Erledigt",
    panKeyboard: "Tastatur: Bereich fokussieren, dann ← oder →", zoomKeyboard: "Tastatur: rechten Griff fokussieren, dann ← oder →",
    backToOpening: "Zur Einführung", previous: "Zurück", finish: "Einführung Beenden", continue: "Weiter", next: "Weiter",
    demoMode: "Demomodus", demoDetail: "Nur zum Üben; beim Beenden erscheint dein vorheriger Arbeitsbereich", demoAccount: "Demokonto",
  },
  welcome: {
    kicker: "Interaktive Einführung", range: "3 Abschnitte · 20 Schritte", title: "Von der Nutzung zur Arbeit", body: "Übe Übersicht, Projekte und Zeitleiste mit Beispieldaten. Deine eigenen Einträge werden nicht verändert.",
    stageDetails: ["Diagramme und Kontingente lesen und einen interessanten Tag finden.", "Unterhaltungen und Anweisungen mit Arbeit und Nutzung verbinden.", "Verschieben und zoomen, um gleichzeitige Arbeit zu vergleichen."], stepsUnit: "Schritte", explore: "Selbst Erkunden", start: "Einführung Starten",
  },
  finishCard: { kicker: "3 Abschnitte · Abgeschlossen", title: "Einführung Abgeschlossen", body: "Finde einen Zeitraum in der Übersicht und Details in Projekten oder der Zeitleiste. Jetzt kannst du zu deinen eigenen Arbeitseinträgen zurückkehren.", route: ["Nutzung Verstehen", "Arbeit Finden", "Zeiten Vergleichen"], returnToWorkspace: "Zu Meinem Arbeitsbereich" },
}
