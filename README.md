# Apoko: eigene Hausapotheke

Apoko ist eine Web-App (PWA) fürs Handy. Sie zeigt dir, welche Medikamente du zu Hause hast und wann sie ablaufen. Andere Haushalte, mit denen du dich verbindest, sehen auf Wunsch einzelne Artikel.

## Funktionen

- **Strichcode scannen** mit der Handykamera:
  - **GS1-DataMatrix** (der quadratische Code auf CH/EU-Packungen): füllt GTIN, **Ablaufdatum** und **Charge** automatisch aus.
  - **EAN-13**: füllt die GTIN aus. Bei Schweizer Arzneimitteln (7680…) zeigt die App die Swissmedic-Zulassungsnummer an.
  - Einmal erfasste Produkte merkt sich die App. Beim nächsten Scan derselben Packung sind Name, Wirkstoff, Form usw. schon ausgefüllt.
  - Ohne Kamera kann man den Code auch eintippen.
- **Erfassen**: Name, Wirkstoff, Stärke, Darreichungsform, Packungsgrösse und Restmenge (Stück, ml, g, Dosen …), Ablaufdatum (Monat/Jahr), Lagerort, Person, Charge, Notizen.
- **Ablaufdatum** nur als Monat/Jahr (gilt bis Monatsende), per Live-Kamera, Foto oder DataMatrix-Code.
- **Rezeptpflicht**: Schalter „Rezeptpflichtig“, dazu optional die Schweizer Abgabekategorie (A/B = Rezept, D/E = rezeptfrei).
- **Farben**: grün haltbar, orange bald ablaufend oder seit höchstens 12 Monaten abgelaufen, rot länger abgelaufen.
- **Übersicht und Filter**: abgelaufen / läuft bald ab (unter 90 Tagen) / rezeptpflichtig / rezeptfrei / geteilt / nicht geteilt, dazu eine Volltextsuche.
- **Teilen mit anderen Haushalten**:
  - Pro Artikel wählst du, ob er geteilt wird. Abgelaufene Artikel und private Notizen werden nie geteilt.
  - Beim Teilen von rezeptpflichtigen Medikamenten zeigt die App eine Warnung.
  - Die App erzeugt einen **QR-Code bzw. Link**. Der andere Haushalt scannt bzw. öffnet ihn und ist damit verbunden. Danach kann er suchen: „Wer hat Ibuprofen?“
  - Für einen neuen Stand teilst du einfach noch einmal. Beim Empfänger wird der Eintrag dann aktualisiert.
- **Erfassen**: „+ Erfassen“ öffnet zuerst den Strichcode-Scanner (legt Name, Hersteller, Menge usw. gleich ab), danach automatisch die Fotokamera. Zuerst die wichtigste Seite fotografieren, dann weitere relevante Seiten, dann „Abschliessen“. Das erste Foto wird das Artikelbild. Aus allen Fotos liest die App Strichcode (→ Swissmedic: Name, Hersteller, Menge, Art z. B. pflanzlich, Anwendung) und Text (Menge, Name).
- **KI-Recherche (optional)**: Mit eigenem Claude-API-Schlüssel (Einstellungen) recherchiert Claude anhand der Fotos im Web und ergänzt Hersteller, Art, Menge, „Anwendung (allgemein)“ und eine kurze Produktinfo mit Quellen. Die Fotos gehen dafür an Anthropic; der Schlüssel bleibt auf dem Gerät.
- **Beschwerden**: Beschwerden eintippen oder antippen (z. B. Kopfschmerzen, Durchfall, Insektenstich). Die App zeigt passende, nicht abgelaufene Mittel aus dem Vorrat samt Standort, trennt rezeptpflichtige ab, nennt Warnzeichen („sofort 144 bei …“) und einen Tipp. Ist nichts im Haus, zeigt sie, wonach man in der Apotheke fragen kann und ob ein verbundener Haushalt etwas hat. Zuordnung über den ATC-Code. Ablauf: Beschwerden → „Weiter: Für wen?“ → Person (Mann, Frau, Kind 1, Kind 2 mit Alter und Gewicht, unter Einstellungen anpassbar). Für Kinder gelten Grundregeln: kein Aspirin unter 16, kein Loperamid und Codein unter 12, Erwachsenenstärken werden markiert; rezeptpflichtige Mittel nur für die Person, für die sie verschrieben sind. Keine Diagnose, keine Dosierung.
- **Checkliste**: Grundausstattung einer Hausapotheke, abgeglichen mit deinem Vorrat.
- **Offline-fähig**, ohne Konto und ohne Server. Die Daten bleiben auf dem Gerät. Als Sicherung gibt es Export und Import (JSON).

## Starten

Die Kamera funktioniert nur über **HTTPS** (oder `localhost`).

```bash
npm start            # lokaler Server auf http://localhost:8080
npm test             # Tests für den Strichcode-Parser
```

**Aufs Handy bringen**: Im Repo unter *Settings → Pages → Source: GitHub Actions* einstellen und auf `main` mergen. Die App läuft dann unter `https://<user>.github.io/apoko/`. Auf dem Handy öffnen und „Zum Home-Bildschirm hinzufügen“ wählen.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html`, `css/styles.css` | Oberfläche |
| `js/app.js` | UI-Logik |
| `js/gs1.js` | Strichcode-Parser (GS1 DataMatrix, EAN, Swissmedic) |
| `js/knowledge.js` | Medizinisches Wissen: Darreichungsformen, Abgabekategorien, Checkliste |
| `js/store.js` | Lokale Datenhaltung und Ablauf-Logik |
| `js/share.js` | Teilen-Codes (komprimiert, als Link/QR) |
| `js/scanner.js` | Kamera-Scanner (BarcodeDetector, sonst ZXing) |
| `js/research.js` | KI-Recherche mit Claude (Websuche, strukturierte Rückgabe) |
| `vendor/` | ZXing (Apache-2.0), qrcode-generator (MIT), Tesseract.js (Apache-2.0), Anthropic SDK (MIT) |

## Grenzen / mögliche nächste Schritte

- **Keine automatische Produktdatenbank**: In der Schweiz gibt es keine frei nutzbare Schnittstelle für Medikamentennamen. Der Name wird deshalb beim ersten Mal eingetippt und danach gespeichert. Später ließe sich das z. B. mit der Refdata- oder HCI-Datenbank anbinden (Lizenz nötig).
- **Teilen per Momentaufnahme**: Verbundene Haushalte sehen den Stand des letzten geteilten Codes. Eine Live-Synchronisation bräuchte ein Backend (z. B. Supabase oder Firebase) mit Konten.

> Apoko ist ein Organisationshilfsmittel und ersetzt keine ärztliche oder pharmazeutische Beratung.
