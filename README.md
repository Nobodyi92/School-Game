# Klassenhelden

Ein spielbarer Browser-Prototyp für ein Schul-RPG: Lehrkräfte belohnen Mitarbeit mit Erfahrungspunkten, Truhen und Heiltränken. Schülerinnen und Schüler gestalten eigene 3D-Helden aus den Völkern von Aetheria, sammeln Ausrüstung und treten in animierten, rundenbasierten Duellen gegeneinander an. Version **0.9** ergänzt sechs Ausrüstungskollektionen und sechs Begleiter aus Aetheria. Die durchgängige, moderne Oberfläche bleibt im Stil von Aetheria mit dunklen Flächen, gut lesbaren Texten und türkisfarbenen, violetten und goldenen Akzenten. Eine interaktive **Weltkarte von Aetheria** führt zu den Abenteuern und stellt die Orte der Spielwelt vor. Sechs Völker mit unterschiedlichen Start-Skills ersetzen die spielbaren Tiere. Neben dem **Turm der Prüfungen** und dem Gruppenboss **Runengolem** gibt es seit Version **0.5** die **wandelnde Insel** als Solo-Expedition mit Weggabelungen, Rätseln und überraschenden Begegnungen.

## Start

Voraussetzung: **Node.js 24 oder neuer** (mit integriertem `node:sqlite`). Keine zusätzliche Paketinstallation, Datenbankdienste oder Zugangsschlüssel erforderlich. Die für die 3D-Darstellung benötigte Three.js-Version liegt bereits im Projekt.

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
6. Unter **Abenteuer** öffnet sich die Weltkarte. **Zephyrath** auf der Karte oder in der Ortsliste wählen und über **Turm der Prüfungen** allein einen Aufstieg beginnen. Nach einer gewonnenen Etage die Funde sichern oder mit einem Turmsegen weiterspielen. Den ersten Begleiter gibt es nach abgeschlossener Etage 2, sobald die Funde gesichert werden.
7. Für **Abenteuer → Kristallminen → Runengolem** drei getrennte Schülerkonten verwenden: Lina, Ben und ein über **Schüleraccount erstellen** neu registriertes Demokonto. Es wird kein drittes Schülerkonto automatisch angelegt. Drei unabhängige Browserprofile oder Geräte verwenden, etwa Edge, Chrome und ein Edge-InPrivate-Fenster. In einem Konto eine Gruppe eröffnen, in den anderen beiden beitreten und als Gruppenleitung starten.
8. Unter **Abenteuer → Wandelnde Insel** den Ort auf der Karte oder in der Liste wählen und eine Solo-Reise beginnen. Wähle an den Weggabelungen zwischen verschiedenen Begegnungen. Nach drei bzw. fünf abgeschlossenen Stationen lassen sich neue kosmetische Funde sichern; die siebte Station führt zum Gezeitenwächter.
9. Unter **Sammlung** freigeschaltete Begleiter und Outfits auswählen sowie die verdienten Trophäen ansehen.

Die Oberfläche aktualisiert andere Konten und Spielzüge regelmäßig. Neue Registrierungen erhalten ausschließlich die Schülerrolle, keine Lehrerrechte und keine selbst gewählten XP. Alle Konten gehören in dieser Version zur gemeinsamen Demoklasse „Campus Nord“.

## Spielregeln

