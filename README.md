# Klassenhelden

Ein spielbarer Browser-Prototyp für ein Schul-RPG: Lehrkräfte belohnen Mitarbeit mit Erfahrungspunkten, Truhen und Heiltränken. Schülerinnen und Schüler gestalten eigene Helden, sammeln Ausrüstung und treten in animierten, rundenbasierten Duellen gegeneinander an.

## Start

Voraussetzung: **Node.js 24 oder neuer** (mit integriertem `node:sqlite`). Keine externen Pakete, Paketinstallation, Datenbankdienste oder Zugangsschlüssel erforderlich.

```sh
cd /workspace/School-Game
npm test
npm start
```

Der Server verwendet Port `3000`. Mit `npm run dev` wird der Server bei Änderungen neu gestartet. In einer eigenen lokalen Umgebung lässt sich die Oberfläche im Browser auf diesem Port öffnen. Die Cloud-Onboarding-Ansicht stellt keine Browser-Vorschau bereit.

## Ausprobieren

Im standardmäßig aktiven Demomodus stehen diese Konten bereit. Alle verwenden das Passwort **`Klassenhelden!2026`**:

| Rolle | E-Mail | Figur |
| --- | --- | --- |
| Lehrkraft | `lehrer@demo.schule` | Frau Weber |
| Schülerin | `lina@demo.schule` | Funkenfuchs |
| Schüler | `ben@demo.schule` | Nebelpfote |

1. Als Lina anmelden und den Trainingsgegner in der Arena herausfordern. Dieser handelt automatisch.
2. Unter **Mein Held** Tierfigur, Farben, Kleidung und Emblem gestalten oder Stärke, Fokus und Ausdauer verbessern.
3. Unter **Inventar** eine Truhe öffnen, Gegenstände vergleichen und ausrüsten. Die Demokonten Lina und Ben erhalten einmalig zwei Truhen, eine kleine Trankflasche und vier Beispielgegenstände, darunter einen doppelten Helm zum Ausprobieren des XP-Tauschs.
4. Als Lehrkraft anmelden und einem Schülerkonto XP und/oder eine Truhe oder einen der drei Heiltränke mit Begründung vergeben.
5. Für ein echtes Schülerduell Lina und Ben in **zwei getrennten Browserprofilen** (z. B. normal und privat) anmelden. Eine Herausforderung senden, auf dem anderen Konto annehmen und abwechselnd Aktionen wählen. Ein zweiter Tab desselben Browserprofils teilt denselben Login.

Die Oberfläche aktualisiert andere Konten und Spielzüge regelmäßig. Neue Registrierungen erhalten ausschließlich die Schülerrolle, keine Lehrerrechte und keine selbst gewählten XP. Alle Konten gehören in dieser Version zur gemeinsamen Demoklasse „Campus Nord“.

## Spielregeln

- Nur Lehrkräfte vergeben Belohnungen: bis zu 100 XP und/oder eine Truhe oder einen Heiltrank je Vergabe. Anlass und Vergabe werden gespeichert.
- **Verfügbare XP** werden für Fähigkeiten ausgegeben; ein Upgrade kostet `aktuelle Stufe × 25 XP`. Maximalstufe einer Fähigkeit: 10.
- **Gesamt-XP** bleiben bei einem Upgrade erhalten und bestimmen die Heldenstufe: `1 + floor(Gesamt-XP / 100)`.
- Stärke verbessert Angriff und Fokusstoß, Fokus verbessert den Fokusstoß, Ausdauer erhöht Lebenspunkte und Regeneration in Deckung.
- Aktionen: Angriff, Fokusstoß, Deckung, Heiltrank. Jede erfolgreiche Aktion beendet den eigenen Zug. Ein Fokusstoß lädt nach zwei anderen eigenen Aktionen wieder auf.
- Deckung reduziert den nächsten Treffer um 55 % und heilt einige LP. Kleine, mittlere und große Heiltränke heilen bis zu **20, 35 bzw. 60 LP** und verbrauchen jeweils einen Gegenstand und einen Zug; bei vollen LP sind sie nicht nutzbar.
- Der Herausforderer beginnt. Fähigkeiten, Ausrüstungsboni und Aussehen werden bei Kampfbeginn festgehalten; spätere Änderungen gelten für das nächste Duell. Vorhandene Duelle aus der ersten Version behalten ihre bisherigen Werte.
- Eigene Einladungen lassen sich zurückziehen. In einem aktiven Duell kann jeder Teilnehmer aufgeben; der Gegner gewinnt dann. Höchstens fünf Duelle können gleichzeitig offen sein.
- Bei 0 LP endet der Kampf. Nach spätestens 30 Runden entscheidet der höhere verbleibende LP-Anteil; bei exaktem Gleichstand gewinnt der Herausforderer.
- Kämpfe und Training vergeben **keine XP oder Gegenstände**. Damit bleiben Belohnungen an die schulische Mitarbeit gebunden.

## Truhen, Inventar und Ausrüstung

Es gibt einen Truhentyp. Jede Truhe enthält mit gleicher Wahrscheinlichkeit **einen oder zwei Funde**. Für jeden Fund wird die Seltenheit unabhängig serverseitig ausgewürfelt. Zu 75 % ist der Fund Ausrüstung und zu 25 % ein Heiltrank. Häufige Trankfunde sind klein, seltene mittel und epische oder legendäre groß. Die Lehrkraft kann die Seltenheit oder den Inhalt nicht auswählen.

