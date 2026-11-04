// Ausführen mit: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBarcode, gs1Date, gtinValid, swissmedicInfo } from '../js/gs1.js';

const GS = '\u001d';

test('GS1-DataMatrix einer Schweizer Packung', () => {
  const r = parseBarcode(`]d2010768012345678117271231` + `10AB12C${GS}21SN9876543`);
  assert.equal(r.type, 'gs1');
  assert.equal(r.gtin, '07680123456781');
  assert.equal(r.expiry, '2027-12-31');
  assert.equal(r.batch, 'AB12C');
  assert.equal(r.serial, 'SN9876543');
});

test('Herstelldatum (11) und Tag 00 = Monatsende', () => {
  const r = parseBarcode(`010768012345678111250315172802001012345`);
  assert.equal(r.prodDate, '2025-03-15');
  assert.equal(r.expiry, '2028-02-29');
  assert.equal(r.batch, '12345');
});

test('Klarschrift mit Klammern', () => {
  const r = parseBarcode('(01)07680123456781(17)290630(10)X1');
  assert.equal(r.expiry, '2029-06-30');
  assert.equal(r.batch, 'X1');
});

test('EAN-13 mit gültiger Prüfziffer', () => {
  assert.ok(gtinValid('7680123456781'));
  const r = parseBarcode('7680123456781');
  assert.equal(r.type, 'gtin');
  assert.equal(r.gtin, '07680123456781');
  assert.equal(r.expiry, undefined);
});

test('Ungültige Prüfziffer wird nicht als GTIN erkannt', () => {
  assert.equal(gtinValid('7680123456782'), false);
});

test('Swissmedic-Zulassungsnummer', () => {
  assert.deepEqual(swissmedicInfo('07680123456781'), { authNo: '12345', packCode: '678' });
  assert.equal(swissmedicInfo('4006381333931'), null);
});

test('Ungültige Daten', () => {
  assert.equal(gs1Date('271331'), null);
  assert.equal(gs1Date('270230'), null);
});

test('Beliebiger Text', () => {
  assert.equal(parseBarcode('hallo welt').type, 'text');
});
