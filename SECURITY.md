# Security policy

## Supported versions

Only the latest release of the Twinkly integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-twinkly](https://github.com/prohand/gladys-twinkly/security), then
**Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove tokens and addresses first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), the
Twinkly firmware and app (report to Twinkly / LEDWORKS).

## How the integration handles your network

- It talks to the Twinkly devices over **plain HTTP on the local network**
  (`/xled/v1`), the only way the device offers. The session token the device
  hands out lasts 4 hours, is kept in memory only and is never logged.
- It never contacts the Internet: no cloud, no account, no telemetry.
- The network scan is a UDP broadcast on port 5555, sent **by the Gladys core**
  on the integration's behalf (`network_discovery` in the manifest, shown on the
  install screen). The container itself cannot broadcast on your LAN.
- The container runs as a non-root user on a read-only root filesystem.

## Good practices for users

- Keep the Twinkly devices on a trusted network (or an IoT VLAN Gladys can reach):
  anyone on that network can drive them, with or without Gladys.
- Keep the Twinkly firmware, Gladys and the integration up to date.
