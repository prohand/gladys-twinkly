// -----------------------------------------------------------------------------
// A Twinkly device, as Gladys sees it: one light with four features.
//
//   on-off      LIGHT/BINARY      off = LED mode `off`; on = the mode it had
//   brightness  LIGHT/BRIGHTNESS  0-100 %, the dimmer of the controller
//   color       LIGHT/COLOR       solid color (mode `color`), firmware 2.7.1+
//   scene       TEXT/SELECT       what plays: a movie, an effect, the playlist
//
// The scene choices are discovered on the device itself (the movies uploaded
// from the app, the built-in effects), hence a TEXT/SELECT with per-device
// `supported_options` rather than a generic enum. Their values are stable:
// `movie:<unique_id>` (a movie id shifts when another one is deleted),
// `effect:<n>`, `playlist`.
//
// External ids are built on the MAC address: never change the type or the
// feature keys below, Gladys keys the device, its history and the scenes on
// them.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { gladysPollFrequency } from '../config.js';
import { LED_MODES, rgbToInt } from '../twinkly/client.js';

export const DEVICE_TYPE = 'twinkly';

export const FEATURES = {
  ON_OFF: 'on-off',
  BRIGHTNESS: 'brightness',
  COLOR: 'color',
  SCENE: 'scene',
};

/** Value of the scene select for the playlist. */
export const PLAYLIST_SCENE = 'playlist';

export function idsOf(gladys, entry) {
  return gladys.externalIds(DEVICE_TYPE, entry.platformId);
}

/** The stable key of a movie: its unique_id when the firmware gives one. */
export function movieKey(movie) {
  return String(movie.unique_id || movie.id);
}

/**
 * The choices of the scene select, in the order the app shows them.
 * @returns {Array<{value: string, label: string, sort_order: number}>}
 */
export function sceneOptions(entry) {
  const options = [];
  for (const movie of entry.movies ?? []) {
    options.push({ value: `movie:${movieKey(movie)}`, label: movie.name || `Movie ${movie.id}` });
  }
  if ((entry.playlist ?? []).length > 0) {
    options.push({ value: PLAYLIST_SCENE, label: 'Playlist' });
  }
  for (let i = 0; i < (entry.effectCount ?? 0); i += 1) {
    options.push({ value: `effect:${i}`, label: `Effect ${i + 1}` });
  }
  return options.map((option, index) => ({ ...option, sort_order: index }));
}

/**
 * Read a scene value back.
 * @returns {{kind: 'movie', movie: object} | {kind: 'effect', id: number} | {kind: 'playlist'} | null}
 */
export function parseScene(entry, value) {
  const text = String(value ?? '');
  if (text === PLAYLIST_SCENE) {
    return { kind: 'playlist' };
  }
  const [kind, key] = [text.slice(0, text.indexOf(':')), text.slice(text.indexOf(':') + 1)];
  if (kind === 'effect' && /^\d+$/.test(key)) {
    return { kind: 'effect', id: Number(key) };
  }
  if (kind === 'movie') {
    const movie = (entry.movies ?? []).find((m) => movieKey(m) === key || String(m.id) === key);
    return movie ? { kind: 'movie', movie } : null;
  }
  return null;
}

