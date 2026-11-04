import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExpiryText } from '../js/dates.js';

const cases = [
  ['EXP 08/2027', { expiry: '2027-08-31' }],
  ['Verw. bis: 31.08.2027', { expiry: '2027-08-31' }],
  ['EXP: 2027-08', { expiry: '2027-08-31' }],
  ['Verwendbar bis 08 2027', { expiry: '2027-08-31' }],
  ['SCAD. 08/27', { expiry: '2027-08-31' }],
  ['EXP AUG 2027', { expiry: '2027-08-31' }],
  ['MFG 03/2025\nEXP 02/2028', { expiry: '2028-02-29', prodDate: '2025-03-31' }],
  ['Herg.: 15.03.2025  Verw. bis: 14.03.2028', { expiry: '2028-03-14', prodDate: '2025-03-15' }],
  ['Ch.-B.: A1234B  EXP 12/2026', { expiry: '2026-12-31', batch: 'A1234B' }],
  ['LOT 22106359 EXP 2029/01', { expiry: '2029-01-31', batch: '22106359' }],
  ['EXP O8/2O27', { expiry: '2027-08-31' }], // Lesefehler O statt 0
  ['10 Tabletten 500 mg', {}],
  ['03/2025 02/2028', { expiry: '2028-02-29', prodDate: '2025-03-31' }],
];

for (const [text, want] of cases) {
  test(JSON.stringify(text), () => {
    const got = parseExpiryText(text);
    for (const k of ['expiry', 'prodDate', 'batch']) assert.equal(got[k], want[k], k);
  });
}
