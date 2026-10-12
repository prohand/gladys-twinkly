// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of the manifest; the
// SDK fetches it (`gladys.getConfig()`) and pushes every change
// (`gladys.onConfigUpdated()`). This module holds the defaults and normalizes
// the received object, so the rest of the code never deals with `undefined` or
// with numbers that arrive as strings.
// -----------------------------------------------------------------------------

import { DEVICE_POLL_FREQUENCIES } from '@gladysassistant/integration-sdk';

/** What "on" restores, the `turn_on_mode` select of the manifest. */
export const TURN_ON_MODES = {
  LAST: 'last',
  MOVIE: 'movie',
  EFFECT: 'effect',
  PLAYLIST: 'playlist',
  COLOR: 'color',
};

// Defaults: they MUST stay equal to the `default` values of the manifest
// `config_schema` (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  hosts: '',
  auto_discovery: true,
  refresh_interval: '30',
  turn_on_mode: TURN_ON_MODES.LAST,
};

// Gladys only accepts these poll frequencies, in milliseconds: any other value
// rejects the WHOLE discovery batch and leaves the Discovery tab empty. The SDK
// mirrors the core's enum, so the list follows it instead of a copy here.
export const GLADYS_POLL_FREQUENCIES_MS = Object.values(DEVICE_POLL_FREQUENCIES).sort(
  (a, b) => a - b,
);

/**
 * The Gladys poll frequency (ms) for a refresh interval in seconds: the
 * largest accepted tick not longer than the interval.
 * @param {number} seconds
 * @returns {number} one of GLADYS_POLL_FREQUENCIES_MS
 */
export function gladysPollFrequency(seconds) {
  const wanted = Number(seconds) * 1000;
  const fitting = GLADYS_POLL_FREQUENCIES_MS.filter((ms) => ms <= wanted);
  return fitting.length > 0 ? fitting[fitting.length - 1] : GLADYS_POLL_FREQUENCIES_MS[0];
}

/**
 * Split the `hosts` field: IPv4 addresses or host names, separated by commas,
 * semicolons, spaces or new lines. Duplicates are dropped, order is kept.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function parseHosts(raw) {
  if (typeof raw !== 'string') {
    return [];
  }
  const hosts = raw
    .split(/[\s,;]+/)
    .map((host) =>
      host
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, ''),
    )
    .filter((host) => /^[a-z0-9.-]+(:\d+)?$/i.test(host));
  return [...new Set(hosts)];
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULT_CONFIG, ...raw };
  const turnOnMode = Object.values(TURN_ON_MODES).includes(config.turn_on_mode)
    ? config.turn_on_mode
    : DEFAULT_CONFIG.turn_on_mode;
  const refresh = Number(config.refresh_interval);
  return {
    ...config,
    hostList: parseHosts(config.hosts),
    // A boolean may arrive as the string "false" from an older form.
    auto_discovery: config.auto_discovery !== false && config.auto_discovery !== 'false',
    refreshSeconds: Number.isFinite(refresh) && refresh > 0 ? refresh : 30,
    turn_on_mode: turnOnMode,
  };
}
