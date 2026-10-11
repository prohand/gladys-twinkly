# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]

## [1.0.1] - 2026-10-11

` as you make it. The Release workflow
moves that section under the version it ships, and the section becomes the notes of
the version's GitHub Release.

## [Unreleased]

### Added

- Twinkly devices driven over the local network (`/xled/v1` API, no cloud): on/off,
  brightness, solid color (firmware 2.7.1+) and a scene list with the movies, the
  playlist and the built-in effects.
- Discovery by network scan (UDP broadcast on port 5555, sent by the Gladys core)
  and by IP addresses typed in the configuration; a device that changed IP is found
  again.
- Per-device `local` / `unreachable` transport badge and connection status.
- "Test the connection" and "Identify a Twinkly" in the Configuration screen.
- Gladys 5.1 scene triggers (a Twinkly changed mode, is unreachable, answers again),
  scene actions (play a movie, play an effect, change the mode) and a Twinkly
  dashboard widget with "All on" / "All off" buttons.
- CI on Node 22 and 24, store admission checks and Docker build on pull requests,
  Release workflow, GitHub releases, Dependabot.
- `SECURITY.md`, `CHANGELOG.md` and `CLAUDE.md`.
- The Twinkly widget can show one chosen Twinkly: live brightness, state, scene,
  color, IP, LEDs, firmware, and a set of buttons picked in its settings (on/off,
  previous/next scene, identify; brightness −/+/max; modes; solid colors).

[Unreleased]: https://github.com/prohand/gladys-twinkly/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/prohand/gladys-twinkly/releases/tag/v1.0.1