- Nur Lehrkräfte vergeben Belohnungen: bis zu 100 XP und/oder eine Truhe oder einen Heiltrank je Vergabe. Anlass und Vergabe werden gespeichert.
- **Verfügbare XP** werden für Fähigkeiten ausgegeben; ein Upgrade kostet `(bereits gekaufte Stufen dieses Skills + 1) × 25 XP`, unabhängig vom Volk. Maximalstufe einer Fähigkeit: 10.
- **Gesamt-XP** bleiben bei einem Upgrade erhalten und bestimmen die Heldenstufe: `1 + floor(Gesamt-XP / 100)`.
- Stärke verbessert Angriff und Fokusstoß, Fokus verbessert den Fokusstoß, Ausdauer erhöht Lebenspunkte und Regeneration in Deckung.
- Aktionen: Angriff, Fokusstoß, Deckung, Heiltrank. Jede erfolgreiche Aktion beendet den eigenen Zug. Ein Fokusstoß lädt nach zwei anderen eigenen Aktionen wieder auf.
- Deckung reduziert den nächsten Treffer um 55 % und heilt einige LP. Kleine, mittlere und große Heiltränke heilen bis zu **20, 35 bzw. 60 LP** und verbrauchen jeweils einen Gegenstand und einen Zug; bei vollen LP sind sie nicht nutzbar.
- Der Herausforderer beginnt. Fähigkeiten, Ausrüstungsboni und Aussehen werden bei Kampfbeginn festgehalten; spätere Änderungen gelten für das nächste Duell. Vorhandene Duelle aus der ersten Version behalten ihre bisherigen Werte.
- Eigene Einladungen lassen sich zurückziehen. In einem aktiven Duell kann jeder Teilnehmer aufgeben; der Gegner gewinnt dann. Höchstens fünf Duelle können gleichzeitig offen sein.
- Bei 0 LP endet der Kampf. Nach spätestens 30 Runden entscheidet der höhere verbleibende LP-Anteil; bei exaktem Gleichstand gewinnt der Herausforderer.
- Schülerduelle und Training vergeben **keine XP oder Gegenstände**. Turm, Insel und Runengolem vergeben ausschließlich kosmetische Begleiter, Outfits und Trophäen. XP und Ausrüstungstruhen bleiben Lehrerbelohnungen.

## Oberfläche im Stil von Aetheria

[Vorschau der neuen Oberfläche](docs/aetheria-oberflaeche.png)

Anmeldung, Schüler- und Lehrerbereich, Charaktergestaltung, Inventar, Arena, Abenteuer und Sammlung verwenden ein gemeinsames Design. Die leuchtenden Farben des Ätherstroms ergänzen dunkle, ruhige Flächen. Die Startseite zeigt die Weltkarte als Reiseübersicht und den aktuellen Fortschritt in Turm, Inselreise und Runengolemgruppe. Von dort führen direkte Schaltflächen zur Weltkarte und zur Arena.

Formulare, Ortsauswahl und Ausrüstungsplätze bleiben auf dem iPad und schmalen Bildschirmen bedienbar. Aktive, ausgewählte und gesperrte Zustände werden weiterhin mit Texten oder Symbolen gekennzeichnet. Eine aktivierte Einstellung für reduzierte Bewegung wird berücksichtigt. Alle Schriftarten und Grafikdateien werden lokal verwendet; zusätzliche Installationen sind nicht erforderlich. Spielstände, Rollen, Belohnungen und Kampfregeln funktionieren wie bisher.

## Die Weltkarte von Aetheria

Unter **Abenteuer** ist die Weltkarte der Einstieg. Das Kartenbild übernimmt den freigegebenen Entwurf mit seinen Städten und Landschaften; die kleinen weißen Richtungspfeile im Ätherstrom wurden entfernt. Alle elf benannten Orte sind per Kartenmarkierung oder Ortsliste auswählbar. Die Liste bleibt auch dann verwendbar, wenn ein Browser das Bild nicht laden kann.

Der **Ätherstrom** entspringt am höchsten Berg im Norden bei Nebelheim und zieht als langes, polarlichtartiges Lichtband **durch die Luft über dem Festland** bis in die Wüste im Süden. Luftschiffe können nur innerhalb dieses Stroms fliegen. Himmelsruhe ist eine bewegliche Luftschiffflotte; die wandelnde Insel und kleinere schwebende Felsen treiben ebenfalls im Strom. Die festen Städte stehen auf dem Land.

| Ort | Auf der Karte |
| --- | --- |
| Zephyria | Stadt der Ätheringenieure in den nördlichen Bergen |
| Nebelheim | Stadt der Wolkenhüter am höchsten Berg |
| Kristallminen | Alter Mineneingang am Berg; Zugang zum Gruppenabenteuer **Runengolem** |
| Himmelsruhe | Luftschiffflotte der Luftnomaden im Ätherstrom |
| Silberwind | Stadt der Ätherelfen in den Baumkronen |
| Lysara | Handelsstadt der grünen Ebene |
| Ätherhain | Druidenstadt in den südlichen Nebelwäldern |
| Äthkern | Hauptstadt der Ätherdämmerer in der Wüste |
| Zephyrath | Alter Turm an der östlichen Steilküste; Zugang zum **Turm der Prüfungen** |
| Lyrianas Licht | Verfallener Leuchtturm an der Westküste |
| Wandelnde Insel | Im Ätherstrom treibender Ort; Zugang zur **Solo-Inselreise** |

