# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and to human contributors
working in this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) for **Twinkly** smart LED lights. It started
from the official [JavaScript template](https://github.com/GladysAssistant/integration-template-js)
and uses the same workflows as [gladys-devmel](https://github.com/prohand/gladys-devmel).

Twinkly has no public cloud API: everything goes through the device's local REST API
(`http://<ip>/xled/v1/...`). The manifest declares `transports: ["local"]` only.

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/service.test.js            # one file
node --test --test-name-pattern "identify"  # tests whose name matches
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks (Node 24)
```

CI runs `format:check`, `lint`, `test` on Node 22 and 24; pull requests also run the store
checks and build the Docker image. Run the three commands before pushing.

## Architecture

```
index.js                    SDK wiring only (handlers registered before connect())
src/config.js               DEFAULT_CONFIG (= manifest defaults), hosts parser, poll ticks
src/twinkly/client.js       one device: token (login/verify), queued requests, /xled/v1 calls
src/twinkly/discovery.js    UDP discovery payload + reply parser, mediated by the core
src/twinkly/registry.js     known devices keyed by MAC: client, capabilities, last state
src/twinkly/service.js      the behaviour: discover, poll, commands, triggers, identify, report
src/twinkly/labels.js       LED mode names, `{ en, fr, de, es }` text helpers
src/devices/twinkly.js      Gladys device payload, features, scene options, states
src/capabilities/scenes.js  scene trigger keys + scene action handlers (Gladys 5.1)
src/capabilities/widget.js  the twinkly_overview dashboard widget (Gladys 5.1)
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md       user documentation (en/fr mandatory; all four kept in sync)
test/helpers/               fakeGladys (SDK), fakeTwinkly (fetch), setup (wired service)
.github/scripts/changelog-release.mjs   rolls CHANGELOG.md during a release
```

### Invariants worth knowing

- **External ids are built on the MAC address** (`twinkly:<mac without colons>`), never
  the IP or the name. Feature keys (`on-off`, `brightness`, `color`, `scene`) are
  forever: Gladys keys devices, history, scenes and dashboards on them.
- **Discovery is mediated**: the container is on a bridge network and cannot broadcast.
  `gladys.scanNetwork('udp-active-broadcast', { port: 5555, payload: '\x01discover' })`
  makes the core do it (manifest `network_discovery`). Typed IPs and the `IP_ADDRESS`
  param of created devices always work too. A lost device triggers a rediscovery at
  most every 5 minutes.
- **Token**: `POST /login` + `POST /verify`, header `X-Auth-Token`, 4 h lifetime;
  renewed a minute early and once on a 401 (the app may have taken a new one).
- **One request at a time per device**: the controller drops concurrent connections,
  the client queues them.
- **Every JSON answer carries `code`**: anything but 1000 is a failure, even under
  HTTP 200.
- **Polling**: Gladys `poll_frequency` must be one of 1000, 2000, 10000, 15000, 30000,
  60000 ms; anything else rejects the WHOLE discovery batch. Gladys 5.3+ sets
  `should_poll` itself; it is still published as `true` for the devices created by
  older cores.
- **States** go through `publishChangedStates` (30-minute heartbeat): a poll sends what
  changed; the read after a Gladys order is sent whole.
- **Scene triggers fire on transitions only**, and never for a change Gladys ordered
  (`entry.commands` makes a poll racing an order drop its stale read): a scene must not
  loop through the integration.
- **Every feature declares `min`/`max`** (NOT NULL in Gladys).
- Trigger, action, widget and config keys are stored by users: never rename them.

## Rules

- **Versions belong to the Release workflow** (Actions → Release): never edit `version`
  in `package.json` or the manifest, nor the `docker_image` tag, by hand.
  `test/manifest.test.js` checks they agree.
- **Changelog**: every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a
  version heading: the Release workflow does it.
- **User-facing text is `{ en, fr, de, es }`**: manifest texts (label, description,
  placeholder), action messages, connection status, widget texts and toasts. The catalog
  description holds 10 to 100 characters per language. `docs/en.md`, `docs/fr.md`,
  `docs/de.md`, `docs/es.md` stay in sync.
  `test/manifest.test.js` ties the manifest to the code: change both sides together.
  `keywords` (1-10 search terms) needs `gladys_version >=5.3.0`, the floor it pins.
- **The container rootfs is read-only**: write only under `/data`. Never log tokens.
- **Style**: Prettier formats, ESLint catches mistakes. Comments explain why, in
  English. Tests never touch the network (`test/helpers/fakeTwinkly.js` fakes `fetch`).
