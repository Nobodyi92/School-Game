# Klassenhelden

Ein erster spielbarer Browser-Prototyp für ein Schul-RPG: Lehrkräfte belohnen Mitarbeit mit Erfahrungspunkten und Heiltränken. Schülerinnen und Schüler entwickeln eigene Helden und treten in rundenbasierten Duellen gegeneinander an.

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
2. Den Heldennamen und Avatar ändern oder Stärke, Fokus und Ausdauer verbessern.
3. Als Lehrkraft anmelden und einem Schülerkonto XP und/oder einen Heiltrank mit Begründung vergeben.
4. Für ein echtes Schülerduell Lina und Ben in **zwei getrennten Browserprofilen** (z. B. normal und privat) anmelden. Eine Herausforderung senden, auf dem anderen Konto annehmen und abwechselnd Aktionen wählen. Ein zweiter Tab desselben Browserprofils teilt denselben Login.

Die Oberfläche aktualisiert andere Konten und Spielzüge regelmäßig. Neue Registrierungen erhalten ausschließlich die Schülerrolle, keine Lehrerrechte und keine selbst gewählten XP. Alle Konten gehören in dieser Version zur gemeinsamen Demoklasse „Campus Nord“.

## Spielregeln

- Nur Lehrkräfte vergeben Belohnungen: bis zu 100 XP und/oder einen Heiltrank je Vergabe. Anlass und Vergabe werden gespeichert.
- **Verfügbare XP** werden für Fähigkeiten ausgegeben; ein Upgrade kostet `aktuelle Stufe × 25 XP`. Maximalstufe einer Fähigkeit: 10.
- **Gesamt-XP** bleiben bei einem Upgrade erhalten und bestimmen die Heldenstufe: `1 + floor(Gesamt-XP / 100)`.
- Stärke verbessert Angriff und Fokusstoß, Fokus verbessert den Fokusstoß, Ausdauer erhöht Lebenspunkte und Regeneration in Deckung.
- Aktionen: Angriff, Fokusstoß, Deckung, Heiltrank. Jede erfolgreiche Aktion beendet den eigenen Zug. Ein Fokusstoß lädt nach zwei anderen eigenen Aktionen wieder auf.
- Deckung reduziert den nächsten Treffer um 55 % und heilt einige LP. Ein Trank heilt bis zu 35 LP und verbraucht einen Gegenstand; bei vollen LP ist er nicht nutzbar.
- Der Herausforderer beginnt. Fähigkeiten werden bei Kampfbeginn festgehalten; spätere Upgrades gelten für das nächste Duell.
- Eigene Einladungen lassen sich zurückziehen. In einem aktiven Duell kann jeder Teilnehmer aufgeben; der Gegner gewinnt dann. Höchstens fünf Duelle können gleichzeitig offen sein.
- Bei 0 LP endet der Kampf. Nach spätestens 30 Runden entscheidet der höhere verbleibende LP-Anteil; bei exaktem Gleichstand gewinnt der Herausforderer.
- Kämpfe und Training vergeben **keine XP oder Gegenstände**. Damit bleiben Belohnungen an die schulische Mitarbeit gebunden.

## Speicherung und Konfiguration

Konten, gehashte Passwörter, Sitzungen, Fähigkeiten, Inventar, Duelle und Vergaben liegen in `.data/klassenhelden.sqlite`. Dieser Ordner ist von Git ausgeschlossen und bleibt bei Neustarts erhalten. Die Beispielkonten werden einmalig angelegt; Fortschritte werden beim Neustart nicht zurückgesetzt.

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

`npm test` führt die Tests der Kampfregeln und der HTTP-API aus. API-Tests verwenden eigene Datenbanken und verändern keine lokalen Spielstände.

Wichtige Dateien: `server.js` (HTTP/API), `lib/store.js` (Speicherung/Konten), `lib/combat.js` (Kampfregeln), `public/` (Oberfläche), `test/` (Tests).
