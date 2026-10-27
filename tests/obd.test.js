import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseResponse, decodeDtc, encodeDtc, parseVin, parseDtcCount, parseDtcList, udsGuard, readiness } from '../js/obd.js';
import { Elm } from '../js/elm.js';
import { SimTransport } from '../js/sim.js';
import { inspect, describe, score } from '../js/scan.js';

test('parser: real Kodiaq replies', () => {
  assert.deepEqual(parseResponse('SEARCHING...\r41 00 BE 3E A8 13 \r\r>'), [[0x41, 0, 0xbe, 0x3e, 0xa8, 0x13]]);
  const vin = parseResponse('014\r0: 49 02 01 54 4D 42\r1: 4A 42 39 4E 53 34 50\r2: 38 30 34 34 31 38 36\r\r>');
  assert.equal(parseVin(vin), 'TMBJB9NS4P8044186');
  assert.deepEqual(parseResponse('NO DATA\r\r>'), []);
  assert.throws(() => parseResponse('UNABLE TO CONNECT\r\r>'));
  assert.throws(() => parseResponse('00B\r0: 59 02 0D 00 5C D5\r\r>'));          // incomplete multi-frame
});
test('DTC decode / encode', () => {
  assert.equal(decodeDtc(0x2b, 0x60), 'P2B60');
  assert.equal(decodeDtc(0xc1, 0x00), 'U0100');
  assert.deepEqual(encodeDtc('P0301'), [0x03, 0x01]);
  assert.deepEqual(parseDtcCount([0x59, 1, 0xff, 1, 0, 2]), { format: 1, count: 2 });
  assert.equal(parseDtcList([0x59, 2, 0xff, 0, 0x5c, 0xd5, 9], 1)[0].code, 'VAG 23765 (0x005CD5)');
});
test('read-only guard', () => {
  assert.throws(() => udsGuard([0x2e, 0xf1, 0x90]));
  assert.throws(() => udsGuard([0x27, 1]));
  assert.throws(() => udsGuard([0x10, 2]));
  udsGuard([0x22, 0xf1, 0x90]); udsGuard([0x19, 2, 0xff]); udsGuard([0x3e, 0]);
});
test('readiness of the real Kodiaq', () => {
  const r = readiness([0x81, 0x07, 0xe1, 0x00]);
  assert.equal(r.mil, true); assert.ok(r.monitors.every(m => m.complete));
});
test('full inspection on the Kodiaq replay', async () => {
  const elm = new Elm(new SimTransport('kodiaq'));
  await elm.init();
  const r = await inspect(elm, { make: 'Skoda' });
  assert.deepEqual(r.codes.stored, ['P2B60']);
  assert.ok(r.findings.some(f => f.code === 'P2B60' && f.zone === 'cooling'));
  assert.equal(r.modules.filter(m => m.responded).map(m => m.addr).join(), '01');
  assert.equal(r.modules[0].count, 2);
  assert.equal(Math.round(r.live[0xa6]), 93955);
  assert.ok(r.score > 60 && r.score < 100);
});
test('demo car finds the weak cylinder and the codes', async () => {
  const elm = new Elm(new SimTransport('demo'));
  await elm.init();
  const r = await inspect(elm);
  assert.ok(r.findings.some(f => f.zone === 'cyl1' && f.system === 'engine'));
  assert.ok((await describe('P0301')).ar.includes('الأسطوانة 1'));
  assert.ok((await describe('P2BAE')).ext);
  assert.equal(score([]), 100);
});

test('car recognised from the VIN', async () => {
  const { decodeVin } = await import('../js/vin.js');
  const k = decodeVin('TMBJB9NS4P8044186');
  assert.equal(k.make, 'Skoda'); assert.equal(k.model, 'Kodiaq'); assert.equal(k.year, 2023); assert.equal(k.body, 'suv');
  assert.equal(decodeVin('WAUZZZF4XLA012345').model, 'A4');
  assert.equal(decodeVin('WVWZZZCDZMW123456').model, 'Golf 8');
  assert.equal(decodeVin('JTDKB20U093123456').make, 'Toyota');
});
test('English dictionary covers the visible page', async () => {
  const fs = await import('node:fs');
  const { EN } = await import('../js/i18n.js');
  const keys = Object.keys(EN).sort((a, b) => b.length - a.length);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/<style>[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '');
  const left = [...html.matchAll(/>([^<>]*[؀-ۿ][^<>]*)</g)].map(m => { let t = m[1]; for (const k of keys) t = t.split(k).join(EN[k]); return t; })
    .filter(t => /[؀-ۿ]/.test(t));
  assert.deepEqual(left, []);
});
