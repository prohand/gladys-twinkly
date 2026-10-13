import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LANGUAGES,
  MODE_LABELS,
  joinTexts,
  mapText,
  modeLabel,
  sameText,
} from '../src/twinkly/labels.js';

test('user-facing texts are in English, French, German and Spanish', () => {
  assert.deepEqual(LANGUAGES, ['en', 'fr', 'de', 'es']);
  for (const [mode, label] of Object.entries(MODE_LABELS)) {
    assert.deepEqual(Object.keys(label), LANGUAGES, mode);
  }
});

test('an unknown mode keeps its raw word in every language', () => {
  assert.deepEqual(modeLabel('weird'), { en: 'weird', fr: 'weird', de: 'weird', es: 'weird' });
});

test('mapText builds every language and falls back to English', () => {
  assert.deepEqual(
    mapText({ en: 'Movie', fr: 'Animation' }, (text, lang) => `${lang}:${text}`),
    { en: 'en:Movie', fr: 'fr:Animation', de: 'de:Movie', es: 'es:Movie' },
  );
  assert.deepEqual(sameText('Firmware'), {
    en: 'Firmware',
    fr: 'Firmware',
    de: 'Firmware',
    es: 'Firmware',
  });
});

test('joinTexts joins language by language', () => {
  assert.deepEqual(joinTexts([modeLabel('off'), sameText('!')]), {
    en: 'Off !',
    fr: 'Éteint !',
    de: 'Aus !',
    es: 'Apagado !',
  });
});