/** The discovery payload of one Twinkly. */
export function buildDevice(gladys, entry, config) {
  const ids = idsOf(gladys, entry);
  const features = [
    {
      name: 'On/Off',
      external_id: ids.feature(FEATURES.ON_OFF),
      category: DEVICE_FEATURE_CATEGORIES.LIGHT,
      type: DEVICE_FEATURE_TYPES.LIGHT.BINARY,
      read_only: false,
      has_feedback: true,
      keep_history: true,
      min: 0,
      max: 1,
    },
    {
      name: 'Brightness',
      external_id: ids.feature(FEATURES.BRIGHTNESS),
      category: DEVICE_FEATURE_CATEGORIES.LIGHT,
      type: DEVICE_FEATURE_TYPES.LIGHT.BRIGHTNESS,
      unit: DEVICE_FEATURE_UNITS.PERCENT,
      read_only: false,
      has_feedback: true,
      keep_history: true,
      min: 0,
      max: 100,
    },
  ];
  if (entry.hasColor) {
    features.push({
      name: 'Color',
      external_id: ids.feature(FEATURES.COLOR),
      category: DEVICE_FEATURE_CATEGORIES.LIGHT,
      type: DEVICE_FEATURE_TYPES.LIGHT.COLOR,
      read_only: false,
      has_feedback: true,
      keep_history: false,
      min: 0,
      max: 0xffffff,
    });
  }
  const options = sceneOptions(entry);
  if (options.length > 0) {
    features.push({
      name: 'Scene',
      external_id: ids.feature(FEATURES.SCENE),
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.SELECT,
      read_only: false,
      has_feedback: true,
      keep_history: false,
      min: 0,
      max: 0,
      supported_options: options,
    });
  }

  const params = [
    // Upserted on every publication: a new DHCP lease reaches Gladys by itself.
    { name: 'IP_ADDRESS', value: entry.host },
    { name: 'MAC_ADDRESS', value: entry.gestalt?.mac ?? entry.platformId },
    { name: 'LED_COUNT', value: String(entry.ledCount ?? 0) },
  ];
  if (entry.productCode) {
    params.push({ name: 'PRODUCT_CODE', value: entry.productCode });
  }
  if (entry.firmware) {
    params.push({ name: 'FIRMWARE', value: entry.firmware });
  }

  return {
    name: entry.name,
    external_id: ids.device,
    model: entry.productCode ?? 'Twinkly',
    // Gladys polls at one of its own ticks in milliseconds (see config.js).
    // Since 5.3 the core sets should_poll itself next to a poll_frequency;
    // older cores only polled a device that carried it.
    should_poll: true,
    poll_frequency: gladysPollFrequency(config.refreshSeconds),
    params,
    features,
  };
}

/**
 * The scene value matching what the device plays.
 * @returns {Promise<string|null>}
 */
export async function readScene(entry, mode) {
  if (mode === LED_MODES.MOVIE) {
    const current = await entry.client.getCurrentMovie();
    const movie = (entry.movies ?? []).find(
      (m) => (current.unique_id && m.unique_id === current.unique_id) || m.id === current.id,
    );
    return movie ? `movie:${movieKey(movie)}` : null;
  }
  if (mode === LED_MODES.EFFECT) {
    return `effect:${await entry.client.getCurrentEffect()}`;
  }
  if (mode === LED_MODES.PLAYLIST) {
    return PLAYLIST_SCENE;
  }
  return null;
}

/**
 * Read everything Gladys shows of the device.
 * @returns {Promise<{mode: string, brightness: number, color: number|null, scene: string|null}>}
 */
export async function readState(entry) {
  const mode = await entry.client.getMode();
  const brightness = await entry.client.getBrightness();
  const color = entry.hasColor ? rgbToInt(await entry.client.getColor()) : null;
  // The scene is a nicety: a failure there must not hide the rest.
  const scene = await readScene(entry, mode).catch(() => entry.lastScene);
  return { mode, brightness, color, scene };
}

/** The Gladys states of a device state. */
export function statesOf(gladys, entry, state) {
  const ids = idsOf(gladys, entry);
  const states = [];
  if (state.mode !== undefined) {
    states.push({
      device_feature_external_id: ids.feature(FEATURES.ON_OFF),
      state: state.mode === LED_MODES.OFF ? 0 : 1,
    });
  }
  if (state.brightness !== undefined && state.brightness !== null) {
    states.push({
      device_feature_external_id: ids.feature(FEATURES.BRIGHTNESS),
      state: state.brightness,
    });
  }
  if (entry.hasColor && state.color !== undefined && state.color !== null) {
    states.push({ device_feature_external_id: ids.feature(FEATURES.COLOR), state: state.color });
  }
  if (state.scene && sceneOptions(entry).some((o) => o.value === state.scene)) {
    states.push({ device_feature_external_id: ids.feature(FEATURES.SCENE), text: state.scene });
  }
  return states;
}
