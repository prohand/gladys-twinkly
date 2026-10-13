# Twinkly

Diese Integration verbindet Gladys mit deinen **Twinkly**-LED-Lichtern
(Lichterketten, Vorhänge, Bäume, Squares, Flex, Dots…). Gladys steuert sie
**lokal**, in deinem eigenen Netzwerk: ohne Konto, ohne Cloud.

## Bevor du beginnst

- Richte jedes Twinkly zuerst mit der **Twinkly-App** ein und verbinde es mit
  deinem WLAN.
- Es muss sich im **selben Netzwerk** wie Gladys befinden.
- Gladys **5.2** oder neuer.
- Empfohlen: Gib ihm eine **feste IP** (DHCP-Reservierung in deinem
  Router). Ändert sich seine IP, findet die Integration es wieder, aber
  langsamer.

Twinkly hat keine öffentliche Cloud-API: Alles läuft über das lokale Netzwerk
(Transport **local**).

## Konfiguration

| Feld                           | Funktion                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| **IP-Adressen**                | IP-Adressen deiner Twinkly-Geräte, durch Kommas getrennt. Optional, wenn die Suche sie findet. |
| **Netzwerksuche**              | Sucht Twinkly-Geräte im Netzwerk (UDP-Broadcast, Port 5555). Standardmäßig aktiviert.          |
| **Aktualisierungsintervall**   | Wie oft jedes Twinkly abgefragt wird: 10 s, 15 s, 30 s oder 1 min.                             |
| **Beim Einschalten abspielen** | Was ein Twinkly zeigt, wenn Gladys es einschaltet (Standard: was es zuletzt abgespielt hat).   |

**Verbindung testen** sucht die Twinkly-Geräte und listet auf, was antwortet:
Name, Adresse, Anzahl der LEDs, Firmware-Version, aktueller Modus.

**Ein Twinkly identifizieren** spielt 5 Sekunden lang seine Demo ab und stellt
es dann wieder so ein, wie es war: praktisch, um zu erkennen, welches welches
ist.

### Die Netzwerksuche findet nichts?

Der Container der Integration sieht keine Netzwerk-Broadcasts: Gladys sendet
die Suche für ihn. Manche Netzwerke blockieren sie (getrennte VLANs,
WLAN-Client-Isolation). Gib dann einfach die **IP-Adressen** ein.

## Geräte hinzufügen

Drücke unter **Integrationen → Twinkly → Entdecken** auf **Scannen** und füge
jedes Twinkly mit **Zu Gladys hinzufügen** hinzu. Jedes wird zu einer Leuchte mit:

| Funktion       | Wirkung                                                                                |
| -------------- | -------------------------------------------------------------------------------------- |
| **Ein/Aus**    | Aus (Modus `off`) oder wieder an (siehe „Beim Einschalten abspielen“).                 |
| **Helligkeit** | 0 bis 100 %. Die Helligkeit eines ausgeschalteten Twinkly zu erhöhen, schaltet es ein. |
| **Farbe**      | Feste Farbe (Firmware 2.7.1 oder neuer).                                               |
| **Szene**      | Die aus der App hochgeladenen Animationen, die Playlist und die integrierten Effekte.  |

Das Gerät behält seine Identität (auf Basis seiner MAC-Adresse): Eine
Umbenennung in der App oder eine neue IP erzeugt nie ein Duplikat.

Eine neue Animation aus der App hochgeladen? Starte erneut eine Suche,
damit sie in der Liste **Szene** erscheint.

## Szenen (Gladys 5.1 und neuer)

### Auslöser

| Auslöser                                 | Wann                                                                                   | Variablen                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------- |
| **Ein Twinkly hat den Modus gewechselt** | Der Modus hat sich **außerhalb von Gladys** geändert: App, seine Taste, eigener Timer. | `device_name`, `mode`, `previous_mode` |
| **Ein Twinkly ist nicht erreichbar**     | Es antwortet nicht mehr (ausgesteckt, WLAN verloren…).                                 | `device_name`                          |
| **Ein Twinkly antwortet wieder**         | Es antwortet wieder.                                                                   | `device_name`                          |

