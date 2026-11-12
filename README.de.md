# Target Copy

> **Sprache: Deutsch · [Switch to English →](README.md)**
> [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md)

Target Copy kopiert eine Obsidian-Auswahl oder Notiz in einem Format, das zum
gewählten Ziel passt. Die Umwandlung erfolgt vollständig lokal in Obsidian.

Die Entstehung und den Einsatzkontext beschreibt die
[Produktgeschichte zu Target Copy (Chinesisch)](https://blog.tanjialin.com/posts/68421).

## Unterstützte Ziele

Google Docs, Microsoft Word / WPS, Notion, Slack, E-Mail, WeChat Official
Account, portables Markdown und Nur-Text. Rich-Text-Ziele schreiben HTML und
Nur-Text, sodass die empfangende Anwendung die passende Darstellung auswählen kann.

In den Einstellungen lassen sich nur die tatsächlich benötigten Ziele
aktivieren. Alle anderen verschwinden aus Auswahl und Befehlspalette. Die
Oberfläche folgt auf Wunsch der Systemsprache oder verwendet English,
简体中文, 繁體中文, 日本語 oder Deutsch. Nicht unterstützte Systemsprachen
verwenden Englisch.

In den Kontextmenüs des Editors und der Dateien öffnet **Für ein Ziel
kopieren…** beim Darüberfahren ein Untermenü mit den aktivierten Zielen. Ein
Ziel wird direkt beim Auswählen kopiert. Über das Menüband und die
Befehlspalette ist die vollständige Zielauswahl verfügbar.

In den Einstellungen können Originalquelltext und HTML-Quelltext aktiviert werden. Originalquelltext kopiert die Auswahl im Editor oder ganze Markdown-/HTML-Dateien exakt. Inhalte der Leseansicht lassen sich in Markdown umwandeln. Einfache Tabellen behalten Links, Bilder und Hervorhebungen; verbundene Zellen, SVG, Audio und Video behalten ihre HTML-Struktur. HTML in Codeblöcken bleibt Code. Markdown bewahrt Texthervorhebungen mit Inline-`<mark>`-Elementen. Obsidian-Links erfordern Zugriff auf den ursprünglichen Vault. Der Zieleditor bestimmt die Link-Unterstützung; Google Docs übernimmt möglicherweise nur Text und Formatierung. Die Klartextdarstellung enthält die vollständige Linkadresse.

## Kopieren und erweiterte Einstellungen

Die Zielauswahl zeigt den Umfang (Auswahl oder ganzes Dokument), das Quellformat
und das Zwischenablageformat der Ziele. Die Reihenfolge bleibt fest; das zuletzt
verwendete Ziel wird markiert.

Unter **Einstellungen → Target Copy** lassen sich
aktive Ziele anordnen und Titel, interne Links sowie lokale Bildeinbettung pro
Ziel einstellen. Jede Option kann die allgemeine Einstellung übernehmen.
Die Anzahl und Verschachtelungstiefe eingebetteter Notizen sind mit `0` standardmäßig
unbegrenzt. Zirkuläre oder nicht auflösbare Verweise bleiben in der Ausgabe stehen
und erscheinen in den Kopierdetails.

Bei einer Editorauswahl werden benötigte Referenzlink- und Fußnotendefinitionen
übernommen. Originalquelltext kopiert den ausgewählten Text exakt.
Längere Umwandlungen können per Schaltfläche oder Befehl abgebrochen werden.
Die Kopierdetails zeigen sämtliche Kompatibilitätshinweise des letzten erfolgreichen
Kopiervorgangs. Fortschritts- und Kompatibilitätsmeldungen lassen sich getrennt einstellen.

## Manuell installieren

1. Das Release-ZIP entpacken.
2. „Vault/.obsidian/plugins/target-copy/“ anlegen.
3. main.js, manifest.json und styles.css in diesen Ordner kopieren.
4. Obsidian neu laden und Target Copy unter „Einstellungen → Community Plugins“
   aktivieren.

Version 1.0.2 ist für Obsidian Desktop ausgelegt. YAML, Kommentare,
Links, Formeln, alle Codeblöcke, SVG-/Canvas-Markup und ursprüngliche Bilddaten
bleiben erhalten; das äußere Format wird an das gewählte Ziel angepasst.
Wikilinks werden standardmäßig zu anklickbaren Obsidian-Links. In den
Einstellungen kann alternativ die `[[Quellsyntax]]` oder nur der Anzeigename gewählt werden.

## Open Source

Der vollständige Quellcode, Tests, Übersetzungen, öffentliche Dokumentation,
Build-Skripte und die öffentliche CI-Konfiguration stehen unter der
[MIT-Lizenz](LICENSE). Die Erweiterung arbeitet als vollständiges lokales Modul
in Obsidian. Hinweise zur
Mitarbeit stehen in [CONTRIBUTING.md](CONTRIBUTING.md); Sicherheitsprobleme
sollten gemäß [SECURITY.md](SECURITY.md) vertraulich gemeldet werden.
