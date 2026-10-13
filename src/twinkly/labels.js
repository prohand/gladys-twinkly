// -----------------------------------------------------------------------------
// Multi-language names of what a Twinkly does, for the messages, the widget and
// the connection report. The API words (`movie`, `rt`...) are not for users.
//
// Every user-facing text is an `{ en, fr, de, es }` object: the core renders
// it in the reader's language and falls back to `en` for any other one. The
// helpers below build such objects so the call sites never list the languages.
// -----------------------------------------------------------------------------

import { LED_MODES } from './client.js';

/** Languages of every user-facing text. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const MODE_LABELS = {
  [LED_MODES.OFF]: { en: 'Off', fr: 'Éteint', de: 'Aus', es: 'Apagado' },
  [LED_MODES.COLOR]: { en: 'Solid color', fr: 'Couleur fixe', de: 'Feste Farbe', es: 'Color fijo' },
  [LED_MODES.DEMO]: { en: 'Demo', fr: 'Démo', de: 'Demo', es: 'Demo' },
  [LED_MODES.EFFECT]: { en: 'Effect', fr: 'Effet', de: 'Effekt', es: 'Efecto' },
  [LED_MODES.MOVIE]: { en: 'Movie', fr: 'Animation', de: 'Animation', es: 'Animación' },
  [LED_MODES.PLAYLIST]: {
    en: 'Playlist',
    fr: 'Playlist',
    de: 'Playlist',
    es: 'Lista de reproducción',
  },
  [LED_MODES.RT]: { en: 'Real time', fr: 'Temps réel', de: 'Echtzeit', es: 'Tiempo real' },
};

/**
 * The same string in every language: a device name, a movie name, a number.
 * @param {string} text
 */
export function sameText(text) {
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, text]));
}

/**
 * A text built from another one, language by language. A language the source
 * lacks starts from its English.
 * @param {Record<string, string>} text
 * @param {(value: string, lang: string) => string} build
 */
export function mapText(text, build) {
  return Object.fromEntries(
    LANGUAGES.map((lang) => [lang, build(text?.[lang] ?? text?.en ?? '', lang)]),
  );
}

/**
 * Several texts joined into one, language by language.
 * @param {Array<Record<string, string>>} texts
 * @param {string} [separator]
 */
export function joinTexts(texts, separator = ' ') {
  return Object.fromEntries(
    LANGUAGES.map((lang) => [lang, texts.map((text) => text[lang] ?? text.en).join(separator)]),
  );
}

/** Multi-language name of a LED mode, the raw word for an unknown one. */
export function modeLabel(mode) {
  return MODE_LABELS[mode] ?? sameText(String(mode));
}