Beim Auswählen erscheint eine Ortsbeschreibung. Die drei Abenteuerorte zeigen außerdem den bisherigen Fortschritt oder den Gruppenstatus und führen zum jeweiligen Abenteuer. Erst die dortigen Startschaltflächen beginnen einen neuen Versuch oder eröffnen eine Gruppe. Laufende Abenteuer lassen sich von der Karte aus wieder aufrufen. Die anderen acht Orte stellen die Welt vor und starten keine zusätzlichen Kämpfe.

Mit **Vergrößern**, **Verkleinern** und **Zurücksetzen** lässt sich die Karte erkunden. Vergrößerte Karten können per Touch oder Maus verschoben werden; die Ortsliste bietet eine Alternative für kleine Displays und die Tastatur. **Zur Weltkarte** führt aus jedem Abenteuer zurück. Die bisherigen drei Abenteuer-Reiter bleiben als direkter Zugang erhalten. Eine aktivierte Einstellung für reduzierte Bewegung wird berücksichtigt.

Das Öffnen und Erkunden der Karte verändert keine XP, Gegenstände, Freischaltungen oder Kampfwerte. Die bisherigen Spielstände und Abenteuerregeln bleiben erhalten; zusätzliche Pakete werden für das Update nicht benötigt. Die Karte und ihre Module werden vom Spielserver lokal ausgeliefert.

## Die Völker von Aetheria

Bei der Registrierung und unter **Mein Held** stehen sechs Völker aus dem Aetheria-Konzept zur Wahl. Jedes bringt insgesamt sechs Start-Skillstufen mit:

| Volk | Stärke | Fokus | Ausdauer | Kampfstil |
| --- | ---: | ---: | ---: | --- |
| Ätherelfen | 1 | 4 | 1 | Starke Fokus-Attacken |
| Ätheringenieure | 3 | 1 | 2 | Normale Angriffe und Ausdauer |
| Wolkenhüter | 1 | 2 | 3 | Viele Lebenspunkte, Schutz und etwas Fokus |
| Luftnomaden | 2 | 2 | 2 | Ausgeglichen |
| Ätherdruiden | 1 | 3 | 2 | Fokus-Attacken, Ausdauer und Heilung in Deckung |
| Ätherdämmerer | 4 | 1 | 1 | Besonders starke normale Angriffe |

Die Figuren unterscheiden sich auch optisch: Elfenohren und Kristallschmuck, Ingenieursbrillen und Werkzeuge, Wolkenhaar, Reiseschals, Blattkronen oder sandfarbene Haut mit schimmerndem dunklem Haar. Farbe, Outfit und Wappen sowie alle sechs Ausrüstungsplätze und kosmetischen Begleiter bleiben verwendbar. Tierische Gegner und Begleiter bleiben erhalten.

Ein Volkswechsel ist jederzeit möglich. Er kostet keine XP und verschiebt nur die Startwerte. Gekaufte Skillstufen werden zusätzlich angerechnet; über Stufe 10 hinausgehende Stufen bleiben gespeichert und werden bei einem passenden Volkswechsel wieder wirksam. Der Preis weiterer Upgrades hängt von den gekauften Stufen ab und lässt sich durch Volkswechsel nicht senken. Laufende Duelle, Turmaufstiege, Inselreisen und gestartete Bosskämpfe behalten ihre Werte und ihr Volk vom Start.

Beim ersten Start des Updates werden bestehende Schülerfiguren automatisch zugeordnet: Fuchs → Luftnomaden, Eule → Ätherelfen, Drache → Ätherdruiden, Katze → Ätherdämmerer. Anschließend lässt sich das Volk frei ändern. Pro bisherigem Skill bleiben alle Stufen über der früheren Startstufe 1 als gekaufte Stufen erhalten. Namen, XP, Inventar, Ausrüstung und Sammlung bleiben bestehen. Bereits gespeicherte Kämpfe erhalten die neue Figur, behalten aber ihre damaligen Kampfwerte. Die Umstellung wird nicht erneut angewendet.

