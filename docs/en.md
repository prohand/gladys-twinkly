# Twinkly

This integration connects Gladys to your **Twinkly** smart LED lights
(strings, curtains, trees, Squares, Flex, Dots…). Gladys drives them
**locally**, on your own network: no account, no cloud.

## Before you start

- Set up each Twinkly with the **Twinkly app** first, and connect it to your
  Wi-Fi.
- It must be on the **same network** as Gladys.
- Gladys **5.3** or later.
- Recommended: give it a **fixed IP** (DHCP reservation in your router). If
  its IP changes, the integration finds it again, but more slowly.

Twinkly has no public cloud API: everything goes through the local network
(**local** transport).

## Configuration

| Field                    | What it does                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| **IP addresses**         | IP addresses of your Twinkly devices, comma-separated. Optional when the scan finds them. |
| **Network scan**         | Looks for Twinkly devices on the network (UDP broadcast, port 5555). On by default.       |
| **Refresh interval**     | How often each Twinkly is read: 10 s, 15 s, 30 s or 1 min.                                |
| **When turned on, play** | What a Twinkly shows when Gladys turns it on (default: what it played last).              |

**Test the connection** looks for the Twinkly devices and lists what answers:
name, address, LED count, firmware version, current mode.

**Identify a Twinkly** plays its demo for 5 seconds, then puts it back as it
was: handy to tell which one is which.

### The network scan finds nothing?

The integration container does not see network broadcasts: Gladys sends the
scan for it. Some networks block it (separate VLANs, Wi-Fi client isolation).
Then just type the **IP addresses**.

## Adding the devices

In **Integrations → Twinkly → Discover**, press **Scan** and add each Twinkly
with **Add to Gladys**.
Each one becomes a light with:

| Feature        | What it does                                                             |
| -------------- | ------------------------------------------------------------------------ |
| **On/Off**     | Off (mode `off`) or back on (see "When turned on, play").                |
| **Brightness** | 0 to 100 %. Raising the brightness of a Twinkly that is off turns it on. |
| **Color**      | Solid color (firmware 2.7.1 or later).                                   |
| **Scene**      | The movies uploaded from the app, the playlist and the built-in effects. |

The device keeps its identity (based on its MAC address): renaming it in the
app or a new IP never creates a duplicate.

Uploaded a new movie from the app? Run a scan again so it shows up in the
**Scene** list.

## Scenes (Gladys 5.1 and later)

### Triggers

| Trigger                      | When                                                                     | Variables                              |
| ---------------------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| **A Twinkly changed mode**   | The mode changed **outside Gladys**: the app, its button, its own timer. | `device_name`, `mode`, `previous_mode` |
| **A Twinkly is unreachable** | It stopped answering (unplugged, Wi-Fi lost…).                           | `device_name`                          |
| **A Twinkly answers again**  | It answers again.                                                        | `device_name`                          |

A change Gladys ordered never fires "changed mode": a scene cannot loop.

Changes are seen at each read: with a 30 s interval, a scene reacts within
30 s.

### Actions

| Action                    | Parameters                                                         | Output                |
| ------------------------- | ------------------------------------------------------------------ | --------------------- |
| **Play a Twinkly movie**  | Twinkly, movie name (or number: 1 = first)                         | `movie` (name played) |
| **Play a Twinkly effect** | Twinkly, effect number (1 = first)                                 | `effect`              |
| **Change a Twinkly mode** | Twinkly, mode: on, off, movie, effect, playlist, solid color, demo | `mode` (applied)      |

To set color and brightness in a scene, use the standard Gladys action
"Set device value".

## Dashboard (Gladys 5.1 and later)

The **Twinkly** widget has two views, picked in its settings:

- **No Twinkly chosen**: one row per device (what it plays and how bright, or
  "Unreachable") and two buttons: **All on** and **All off**.
- **One Twinkly chosen**: its live brightness, its state, the scene playing,
  its color, IP address, LED count and firmware, and a set of buttons (the
  **Buttons** setting):

  | Buttons          | What they do                                                          |
  | ---------------- | --------------------------------------------------------------------- |
  | Scenes (default) | Turn on/off, previous scene, next scene, Identify                     |
  | Brightness       | Turn on/off, −10 %, +10 %, Max                                        |
  | Modes            | Turn on/off, **Play…** (see below) and up to 2 modes: movie, playlist |
  | Colors           | White, red, green, blue (solid color, firmware 2.7.1+)                |

  A card holds 4 buttons at most: add the widget several times to get several
  sets. Scenes loop in the list order (movies, playlist, effects). Brightness
  does not go below 10 %: to switch off, use **Turn off**.

  **Play…** opens a small form in the card: pick what to play in one list —
  a mode (movie, playlist, solid color, effect, demo), one of the movies
  uploaded from the app, or a built-in effect — and, optionally, a brightness
  (10 to 100 %; leave it empty to keep the current one). It is pre-filled with
  what the Twinkly plays now.

## Troubleshooting

- **"No Twinkly found yet"**: check that the Twinkly answers in the app, then
  type its IP in **IP addresses**.
- **A Twinkly turns "Unreachable"**: it is unplugged, off the Wi-Fi, or its IP
  changed. The integration runs a new scan (at most once every 5 minutes). A
  fixed IP avoids the problem.
- **The Twinkly app and Gladys at the same time**: that works. When the app
  takes over, Gladys reconnects by itself.
- The integration logs (the **Logs** tab in Gladys) say what was found and
  what does not answer.