Eine von Gladys befohlene Änderung löst „hat den Modus gewechselt“ nie aus:
Eine Szene kann keine Schleife bilden.

Änderungen werden bei jeder Abfrage erkannt: Bei einem Intervall von 30 s
reagiert eine Szene innerhalb von 30 s.

### Aktionen

| Aktion                          | Parameter                                                                | Ausgabe                     |
| ------------------------------- | ------------------------------------------------------------------------ | --------------------------- |
| **Twinkly-Animation abspielen** | Twinkly, Name der Animation (oder Nummer: 1 = erste)                     | `movie` (abgespielter Name) |
| **Twinkly-Effekt abspielen**    | Twinkly, Effektnummer (1 = erster)                                       | `effect`                    |
| **Modus eines Twinkly ändern**  | Twinkly, Modus: ein, aus, Animation, Effekt, Playlist, feste Farbe, Demo | `mode` (angewendet)         |

Um Farbe und Helligkeit in einer Szene einzustellen, verwende die
Standardaktion von Gladys „Gerätewert setzen“.

## Dashboard (Gladys 5.1 und neuer)

Das Widget **Twinkly** hat zwei Ansichten, die in seinen Einstellungen gewählt
werden:

- **Kein Twinkly gewählt**: eine Zeile pro Gerät (was es abspielt und wie hell,
  oder „Nicht erreichbar“) und zwei Schaltflächen: **Alle ein** und
  **Alle aus**.
- **Ein Twinkly gewählt**: seine Live-Helligkeit, sein Zustand, die laufende
  Szene, seine Farbe, IP-Adresse, Anzahl der LEDs und Firmware sowie ein Satz
  Schaltflächen (Einstellung **Schaltflächen**):

  | Schaltflächen     | Funktion                                                                              |
  | ----------------- | ------------------------------------------------------------------------------------- |
  | Szenen (Standard) | Ein-/Ausschalten, vorherige Szene, nächste Szene, Identifizieren                      |
  | Helligkeit        | Ein-/Ausschalten, −10 %, +10 %, Max                                                   |
  | Modi              | Ein-/Ausschalten, **Abspielen…** (siehe unten) und bis zu 2 Modi: Animation, Playlist |
  | Farben            | Weiß, Rot, Grün, Blau (feste Farbe, Firmware 2.7.1+)                                  |

  Eine Karte enthält höchstens 4 Schaltflächen: Füge das Widget mehrmals
  hinzu, um mehrere Sätze zu erhalten. Die Szenen laufen in der Reihenfolge der
  Liste durch (Animationen, Playlist, Effekte). Die Helligkeit sinkt nicht unter
  10 %: Zum Ausschalten verwende **Ausschalten**.

  **Abspielen…** öffnet ein kleines Formular in der Karte: Wähle in einer
  einzigen Liste, was abgespielt werden soll — einen Modus (Animation,
  Playlist, feste Farbe, Effekt, Demo), eine der aus der App hochgeladenen
  Animationen oder einen integrierten Effekt — und optional eine Helligkeit (10
  bis 100 %; leer lassen, um die aktuelle beizubehalten). Es ist mit dem
  vorausgefüllt, was das Twinkly gerade abspielt.

## Fehlerbehebung

- **„Noch kein Twinkly gefunden“**: Prüfe, ob das Twinkly in der App
  antwortet, und gib dann seine IP unter **IP-Adressen** ein.
- **Ein Twinkly wird „Nicht erreichbar“**: Es ist ausgesteckt, nicht im WLAN,
  oder seine IP hat sich geändert. Die Integration startet eine neue Suche
  (höchstens alle 5 Minuten). Eine feste IP vermeidet das Problem.
- **Die Twinkly-App und Gladys gleichzeitig**: Das funktioniert. Wenn die App
  übernimmt, verbindet sich Gladys von selbst wieder.
- Die Protokolle der Integration (Reiter **Protokolle** in Gladys) zeigen, was
  gefunden wurde und was nicht antwortet.
