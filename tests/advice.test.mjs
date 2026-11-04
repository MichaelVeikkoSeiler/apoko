import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSymptoms, adviseFor, matchScore, SYMPTOMS } from '../js/advice.js';

const st = item => ({ status: item.expiry < '2026-01-01' ? 'expired' : 'ok', days: 100 });
const items = [
  { id: 1, name: 'Dafalgan 500 mg, Tabletten', atc: 'N02BE01', expiry: '2028-03-31' },
  { id: 2, name: 'Ibuprofen Sandoz 400 mg', atc: 'M01AE01', expiry: '2028-01-31', rx: true },
  { id: 3, name: 'Merfen, Tinktur', atc: 'D08AC52', expiry: '2028-01-31' },
  { id: 4, name: 'M-Plast Transparentverband', form: 'pflaster', expiry: '2029-01-31' },
  { id: 5, name: 'Aspirin-C, Brausetabletten', atc: 'N02BA51', expiry: '2025-01-31' },
  { id: 6, name: 'Iberogast Classic', atc: 'A16AX', expiry: '2028-01-31' },
  { id: 7, name: 'Hustensirup', usage: 'Löst Schleim bei Husten', expiry: '2028-01-31' }, // ohne ATC
];

test('Freitext erkennt Beschwerden', () => {
  assert.deepEqual(detectSymptoms('Ich habe Kopfweh und etwas Fieber'), ['kopf', 'fieber']);
  assert.deepEqual(detectSymptoms('Schürfwunde am Knie'), ['wunde']);
  assert.deepEqual(detectSymptoms('seit 3 Tagen Husten, regelmässig'), ['husten']);
  assert.deepEqual(detectSymptoms('Blut im Stuhl und Durchfall'), ['durchfall']);
  assert.deepEqual(detectSymptoms('Menschen mit Wadenkrampf'), ['muskel']);
  assert.deepEqual(detectSymptoms(''), []);
});

test('Kopfschmerzen: Paracetamol frei, Ibuprofen rezeptpflichtig getrennt, abgelaufenes Aspirin nicht empfohlen', () => {
  const [r] = adviseFor(['kopf'], items, st);
  assert.deepEqual(r.use.map(h => h.item.id), [1]);
  assert.deepEqual(r.rx.map(h => h.item.id), [2]);
  assert.deepEqual(r.expired.map(h => h.item.id), [5]);
});

test('Wunde: Desinfektion über ATC, Pflaster über Darreichungsform', () => {
  const [r] = adviseFor(['wunde'], items, st);
  assert.deepEqual(r.use.map(h => h.item.id), [3, 4]);
});

test('Bauchkrämpfe: Iberogast (A16AX)', () => {
  const [r] = adviseFor(['bauch'], items, st);
  assert.deepEqual(r.use.map(h => h.item.id), [6]);
});

test('Ohne ATC: Treffer über Anwendung', () => {
  const husten = SYMPTOMS.find(s => s.id === 'husten');
  assert.ok(matchScore(items[6], husten) > 0);
});

test('Jede Beschwerde hat Warnzeichen, Tipp und Apotheken-Hinweis', () => {
  for (const s of SYMPTOMS) assert.ok(s.red && s.tip && s.ask && s.syn.length && s.atc.length, s.id);
});

import { personCheck, DEFAULT_PEOPLE } from '../js/advice.js';
const [mann, frau, kind1, kind2] = DEFAULT_PEOPLE;

test('Personen: Aspirin nicht unter 16, Loperamid nicht unter 12', () => {
  const asp = { name: 'Aspirin-C', atc: 'N02BA51' };
  const imo = { name: 'Imodium', atc: 'A07DA03' };
  assert.equal(personCheck(asp, mann).block, undefined);
  assert.ok(personCheck(asp, kind1).block);
  assert.ok(personCheck(imo, kind2).block);
  assert.equal(personCheck(imo, frau).block, undefined);
});

test('Kinder: Erwachsenenstärke markiert, sonst allgemeiner Hinweis', () => {
  assert.match(personCheck({ name: 'Dafalgan 500 mg, Tabletten', atc: 'N02BE01' }, kind1).caution, /Erwachsenenstärke/);
  assert.match(personCheck({ name: 'Algifor Junior Sirup 100 mg/5 ml', atc: 'M01AE01' }, kind2).note, /Packungsbeilage/);
  assert.deepEqual(personCheck({ name: 'Dafalgan 500 mg', atc: 'N02BE01' }, mann), {});
});

test('Rezeptpflichtig: nur für die verschriebene Person', () => {
  const ibu = { id: 9, name: 'Ibuprofen 600 mg', atc: 'M01AE01', rx: true, person: 'Mann', expiry: '2028-01-31' };
  const [rMann] = adviseFor(['kopf'], [ibu], st, mann);
  const [rFrau] = adviseFor(['kopf'], [ibu], st, frau);
  assert.equal(rMann.rx.length, 1);
  assert.equal(rFrau.rx.length, 0);
  assert.equal(rFrau.rxOther.length, 1);
});
