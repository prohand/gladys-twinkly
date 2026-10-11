import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import {
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
