import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import {
  BUTTON_SETS,
  COLOR_PRESETS,
  OVERVIEW_WIDGET,
  WIDGETS,
  WIDGET_ACTIONS,
  buildOverview,
  refreshWidgets,
} from '../src/capabilities/widget.js';
import { makeDevice } from './helpers/fakeTwinkly.js';
import { gladysDevice, setup } from './helpers/setup.js';

test('without any Twinkly the widget says where to add one', async () => {
  const { service } = setup({ devices: {}, config: { hosts: '' } });
  const content = buildOverview(service);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].type, 'text');
});

test('one status row per Twinkly, and the two buttons', async () => {
  const lost = makeDevice();
  const { service } = setup({
    devices: {
      '192.168.1.40': makeDevice(),
      '192.168.1.41': lost,
      '192.168.1.42': makeDevice({ mode: 'off' }),
    },
  });
  await service.discover();
  const [playing, gone, off] = service.registry.all();
  await service.poll(gladysDevice(service, playing));
  await service.poll(gladysDevice(service, off));
  lost.reachable = false;
  await service.poll(gladysDevice(service, gone));

  const content = buildOverview(service);
  assert.deepEqual(validateWidgetContent(content), []);
  const [status, allOn, allOff] = content.components;
  assert.deepEqual(
    status.items.map((item) => [item.value.fr, item.color]),
    [
      ['Animation · 80 %', 'success'],
      ['Injoignable', 'danger'],
      ['Éteint', 'neutral'],
    ],
  );
  assert.equal(allOn.action.key, WIDGET_ACTIONS.ALL_ON);
  assert.equal(allOff.action.key, WIDGET_ACTIONS.ALL_OFF);
});

test('a device not read yet says so', async () => {
  const { service } = setup();
  await service.discover();
  const [status] = buildOverview(service).components;
  assert.equal(status.items[0].value.en, 'Not read yet');
});

test('the buttons switch everything and answer with a toast', async () => {
  const device = makeDevice();
  const { service } = setup({ devices: { '192.168.1.40': device } });
  await service.discover();
  const widget = WIDGETS[OVERVIEW_WIDGET];
  assert.deepEqual(await widget.action(service, { actionKey: WIDGET_ACTIONS.ALL_OFF }), {
    en: '1 Twinkly off.',
    fr: '1 Twinkly éteint(s).',
  });
  assert.equal(device.mode, 'off');
  await widget.action(service, { actionKey: WIDGET_ACTIONS.ALL_ON });
  assert.equal(device.mode, 'movie');
  device.reachable = false;
  assert.match(
    (await widget.action(service, { actionKey: WIDGET_ACTIONS.ALL_ON })).fr,
    /1 sans réponse/,
  );
  await assert.rejects(widget.action(service, { actionKey: 'nope' }), /Unknown widget action/);
});

test('refreshWidgets nudges every widget', () => {
  const { gladys } = setup();
  refreshWidgets(gladys);
  assert.deepEqual(gladys.widgetRefreshes, [OVERVIEW_WIDGET]);
});

// --- One-device cards ----------------------------------------------------------

async function oneDevice(overrides) {
  const device = makeDevice(overrides);
  const ctx = setup({ devices: { '192.168.1.40': device } });
  await ctx.service.discover();
  const [entry] = ctx.service.registry.all();
  await ctx.service.poll(gladysDevice(ctx.service, entry));
  const externalId = gladysDevice(ctx.service, entry).external_id;
  const widget = WIDGETS[OVERVIEW_WIDGET];
  const get = (buttons) => widget.get(ctx.service, { settings: { device: externalId, buttons } });
  const tap = (actionKey) =>
    widget.action(ctx.service, { actionKey, settings: { device: externalId } });
  return { ...ctx, device, entry, externalId, get, tap };
}

const buttonsOf = (content) => content.components.filter((c) => c.type === 'button');

test('every button set of a one-device card fits the widget budget', async () => {
  const { get, externalId } = await oneDevice();
  for (const set of [...Object.values(BUTTON_SETS), undefined, 'unknown']) {
    const content = get(set);
    assert.deepEqual(validateWidgetContent(content), [], String(set));
    assert.ok(buttonsOf(content).length >= 1 && buttonsOf(content).length <= 4, String(set));
  }
  const content = get(BUTTON_SETS.SCENES);
  assert.equal(content.components[0].text, 'Twinkly_' + externalId.slice(-2).toUpperCase());
  const gauge = content.components.find((c) => c.type === 'gauge');
  assert.equal(gauge.device_feature, `${externalId}:brightness`);
  const status = content.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => item.value.fr ?? item.value),
    ['Animation · 80 %', 'Snowfall', '#ff0000', '192.168.1.40', 250, '2.8.3'],
  );
});

