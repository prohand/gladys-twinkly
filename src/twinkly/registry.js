// -----------------------------------------------------------------------------
// The Twinkly devices this integration knows, keyed by their MAC address.
//
// The MAC is the platform id behind the Gladys external id: the IP changes with
// DHCP, the name with the app, the MAC never does. One entry holds the client
// of the device, what it can do (color, movies, effects, playlist) and the last
// state read, which the poll compares to spot changes made outside Gladys.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { TwinklyClient } from './client.js';

const logger = createLogger({ name: 'registry' });

/** `98:F4:AB:33:AA:FF` -> `98f4ab33aaff`. */
export function platformIdFromMac(mac) {
  return String(mac ?? '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
}

/** Run `task`, give `fallback` when it fails (optional capabilities). */
async function optional(task, fallback) {
  try {
    return await task();
  } catch {
    return fallback;
  }
}

export class TwinklyRegistry {
  /**
   * @param {object} [options]
   * @param {(host: string) => TwinklyClient} [options.createClient]
   */
  constructor({ createClient = (host) => new TwinklyClient(host) } = {}) {
    this.createClient = createClient;
    /** @type {Map<string, object>} */
    this.entries = new Map();
  }

  all() {
    return [...this.entries.values()];
  }

  get(platformId) {
    return this.entries.get(platformId) ?? null;
  }

  findByHost(host) {
    return this.all().find((entry) => entry.host === host) ?? null;
  }

  /**
   * Read a device on `host` and add (or refresh) its entry. A device that
   * moved to another IP keeps its entry and its known state.
   * @returns {Promise<object>} the entry
   * @throws {TwinklyError} when nothing answers on that host
   */
  async probe(host) {
    const known = this.findByHost(host);
    const client = known?.client ?? this.createClient(host);
    const gestalt = await client.gestalt();
    const platformId = platformIdFromMac(gestalt.mac);
    if (!platformId) {
      throw new Error(`${host} answered without a MAC address: not a Twinkly?`);
    }

    let entry = this.entries.get(platformId);
    if (!entry) {
      entry = {
        platformId,
        lastMode: null,
        lastActiveMode: null,
        lastBrightness: null,
        lastColor: null,
        lastScene: null,
        reachable: true,
        lastError: null,
        lastSeenAt: null,
      };
      this.entries.set(platformId, entry);
      logger.info(`Found ${gestalt.device_name ?? platformId} on ${host}`);
    } else if (entry.host !== host) {
      logger.info(`${entry.name} moved from ${entry.host} to ${host}`);
    }

    entry.host = host;
    entry.client = entry.client?.host === host ? entry.client : client;
    entry.gestalt = gestalt;
    entry.name = gestalt.device_name || `Twinkly ${platformId.slice(-6)}`;
    entry.productCode = gestalt.product_code ?? null;
    entry.ledCount = Number(gestalt.number_of_led ?? 0);
    entry.ledProfile = gestalt.led_profile ?? 'RGB';

    // What the device can do. Each is optional: an old firmware lacks the
    // color endpoint, a device fresh out of the box has no movie.
    entry.firmware = await optional(() => entry.client.firmwareVersion(), null);
    entry.hasColor = await optional(async () => {
      await entry.client.getColor();
      return true;
    }, false);
    entry.movies = await optional(() => entry.client.getMovies(), []);
    entry.effectCount = await optional(() => entry.client.getEffectCount(), 0);
    entry.playlist = await optional(() => entry.client.getPlaylist(), []);
    entry.reachable = true;
    entry.lastError = null;
    return entry;
  }

  /**
   * Probe every host, in parallel. Never throws.
   * @param {string[]} hosts
   * @returns {Promise<{found: object[], failed: Array<{host: string, error: string}>}>}
   */
  async probeAll(hosts) {
    const results = await Promise.all(
      [...new Set(hosts)].map(async (host) => {
        try {
          return { entry: await this.probe(host) };
        } catch (err) {
          logger.warn(`No Twinkly answered on ${host}: ${err?.message ?? err}`);
          return { host, error: err?.message ?? String(err) };
        }
      }),
    );
    const found = [];
    for (const result of results) {
      if (result.entry && !found.includes(result.entry)) {
        found.push(result.entry);
      }
    }
    return {
      found,
      failed: results.filter((r) => r.error).map(({ host, error }) => ({ host, error })),
    };
  }
}
