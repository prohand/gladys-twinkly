// -----------------------------------------------------------------------------
// Bilingual names of what a Twinkly does, for the messages, the widget and the
// connection report. The API words (`movie`, `rt`...) are not for users.
// -----------------------------------------------------------------------------

import { LED_MODES } from './client.js';

export const MODE_LABELS = {
  [LED_MODES.OFF]: { en: 'Off', fr: 'Éteint' },
  [LED_MODES.COLOR]: { en: 'Solid color', fr: 'Couleur fixe' },
  [LED_MODES.DEMO]: { en: 'Demo', fr: 'Démo' },
  [LED_MODES.EFFECT]: { en: 'Effect', fr: 'Effet' },
  [LED_MODES.MOVIE]: { en: 'Movie', fr: 'Animation' },
  [LED_MODES.PLAYLIST]: { en: 'Playlist', fr: 'Playlist' },
  [LED_MODES.RT]: { en: 'Real time', fr: 'Temps réel' },
};

/** `{ en, fr }` name of a LED mode, the raw word for an unknown one. */
export function modeLabel(mode) {
  return MODE_LABELS[mode] ?? { en: String(mode), fr: String(mode) };
}