## Die wandelnde Insel

Die Insel ist eine allein spielbare Expedition über **sieben Stationen**. Bei jeder neuen Reise werden Reihenfolge und Ausgestaltung der Weggabelungen neu ausgewürfelt. Du wählst zwischen Rätseln, Kämpfen, Lagerplätzen, Inselfunden und besonderen Begegnungen. Die letzte Station ist immer der **Gezeitenwächter**.

- **Rätsel:** Zahlenfolgen, Muschelwaagen und Zeichenmuster. Eine richtige Lösung bringt zwei Sternsplitter und bis zu sechs LP. Ein Fehler kostet acht LP, versperrt aber nicht den weiteren Weg.
- **Begegnungen:** Auf der Windbrücke gibt es einen sicheren Weg oder einen Sprung mit ausdrücklich angezeigtem 50-Prozent-Risiko. Bei Händlern können Splitter gegen Heilung oder Reisefähigkeiten getauscht werden. Einer gestrandeten Späherin lässt sich auf unterschiedliche Weise helfen.
- **Lager und Inselfunde:** Entscheide zwischen Heilung, Splittern und einem Windsegen. Jeder Halt kann nur einmal genutzt werden.
- **Kämpfe:** Gegner kündigen ihre nächste Aktion an. Angriff, Fokus, Deckung und eine Notquelle mit 20 LP stehen zur Verfügung. Die Notquelle ist einmal pro Kampf nutzbar und verbraucht keinen Inventartrank. Nach einem Sieg wählst du zwischen zwei angebotenen Reisefähigkeiten.

Reisefähigkeiten verändern nur den laufenden Versuch: **Doppelblitz** löst bei jedem zweiten normalen Angriff einen zusätzlichen Treffer aus; **Spiegelschild** wirft bei einem abgewehrten Treffer Schaden zurück. **Wurzelkraft**, **Windklinge** und **Gezeitenquelle** verstärken oder heilen den Helden. LP bleiben zwischen den Stationen erhalten. Sternsplitter dienen nur als Vorräte für diese Reise; sie lassen sich nicht gegen Konto-XP, Truhen oder Ausrüstung tauschen.

Nach abgeschlossenen Stationen kannst du außerhalb eines Kampfes oder einer offenen Begegnung **Funde sichern und zurückkehren**. Das ist auch während der Wahl eines Windsegens möglich. Nach Station 3 warten die Begleiter **Gezeitengeist** und **Äthertauflinker**, nach Station 5 das Outfit **Inselwanderer** und der **Ätherblütenfalter**. Beim Sieg über den Wächter auf Station 7 werden sämtliche Funde und die Trophäe **Kompass der Insel** automatisch gesichert. Eine Niederlage oder Aufgabe verliert nur noch ungesicherte Funde dieses Versuchs. Bereits freigeschaltete Kosmetik, Konto-XP, Ausrüstung und Tränke bleiben erhalten.

Die Reise einschließlich unbeantworteter Rätsel bleibt bei Schließen der Seite oder Neustart gespeichert. Pro Konto kann eine Inselreise gleichzeitig laufen. Entscheidungen werden mit Reisekennung und fortlaufender Version geprüft; wiederholte oder verspätete Anfragen geben keine zusätzlichen Funde. Zukünftige Wege und noch unbeantwortete Rätsellösungen verbleiben auf dem Server.

## Turm der Prüfungen

Der Turm ist ein allein spielbares Abenteuer mit **zehn Etagen**. Verschiedene Gegner kündigen ihre nächste Aktion an: normaler Angriff, Deckung, Fokusstoß oder schwerer Schlag. Wer diese Ankündigung beachtet, kann seine eigene Aktion darauf abstimmen. Angreifen, Fokus und Deckung funktionieren mit den beim Start gespeicherten Charakter- und Ausrüstungswerten.

