// -----------------------------------------------------------------------------
// Finding the Twinkly devices on the LAN.
//
// Twinkly answers a UDP broadcast on port 5555 carrying `\x01discover`: each
// device replies in unicast, to the emitter, with its IPv4 address (4 bytes,
// reversed), `OK`, then its name and a NUL byte.
//
// The integration runs in a bridge container: a broadcast it emits never
// reaches the LAN, and the replies would never come back. So the broadcast is
// MEDIATED by the Gladys core, which sits on the host network: the manifest
// declares `network_discovery: udp-active-broadcast` on port 5555, the code
// forges the payload, the core broadcasts it and relays the raw replies
// (`gladys.scanNetwork`). Everything after that is plain unicast HTTP, which
// does cross the NAT.
//
// Not every network lets a broadcast through (VLANs, Wi-Fi isolation), and a
// core without mediated discovery answers 403/404: the `hosts` field of the
// configuration is the way in that always works.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'discovery' });

/** UDP port Twinkly devices listen on for discovery. */
export const DISCOVERY_PORT = 5555;

/** The discovery request: 0x01 then "discover". */
export const DISCOVERY_PAYLOAD = Buffer.concat([Buffer.from([0x01]), Buffer.from('discover')]);

/** How long the core listens for replies, in seconds. */
export const DISCOVERY_TIMEOUT_SECONDS = 3;

/**
 * Decode one discovery reply.
 * @param {Buffer} payload raw datagram
 * @param {string} [sourceIp] address the datagram came from (preferred: it
 *   is the one that routes back, the payload carries the device's own view)
 * @returns {{host: string, name: string} | null} null when it is not a Twinkly reply
 */
export function parseDiscoveryReply(payload, sourceIp) {
  if (!Buffer.isBuffer(payload) || payload.length < 6) {
    return null;
  }
  if (payload.toString('latin1', 4, 6) !== 'OK') {
    return null;
  }
  const ip = [payload[3], payload[2], payload[1], payload[0]].join('.');
  const end = payload.indexOf(0, 6);
  const name = payload.toString('utf8', 6, end === -1 ? payload.length : end).trim();
  return { host: sourceIp || ip, name };
}

/**
 * Broadcast the discovery request through the Gladys core.
 * Never throws: a core without mediated discovery, a scan refused because the
 * previous one is less than 10 s old (429)... all give an empty list and the
 * reason, and the configured hosts still work.
 *
 * @param {object} gladys SDK instance
 * @returns {Promise<{hosts: Array<{host: string, name: string}>, error: string|null}>}
 */
export async function scanForTwinkly(gladys) {
  let replies;
  try {
    replies = await gladys.scanNetwork('udp-active-broadcast', {
      port: DISCOVERY_PORT,
      payload: DISCOVERY_PAYLOAD,
      timeoutSeconds: DISCOVERY_TIMEOUT_SECONDS,
    });
  } catch (err) {
    logger.warn(`Network discovery unavailable: ${err?.message ?? err}`);
    return { hosts: [], error: err?.message ?? String(err) };
  }
  const found = new Map();
  for (const reply of replies ?? []) {
    const parsed = parseDiscoveryReply(
      Buffer.from(reply.payload_base64 ?? '', 'base64'),
      reply.source_ip,
    );
    if (parsed && !found.has(parsed.host)) {
      found.set(parsed.host, parsed);
    }
  }
  logger.info(`Network discovery: ${found.size} Twinkly device(s) answered`);
  return { hosts: [...found.values()], error: null };
}
