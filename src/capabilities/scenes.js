// -----------------------------------------------------------------------------
// Scenes (Gladys 5.1+).
//
// Triggers, fired by the poll of src/twinkly/service.js (one event per
// TRANSITION, never one per poll):
//
//   mode_changed      what a Twinkly plays changed OUTSIDE Gladys: the app, the
//                     button on the controller, its own timer. A change Gladys
//                     ordered never fires it — a scene "when the mode changes,
//                     set the mode" would loop through the integration.
//   device_offline    a Twinkly stopped answering (unplugged, Wi-Fi lost).
//   device_online     it answers again.
//
// Actions, handled below and registered by index.js with onSceneAction:
//
//   play_movie        play a movie uploaded from the app, by name or position
//   play_effect       play a built-in effect, by number
//   set_mode          on, off, movie, effect, playlist, solid color, demo
//
// Keys are stored by the scenes users write: never rename them.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'scenes' });

/** Keys of the manifest `scene_triggers`. */
export const SCENE_TRIGGERS = {
  MODE_CHANGED: 'mode_changed',
  DEVICE_OFFLINE: 'device_offline',
  DEVICE_ONLINE: 'device_online',
};

/** Values of the `mode` select of the `set_mode` action. */
export const SET_MODE_VALUES = ['on', 'off', 'movie', 'effect', 'playlist', 'color', 'demo'];

/**
 * Fire a scene trigger. Never throws: a scene event that could not be
 * delivered must not break the poll it came from.
 */
export async function fireTrigger(gladys, key, data) {
  try {
    await gladys.publishSceneEvent(key, data);
  } catch (err) {
    logger.warn(`Scene trigger ${key} not delivered: ${err?.message ?? err}`);
  }
}

/**
 * Scene action handlers, keyed by the manifest `scene_actions` key. `fields`
 * arrive resolved and validated by the core; a `"source": "devices"` field is
 * the chosen device external_id. Throwing fails this action only.
 */
export const SCENE_ACTIONS = {
  async play_movie(service, { fields }) {
    logger.info(`Scene action play_movie <- ${fields.device}`);
    const movie = await service.playMovie(fields.device, fields.movie);
    return { movie: movie.name };
  },

  async play_effect(service, { fields }) {
    logger.info(`Scene action play_effect <- ${fields.device}`);
    const effect = await service.playEffect(fields.device, Number(fields.effect));
    return { effect };
  },

  async set_mode(service, { fields }) {
    logger.info(`Scene action set_mode <- ${fields.device} = ${fields.mode}`);
    const mode = await service.applyMode(fields.device, fields.mode);
    return { mode };
  },
};