Nach jeder besiegten Etage bis Etage 9 wartet eine Entscheidung: **Funde sichern und zurückkehren** oder **weiter aufsteigen**. Für den nächsten Kampf wird einer von drei Segen gewählt:

| Turmsegen | Wirkung für den laufenden Aufstieg |
| --- | --- |
| Lebensfunke | +18 maximale LP und bis zu 25 LP Heilung |
| Mutklinge | +4 Angriffsschaden |
| Sternenfokus | +5 Fokus-Schaden |

Die aktuellen LP werden zwischen den Etagen übernommen. Die **Turmquelle** heilt einmal pro Etage bis zu **20 LP** und verbraucht einen Zug. Sie ist eine eigene Abenteueraktion; Heiltränke und andere Gegenstände aus dem Inventar werden im Turm nicht verbraucht. Turmsegen und zusätzliche Kampfwerte gelten nur für diesen Aufstieg und werden nicht auf Schülerduelle oder das Konto übertragen.

Neue kosmetische Funde sind zunächst **ungesichert**. Sie werden erst beim freiwilligen Sichern oder nach dem vollständigen Sieg über Etage 10 dauerhaft freigeschaltet. Bei Niederlage oder Abbruch gehen nur die noch ungesicherten Funde dieses Versuchs verloren. Bereits freigeschaltete Sammlungseinträge, schulische XP und die eigene Ausrüstung bleiben erhalten. Ein laufender Aufstieg kann nach einem Serverneustart fortgesetzt werden; ein neuer Versuch ist erst nach Abschluss oder Abbruch des bisherigen möglich.

## Runengolem als Gruppenboss

Für den Start braucht es **drei bis fünf unterschiedliche Schülerkonten derselben Demoklasse**. Die Gruppenleitung eröffnet die Gruppe und startet, sobald genügend Mitglieder beigetreten sind. Vor dem Start können Mitglieder die Gruppe verlassen; verlässt die Leitung die Gruppe, übernimmt das nächste Mitglied.

Pro Runde wählt jedes noch aktive Gruppenmitglied genau eine Aktion: **Angriff, Fokus, Deckung, Sonnenrune oder Mondrune**. Die bereits gewählten Aktionen sind für die Gruppe sichtbar. Erst wenn alle noch lebenden Helden gewählt haben, wird die gemeinsame Runde aufgelöst. Eine festgelegte Aktion lässt sich in dieser Runde nicht nachträglich ändern.

Der Runenschild wird nur dann für die Runde gebrochen, wenn **zwei verschiedene Helden in derselben Runde Sonnen- und Mondrune aktivieren**. Das verursacht zusätzlichen Runenschaden und ermöglicht wirksame Angriffe der übrigen Gruppe. Der Golem kündigt Stampfen gegen die ganze Gruppe oder einen Faustschlag gegen ein bestimmtes Mitglied an; Deckung verringert den Schaden. Ein einzelner überlebender Held kann den Kampf nicht zu Ende führen. Ist der Golem nach zwölf Runden nicht besiegt, beendet seine Runenwut den Versuch.

Nach **120 Sekunden** kann ein Gruppenmitglied über die Funktion zum Fortsetzen die Runde mit fehlenden Aktionen abschließen. Diese fehlenden Züge werden als Deckung behandelt; die Frist wird auf dem Server geprüft. Für eine Siegesbelohnung muss ein Konto im Kampf mindestens **eine echte Aktion selbst abgegeben** haben. Konten, die ausschließlich durch solche automatischen Deckungszüge vertreten wurden, erhalten keine Belohnung. Im laufenden Kampf kann die Gruppenleitung den gesamten Versuch beenden; Gegenstände oder XP gehen dabei nicht verloren.

Die Gruppe, gewählte Aktionen und aktuelle Runde bleiben bei einem Serverneustart gespeichert. Der Golemkampf ist ein gemeinsamer Kampf mit echten Schülerkonten; fehlende Mitspieler werden nicht durch Bots ersetzt.

## Begleiter, Outfits und Trophäen