| Seltenheit | Chance pro Fund | XP für ein zusätzliches Ausrüstungsstück |
| --- | --- | --- |
| Gewöhnlich | 60 % | 2 XP |
| Selten | 28 % | 4 XP |
| Episch | 10 % | 7 XP |
| Legendär | 2 % | 10 XP |

Der Katalog enthält 48 Ausrüstungsvarianten mit festen, nachvollziehbaren Boni. Sechs Plätze stehen zur Verfügung: **Helm, Brustplatte, Hand 1, Hand 2, Kette und Ring**. Beide Hände können jeweils eine Waffe oder einen Schild tragen. Zwei gleiche Designs sind möglich, benötigen aber zwei tatsächlich vorhandene Exemplare. Dieselbe Instanz kann niemals beide Plätze gleichzeitig belegen.

Ausrüstung verbessert Angriff, Fokus, maximale LP oder Rüstung. Rüstung reduziert Trefferschaden vor der Deckung um höchstens 12 Punkte; jeder Treffer verursacht mindestens einen Schadenspunkt. Farben, Kleidung und Emblem sind rein optisch.

Nur **zusätzliche Exemplare desselben Gegenstands in derselben Seltenheit** lassen sich gegen die kleinen XP-Beträge eintauschen. Ausgerüstete Stücke und das letzte Exemplar bleiben geschützt. Der Tausch erhöht verfügbare und Gesamt-XP; die dafür nötige Ausrüstung stammt aus Lehrertruhen. Heiltränke werden gestapelt und im Kampf verbraucht, nicht eingetauscht.

## Kampfanimationen

Angriff und Fokusstoß zeigen Bewegung, Trefferreaktion und Schadenszahlen; Deckung und Heiltränke haben eigene Effekte. Trainingszüge von Spieler und Gegner werden nacheinander abgespielt. Eine Siegesanimation schließt das Duell ab. Die Animationen ändern keine serverseitig berechneten Kampfwerte und blockieren Eingaben nur während des kurzen Effekts. Die Betriebssystem-/Browser-Einstellung für reduzierte Bewegung wird berücksichtigt.

## Speicherung und Konfiguration

Konten, gehashte Passwörter, Sitzungen, Fähigkeiten, Inventar, Ausrüstung, Charaktergestaltung, Duelle und Vergaben liegen in `.data/klassenhelden.sqlite`. Dieser Ordner ist von Git ausgeschlossen und bleibt bei Neustarts erhalten. Die Beispielkonten werden einmalig angelegt; Fortschritte werden beim Neustart nicht zurückgesetzt. Vorhandene Datenbanken werden beim Start automatisch erweitert. Alte mittlere Heiltränke bleiben erhalten; die Demo-Truhen und Beispielausrüstung werden pro Datenbank nur einmal ergänzt.

### Update unter Windows

1. Den bisherigen Spielserver im schwarzen Fenster mit **Strg+C** stoppen.
2. Die neue ZIP von GitHub herunterladen und in einen **neuen Ordner** entpacken.
3. Für die Übernahme des bisherigen Spielstands den vollständigen Ordner `.data` aus dem alten Projektordner in den neuen kopieren, **bevor** die neue Version erstmals gestartet wird. Den alten Ordner als Sicherung behalten.
4. Im neuen Ordner mit `package.json` die Explorer-Adressleiste anklicken, `cmd` eingeben und mit Enter öffnen. Dort `npm start` ausführen.
5. Im bereits geöffneten Browserfenster **Strg+F5** drücken, damit die neue Oberfläche geladen wird.

Zusätzliche Installationen sind für dieses Update nicht nötig.

| Variable | Standard | Zweck |
| --- | --- | --- |
| `PORT` | `3000` | HTTP-Port |
| `HOST` | `0.0.0.0` | Adresse des HTTP-Servers |
| `DATABASE_PATH` | `.data/klassenhelden.sqlite` im Repository | Alternative SQLite-Datei |
| `DEMO_MODE` | `true` | `false` verhindert Demo-Seeding und öffentliche Registrierung |
| `COOKIE_SECURE` | `false` | Hinter HTTPS auf `true` setzen |

Umgebungsvariablen direkt beim Start übergeben; `.env` wird nicht automatisch geladen. `DEMO_MODE=false` entfernt oder sperrt **keine bereits existierenden Beispielkonten**. Eine echte Schulinstallation braucht eine getrennte Datenbank, kontrollierte Lehrer- und Klasseneinladungen sowie Kontoverwaltung. Diese erste Version ist zum gemeinsamen Entwickeln mit Demodaten gedacht. Die Demo-Zugänge sind öffentlich bekannt.

## Technik und Prüfung

Node-HTTP-Server, SQLite, Vanilla JavaScript und CSS, ohne externe Laufzeitabhängigkeiten. Rollen, Zugfolge, Inventarverbrauch und XP-Ausgaben werden auf dem Server geprüft. Sitzungen verwenden HttpOnly-/SameSite-Cookies; Passwörter werden mit individuellem Salt und scrypt gehasht. JSON-Mutationen von fremden Origins werden abgewiesen.

`npm test` führt die Tests der Kampfregeln, Beuteverteilung, Inventarregeln und HTTP-API aus. API-Tests verwenden eigene Datenbanken und verändern keine lokalen Spielstände. Dazu gehören auch die Migration der ersten Datenbankversion sowie parallele Anfragen, die keine Truhe oder Gegenstände doppelt verbrauchen dürfen.

Wichtige Dateien: `server.js` (HTTP/API), `lib/store.js` (Speicherung/Konten), `lib/items.js` (Gegenstände/Beute), `lib/combat.js` (Kampfregeln), `public/` (Oberfläche und Effekte), `test/` (Tests).
