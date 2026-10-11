# Twinkly — Gladys Assistant integration

External integration connecting [Gladys Assistant](https://gladysassistant.com) to
**Twinkly** smart LED lights (strings, curtains, trees, Squares, Flex, Dots…), over the
local network.

Built on the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
and the SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

User documentation: [English](./docs/en.md) · [Français](./docs/fr.md).

## What it does

| Gladys feature   | Twinkly                                                     |
| ---------------- | ----------------------------------------------------------- |
| Light on/off     | LED mode `off` / back to the chosen mode                    |
| Light brightness | Dimmer, 0-100 %                                             |
| Light color      | Solid color mode (firmware 2.7.1+)                          |
| Scene (select)   | The movies uploaded from the app, the playlist, the effects |

Since Gladys 5.1 it also extends the scene editor and the dashboard:

- **Triggers**: a Twinkly changed mode (outside Gladys), is unreachable, answers again.
- **Actions**: play a movie, play an effect, change the mode.
- **Widget**: one row per Twinkly, "All on" / "All off" buttons.

## How it talks to the hardware

One transport, declared in the manifest: **local**. Twinkly has no public cloud API; the
integration speaks the device's own REST API (`http://<ip>/xled/v1`), with its 4-hour
token, one request at a time per device.

Discovery: the Twinkly devices answer a UDP broadcast on port 5555. The integration
container cannot broadcast on the LAN, so the **Gladys core sends it** on its behalf
(manifest `network_discovery: udp-active-broadcast`), and the integration parses the
replies. IP addresses typed in the configuration always work too.

## Development

```bash
npm install
npm test
npm run lint
npm run format:check
```

See [CLAUDE.md](./CLAUDE.md) for the architecture and the rules.

## Test a build in Gladys

**Actions → Build and publish image → Run workflow** on any branch publishes
`ghcr.io/prohand/gladys-twinkly:<branch>`; the run summary gives a manifest ready to
paste in **Integrations → Install an integration → Developer mode**.

## Release

**Actions → Release → Run workflow** (patch / minor / major): it bumps `package.json` and
the manifest, rolls `CHANGELOG.md`, tags `vX.Y.Z`, publishes the multi-arch image
(`linux/amd64`, `linux/arm64`) and the GitHub Release.

The GitHub package `ghcr.io/prohand/gladys-twinkly` must be **public** so Gladys (and the
store) can pull it: after the first release, open the package settings on GitHub and set
its visibility to public.

## Security

See [SECURITY.md](./SECURITY.md).

## License

Apache-2.0.