Alle 18 Abenteuerbelohnungen sind **rein optisch** und geben keine XP, Gegenstände oder Kampfboni. Ein bereits freigeschalteter Fund wird nicht doppelt vergeben. In **Sammlung** kann jeweils ein Begleiter und ein Outfit ausgewählt oder wieder abgelegt werden; beide sind in der 3D-Charakterdarstellung sichtbar. Trophäen bleiben als Sammlungseinträge erhalten und benötigen keinen Ausrüstungsplatz.

| Fund | Art | Freischaltung | ID |
| --- | --- | --- | --- |
| Glühwürmchen | Begleiter | Etage 2 abschließen und Funde sichern | `pet-firefly` |
| Sternenmantel | Outfit | Etage 4 abschließen und Funde sichern | `outfit-starlight` |
| Turmtrophäe | Trophäe | Etage 6 abschließen und Funde sichern | `trophy-tower-bronze` |
| Wolkengeist | Begleiter | Etage 8 abschließen und Funde sichern | `pet-cloud` |
| Turmwächter | Outfit | Alle zehn Etagen bezwingen | `outfit-warden` |
| Turmmeister | Trophäe | Alle zehn Etagen bezwingen | `trophy-tower-gold` |
| Runenfunke | Begleiter | Runengolem als aktives Gruppenmitglied besiegen | `pet-rune` |
| Runenhüter | Outfit | Runengolem als aktives Gruppenmitglied besiegen | `outfit-runekeeper` |
| Runengolembezwinger | Trophäe | Runengolem als aktives Gruppenmitglied besiegen | `trophy-golem` |
| Gezeitengeist | Begleiter | 3 Inselstationen abschließen und Funde sichern | `pet-tide` |
| Ätherfalke | Begleiter | Etage 4 abschließen und Funde sichern | `pet-aether-falcon` |
| Zahnradkäfer | Begleiter | Etage 6 abschließen und Funde sichern | `pet-clockwork-beetle` |
| Äthertauflinker | Begleiter | 3 Inselstationen abschließen und Funde sichern | `pet-mist-cat` |
| Ätherblütenfalter | Begleiter | 5 Inselstationen abschließen und Funde sichern | `pet-blossom-moth` |
| Kristallgolem | Begleiter | Runengolem als aktives Gruppenmitglied besiegen | `pet-crystal-golem` |
| Junger Ätherphönix | Begleiter | Alle zehn Turmetagen bezwingen | `pet-aether-phoenix` |
| Inselwanderer | Outfit | 5 Inselstationen abschließen und Funde sichern | `outfit-pathfinder` |
| Kompass der Insel | Trophäe | Alle 7 Inselstationen und den Wächter bezwingen | `trophy-island` |

Bereits gesicherte Erfolge schalten die passenden neuen Begleiter beim Update automatisch frei. Beispielsweise erhält der Besitzer des Sternenmantels den Ätherfalken. Vorhandene Konten, ausgewählte Begleiter, XP und Ausrüstung bleiben erhalten; doppelte Freischaltungen vergeben keine XP. Auch vor dem Update begonnene Abenteuer können die neuen Begleiter beim Sichern der zugehörigen alten Belohnungen freischalten. Ungesicherte und verlorene Funde zählen nicht als Freischaltung.

## Truhen, Inventar und Ausrüstung

Es gibt einen Truhentyp. Jede Truhe enthält mit gleicher Wahrscheinlichkeit **einen oder zwei Funde**. Für jeden Fund wird die Seltenheit unabhängig serverseitig ausgewürfelt. Zu 75 % ist der Fund Ausrüstung und zu 25 % ein Heiltrank. Häufige Trankfunde sind klein, seltene mittel und epische oder legendäre groß. Die Lehrkraft kann die Seltenheit oder den Inhalt nicht auswählen.

| Seltenheit | Chance pro Fund | XP für ein zusätzliches Ausrüstungsstück |
| --- | --- | --- |
| Gewöhnlich | 60 % | 2 XP |
| Selten | 28 % | 4 XP |
| Episch | 10 % | 7 XP |
| Legendär | 2 % | 10 XP |