test('the on/off button follows the device state', async () => {
  const { get, tap, device } = await oneDevice();
  assert.equal(buttonsOf(get())[0].action.key, WIDGET_ACTIONS.TURN_OFF);
  assert.deepEqual(await tap(WIDGET_ACTIONS.TURN_OFF), {
    en: 'Twinkly off.',
    fr: 'Twinkly éteint.',
  });
  assert.equal(device.mode, 'off');
  assert.equal(buttonsOf(get())[0].action.key, WIDGET_ACTIONS.TURN_ON);
  await tap(WIDGET_ACTIONS.TURN_ON);
  assert.equal(device.mode, 'movie');
});

test('previous / next scene loop through the scene list', async () => {
  const { tap, device } = await oneDevice();
  // Snowfall -> Fireworks -> Playlist -> Effect 1 ... -> back to Snowfall.
  assert.equal((await tap(WIDGET_ACTIONS.NEXT_SCENE)).fr, 'Lecture : Fireworks.');
  assert.equal(device.currentMovie, 1);
  assert.equal((await tap(WIDGET_ACTIONS.NEXT_SCENE)).fr, 'Lecture : Playlist.');
  assert.equal(device.mode, 'playlist');
  assert.equal((await tap(WIDGET_ACTIONS.NEXT_SCENE)).fr, 'Lecture : Effet 1.');
  assert.equal(device.mode, 'effect');
  assert.equal((await tap(WIDGET_ACTIONS.PREVIOUS_SCENE)).fr, 'Lecture : Playlist.');
  await tap(WIDGET_ACTIONS.PREVIOUS_SCENE);
  await tap(WIDGET_ACTIONS.PREVIOUS_SCENE);
  assert.equal((await tap(WIDGET_ACTIONS.PREVIOUS_SCENE)).fr, 'Lecture : Effet 5.');
});

test('the brightness buttons step, stop at the bounds and go to max', async () => {
  const { tap, device } = await oneDevice({ brightness: 15 });
  assert.equal((await tap(WIDGET_ACTIONS.BRIGHTNESS_UP)).fr, 'Luminosité 25 %.');
  assert.equal(device.brightness, 25);
  await tap(WIDGET_ACTIONS.BRIGHTNESS_DOWN);
  await tap(WIDGET_ACTIONS.BRIGHTNESS_DOWN);
  assert.equal(device.brightness, 10, 'never below the step: lit at 0 % looks off');
  await tap(WIDGET_ACTIONS.BRIGHTNESS_MAX);
  assert.equal(device.brightness, 100);
  await tap(WIDGET_ACTIONS.BRIGHTNESS_UP);
  assert.equal(device.brightness, 100);
});

test('the modes set offers what the device can play', async () => {
  const { get, tap, device } = await oneDevice();
  const modes = buttonsOf(get(BUTTON_SETS.MODES)).slice(1);
  assert.deepEqual(
    modes.map((b) => b.action.key),
    ['mode_movie', 'mode_playlist', 'mode_color'],
  );
  assert.equal((await tap('mode_playlist')).fr, 'Mode : Playlist.');
  assert.equal(device.mode, 'playlist');
  await assert.rejects(tap('mode_demo'), /Unknown widget action/);
});

test('the colors set shows a preset color', async () => {
  const { get, tap, device } = await oneDevice({ mode: 'off' });
  const colors = buttonsOf(get(BUTTON_SETS.COLORS));
  assert.deepEqual(
    colors.map((b) => b.action.key),
    COLOR_PRESETS.map((p) => `color_${p.key}`),
  );
  assert.equal((await tap('color_blue')).fr, 'Couleur : Bleu.');
  assert.deepEqual(device.color, { red: 0, green: 0, blue: 255 });
  assert.equal(device.mode, 'color');
  await assert.rejects(tap('color_pink'), /Unknown widget action/);
});

test('identify runs from the card', async () => {
  const { tap, waits } = await oneDevice();
  assert.match((await tap(WIDGET_ACTIONS.IDENTIFY)).fr, /démo/);
  assert.equal(waits.length, 1);
});

test('a lost device shows no buttons, an unknown one says so', async () => {
  const { get, service, device, entry } = await oneDevice();
  device.reachable = false;
  await service.poll(gladysDevice(service, entry));
  const content = get();
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(buttonsOf(content).length, 0);

  const unknown = WIDGETS[OVERVIEW_WIDGET].get(service, { settings: { device: 'twinkly:nope' } });
  assert.deepEqual(validateWidgetContent(unknown), []);
  assert.equal(unknown.components[0].type, 'text');
});

test('a device button without a device in the settings is refused', async () => {
  const { service } = setup();
  await assert.rejects(
    WIDGETS[OVERVIEW_WIDGET].action(service, { actionKey: WIDGET_ACTIONS.NEXT_SCENE }),
    /needs a Twinkly/,
  );
});
