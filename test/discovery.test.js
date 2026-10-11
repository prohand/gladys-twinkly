import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISCOVERY_PAYLOAD,
  DISCOVERY_PORT,
  parseDiscoveryReply,
  scanForTwinkly,
} from '../src/twinkly/discovery.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

function replyFor(ip, name) {
  const bytes = ip.split('.').map(Number).reverse();
  return Buffer.concat([
    Buffer.from(bytes),
    Buffer.from('OK'),
    Buffer.from(name),
    Buffer.from([0]),
  ]);
}

test('the discovery request is 0x01 then "discover"', () => {
  assert.equal(DISCOVERY_PAYLOAD.toString('hex'), '01646973636f766572');
  assert.equal(DISCOVERY_PORT, 5555);
});

test('a reply gives the address and the name', () => {
  assert.deepEqual(parseDiscoveryReply(replyFor('192.168.1.40', 'Twinkly_33AAFF')), {
    host: '192.168.1.40',
    name: 'Twinkly_33AAFF',
  });
  // The address the datagram came from wins: it is the one that routes back.
  assert.equal(parseDiscoveryReply(replyFor('10.0.0.1', 'X'), '192.168.1.9').host, '192.168.1.9');
});

test('anything else is not a Twinkly', () => {
  assert.equal(parseDiscoveryReply(Buffer.from('hello world')), null);
  assert.equal(parseDiscoveryReply(Buffer.from([1, 2])), null);
  assert.equal(parseDiscoveryReply('OK'), null);
});

test('the scan goes through the Gladys core and dedupes the replies', async () => {
  const reply = replyFor('192.168.1.40', 'Tree').toString('base64');
  const gladys = createFakeGladys({
    scanReplies: [
      { source_ip: '192.168.1.40', source_port: 5555, payload_base64: reply },
      { source_ip: '192.168.1.40', source_port: 5555, payload_base64: reply },
      { source_ip: '192.168.1.99', source_port: 5555, payload_base64: 'bm9pc2U=' },
    ],
  });
  const result = await scanForTwinkly(gladys);
  assert.deepEqual(result, { hosts: [{ host: '192.168.1.40', name: 'Tree' }], error: null });
  assert.equal(gladys.scans[0].type, 'udp-active-broadcast');
  assert.equal(gladys.scans[0].options.port, 5555);
});

test('a core that refuses the scan gives no host, and says why', async () => {
  const gladys = createFakeGladys({ scanError: new Error('403 Forbidden') });
  assert.deepEqual(await scanForTwinkly(gladys), { hosts: [], error: '403 Forbidden' });
});