Der Katalog enthält 192 Ausrüstungsvarianten (48 bisherige und 144 neue) mit festen, nachvollziehbaren Boni. Sechs Plätze stehen zur Verfügung: **Helm, Brustplatte, Hand 1, Hand 2, Kette und Ring**. Die Plätze sind im Inventar um den 3D-Avatar an den passenden Körperstellen angeordnet. Beide Hände können jeweils eine Waffe oder einen Schild tragen. Zwei gleiche Designs sind möglich, benötigen aber zwei tatsächlich vorhandene Exemplare. Dieselbe Instanz kann niemals beide Plätze gleichzeitig belegen.

[3D-Beispiele der neuen Ausrüstung und Begleiter](docs/aetheria-ausruestung.md)

Seit Version 0.9 enthält jede Herkunftskollektion einen Helm, eine Brustplatte, eine Waffe, einen Schild, eine Kette und einen Ring in allen vier Seltenheiten. **Alle Völker können alle Gegenstände tragen.** Die Kollektion ist ein gemeinsames Motiv, kein zusätzlicher Setbonus.

| Kollektion | Herkunft | Stil und Kampfschwerpunkt |
| --- | --- | --- |
| Silberlaub | Silberwind | Blätter, Kristalle und Licht; Fokus und leichte Schutzwerte |
| Zahnrad | Zephyria | Messing, Mechanik und Hämmer; normale Angriffe und Schutz |
| Nebelwacht | Nebelheim | Nebel, Silber und Speere; Ausdauer und Schutz |
| Windfahrt | Himmelsruhe | Segeltuch, Kompasse und Klingen; vielseitige Reiseausrüstung |
| Wurzelbund | Ätherhain | Ranken, Holz und Naturstäbe; Fokus und Lebenspunkte |
| Sonnenglas | Äthkern | Sandfarben, Sonnensteine und Klingen; normale Angriffe |

Im Inventar lässt sich nach **Herkunft** filtern. Neue Gegenstände zeigen ihren Herkunftsort und Kollektionsnamen; die Motive sind an der 3D-Ausrüstung sichtbar. Die alten 48 Gegenstände behalten ihre Kennungen und Bonuswerte. Die größere Auswahl verändert weder Truhenmenge noch Seltenheitsverteilung oder Eintauschwerte.

Ausrüstung verbessert Angriff, Fokus, maximale LP oder Rüstung. Rüstung reduziert Trefferschaden vor der Deckung um höchstens 12 Punkte; jeder Treffer verursacht mindestens einen Schadenspunkt. Farben, Kleidung und Emblem sind rein optisch.

Nur **zusätzliche Exemplare desselben Gegenstands in derselben Seltenheit** lassen sich gegen die kleinen XP-Beträge eintauschen. Ausgerüstete Stücke und das letzte Exemplar bleiben geschützt. Der Tausch erhöht verfügbare und Gesamt-XP; die dafür nötige Ausrüstung stammt aus Lehrertruhen. Heiltränke werden gestapelt und im Kampf verbraucht, nicht eingetauscht.

## Kampfanimationen

Angriff und Fokusstoß zeigen Bewegung, Trefferreaktion und Schadenszahlen; Deckung und Heiltränke haben eigene Effekte. Trainingszüge von Spieler und Gegner werden nacheinander abgespielt. Eine Siegesanimation schließt das Duell ab. Die Animationen ändern keine serverseitig berechneten Kampfwerte und blockieren Eingaben nur während des kurzen Effekts. Die Betriebssystem-/Browser-Einstellung für reduzierte Bewegung wird berücksichtigt.

## 3D-Figuren und Ausrüstungsansicht

Unter **Mein Held** und im **Inventar** wird die vollständige humanoide Figur des gewählten Volkes als 3D-Modell angezeigt. Die Vorschau lässt sich mit gedrückter Maustaste oder per Touch ziehen und drehen. Farbe, Outfit, Wappen sowie ausgerüsteter Helm, Brustplatte, Waffen, Schilde, Kette und Ring sind an der Figur sichtbar. Die Kämpfe zeigen beide Helden gemeinsam auf einer 3D-Arenaplattform; Zugfolge, Skills und Belohnungen funktionieren wie zuvor.

Für 3D wird ein Browser mit aktiviertem **WebGL 2** benötigt, etwa eine aktuelle Version von Edge, Chrome oder Firefox. Wenn keine geeignete Grafikunterstützung verfügbar ist, zeigt das Spiel automatisch die vorhandenen 2D-Figuren und Effekte. Inventar und Kämpfe bleiben bedienbar. Die Einstellung für reduzierte Bewegung gilt auch für die 3D-Darstellung.

Three.js **0.180.0** und seine MIT-Lizenz sind unter `public/vendor/` mitgeliefert. Modelle, 3D-Bibliothek und alle Effekte werden vom Spielserver geladen; zur Laufzeit sind keine externen CDNs oder Modelldienste nötig. Auch für das 3D-Update genügt `npm start`.

## Speicherung und Konfiguration

Konten, gehashte Passwörter, Sitzungen, Fähigkeiten, Inventar, Ausrüstung, Charaktergestaltung, Duelle und Vergaben liegen in `.data/klassenhelden.sqlite`. Auch der aktuelle Turmaufstieg, die Inselreise, Gruppenbosskämpfe einschließlich noch ausstehender Gruppenzüge, freigeschaltete Sammlungseinträge und ausgewählte Begleiter/Outfits werden dort gespeichert. Dieser Ordner ist von Git ausgeschlossen und bleibt bei Neustarts erhalten. Die Beispielkonten werden einmalig angelegt; Fortschritte werden beim Neustart nicht zurückgesetzt. Vorhandene Datenbanken werden beim Start automatisch um die benötigten Tabellen und Spalten erweitert. Alte mittlere Heiltränke bleiben erhalten; die Demo-Truhen und Beispielausrüstung werden pro Datenbank nur einmal ergänzt.

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

Node-HTTP-Server, SQLite, Vanilla JavaScript, CSS und die mitgelieferte Three.js-Bibliothek, ohne separat zu installierende Pakete. Rollen, Zugfolge, Inventarverbrauch und XP-Ausgaben werden auf dem Server geprüft. Sitzungen verwenden HttpOnly-/SameSite-Cookies; Passwörter werden mit individuellem Salt und scrypt gehasht. JSON-Mutationen von fremden Origins werden abgewiesen.

`npm test` führt die Tests der Kampfregeln, Beuteverteilung, Inventarregeln und HTTP-API aus. API-Tests verwenden eigene Datenbanken und verändern keine lokalen Spielstände. Dazu gehören auch die Migration der ersten Datenbankversion sowie parallele Anfragen, die keine Truhe oder Gegenstände doppelt verbrauchen dürfen. Die Völkerprüfungen testen Startwerte und tatsächlichen Schaden, manipulationssichere Registrierung, Volkswechsel, Lernkosten, erhaltene Stufen über dem Maximum und einmalige Spielstandübernahme. Weitere Tests prüfen die lokal ausgelieferten 3D-Module und die gespeicherte Ausrüstungsdarstellung: Ein später abgelegter oder eingetauschter Gegenstand verändert keinen bereits begonnenen Kampf. Die Abenteuerprüfungen decken Turmfortschritt und Belohnungssicherung, Gruppenbildung, Runenaktionen, veraltete oder doppelte Spielzüge, serverseitige Zeitfristen, kosmetische Besitzrechte sowie die Speicherung nach einem Neustart ab.

Die Kartenprüfungen kontrollieren die lokal ausgelieferte Bilddatei, die Auswahl aller elf Orte und den Zugang zu den drei spielbaren Abenteuern. Sie prüfen außerdem, dass reine Navigation keine neuen Versuche startet und laufende Turm-, Insel- und Gruppenabenteuer samt Ressourcen erhalten bleiben.

Wichtige Dateien: `public/world-map.js` und `public/world-map.css` (Weltkarte und Ortsauswahl), `shared/ancestries.js` (Völker, Startwerte und Skillfortschritt), `server.js` (HTTP/API), `lib/store.js` (Speicherung/Konten), `lib/items.js` (Gegenstände/Beute), `lib/combat.js` (Kampfregeln), `lib/adventures.js` (Turm-/Bossregeln), `lib/island.js` (Inselregeln), `lib/adventure-api.js` (Abenteuer-API), `lib/cosmetics.js` (Sammlung), `public/` (Oberfläche und Effekte), `test/` (Tests).
