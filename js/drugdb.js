// Nachschlagen in der Swissmedic-Liste der zugelassenen Packungen.
// data/swissmedic.json wird beim Veröffentlichen (GitHub Actions) frisch erzeugt
// und erst beim ersten Scan eines Schweizer Arzneimittels geladen.
import { swissmedicInfo } from './gs1.js';
import { useFromAtc, looksFrench, ATC_GROUPS, typeFromCode } from './knowledge.js';

let dbPromise = null;

function loadDb() {
  dbPromise ||= fetch('data/swissmedic.json')
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null);
  return dbPromise;
}

const FORM_RULES = [
  [/pflaster|plaster|verband|kompresse|binde\b|gaze|cerott|pansement|wundauflage/i, 'pflaster'],
  [/thermometer|pinzette|zecken|schere|handschuh|kühlkompresse|coolpack/i, 'medizinprodukt'],
  [/brause/i, 'brausetablette'],
  [/lutsch|pastill/i, 'lutschtablette'],
  [/augentropfen|augen.*tropfen|gtt\.? opht|augen/i, 'augentropfen'],
  [/ohrentropfen|ohren/i, 'ohrentropfen'],
  [/nasenspray|nasentropfen|nasal|nasen/i, 'nasenspray'],
  [/inhal|dosier-?aerosol|turbuhaler|diskus|ellipta|breezhaler/i, 'inhalator'],
  [/tabl|dragée|dragee/i, 'tablette'],
  [/kaps/i, 'kapsel'],
  [/sirup|saft|suspension zum einnehmen|lösung zum einnehmen/i, 'sirup'],
  [/tropfen/i, 'tropfen'],
  [/granulat|pulver|beutel|sachet/i, 'pulver'],
  [/salbe|creme|crème|gel|paste|emulsion/i, 'salbe'],
  [/supp|zäpfchen/i, 'zaepfchen'],
  [/pflaster|transdermal/i, 'pflaster'],
  [/spray/i, 'spray'],
  [/injektion|infusion|fertigspritze|pen\b|ampulle/i, 'injektion'],
  [/tinktur|lösung|loesung|desinf/i, 'loesung'],
];

export function guessForm(text) {
  for (const [rx, id] of FORM_RULES) if (rx.test(text)) return id;
  return null;
}

function mapUnit(u) {
  const s = String(u || '').toLowerCase();
  if (/^ml\b|milliliter/.test(s)) return 'ml';
  if (/^g\b|gramm/.test(s)) return 'g';
  if (/dos|hub|sprühstoss/.test(s)) return 'Dosen';
  if (/beutel|sachet/.test(s)) return 'Beutel';
  if (/ampull/.test(s)) return 'Ampullen';
  return 'Stk';
}

function extractStrength(name) {
  const m = /(\d+(?:[.,]\d+)?\s*(?:mg|µg|mcg|g|ie|i\.e\.|%)(?:\s*\/\s*\d*(?:[.,]\d+)?\s*(?:ml|g|dosis|hub))?)/i.exec(name);
  return m ? m[1].replace(/\s+/g, ' ') : '';
}

const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

/** Einfache Anwendung: ATC-Übersetzung, sonst deutscher Swissmedic-Text, sonst grobe Gruppe. */
function simpleUsage(atc, use) {
  const text = String(use || '').replace(/\s+/g, ' ').trim();
  return useFromAtc(atc)
    || (text && !looksFrench(text) ? cap(text) : '')
    || ATC_GROUPS[String(atc || '').trim().charAt(0).toUpperCase()]
    || '';
}

function rowToFields(row, { withQuantity = true } = {}) {
  const [name, substance, size, unit, category, atc, use, holder, code] = row;
  const qty = typeof size === 'number' ? size : parseFloat(String(size).replace(',', '.'));
  return {
    name,
    substance: cap(substance),
    strength: extractStrength(name),
    form: guessForm(`${name} ${unit}`),
    quantity: withQuantity && Number.isFinite(qty) ? qty : null,
    unit: mapUnit(unit),
    category: ['A', 'B', 'D', 'E'].includes(category) ? category : '',
    rx: category === 'A' || category === 'B' ? true : category ? false : null,
    // Einfache Erklärung nach ATC-Gruppe, sonst der Swissmedic-Text
    usage: simpleUsage(atc, use),
    atc: String(atc || '').trim(),
    manufacturer: String(holder || '').trim(),
    productType: typeFromCode(code),
    // genauere Anwendung laut Swissmedic (nur wenn deutsch)
    usageDetail: use && !looksFrench(use) ? cap(String(use).trim()) : '',
  };
}

/**
 * Liefert Formularwerte für eine GTIN oder null.
 * { name, substance, strength, form, quantity, unit, category, rx }
 */
export async function lookupSwissDrug(gtin) {
  const sm = swissmedicInfo(gtin);
  if (!sm) return null;
  const db = await loadDb();
  const row = db?.[sm.authNo + sm.packCode];
  return row ? rowToFields(row) : null;
}

// ---- Suche nach aufgedrucktem Text (Blister, Flasche, Tube) ----

const normText = s => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[®™©]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Wörter, die in vielen Namen vorkommen und allein nichts aussagen
const STOP = new Set(['tabletten', 'filmtabletten', 'kapseln', 'sirup', 'tropfen', 'losung', 'creme', 'salbe', 'spray',
  'mepha', 'sandoz', 'streuli', 'spirig', 'helvepharm', 'axapharm', 'teva', 'zentiva', 'mylan', 'viatris', 'retard',
  'forte', 'mite', 'plus', 'junior', 'kinder', 'brausetabletten', 'injektionslosung', 'suspension', 'zum', 'einnehmen']);

let products = null;
async function productIndex() {
  if (products) return products;
  const db = await loadDb();
  if (!db) return null;
  const byName = new Map();
  for (const row of Object.values(db)) {
    if (!byName.has(row[0])) byName.set(row[0], row);
  }
  products = [...byName.values()].map(row => {
    const words = normText(row[0]).split(' ');
    // Wirkstoffwörter im Namen (z. B. „Chlorhexidin“) sind keine Namensmerkmale
    const subs = normText(row[1]).split(' ').filter(x => x.length >= 6);
    // 7 gleiche Anfangsbuchstaben: „Chlorhexidin“ ~ „chlorhexidini“, aber „Echinaforce“ ≠ „echinaceae“
    const isSubstance = w => w.length >= 7 && subs.some(x => x.startsWith(w.slice(0, 7)));
    return {
      row,
      brand: words[0],
      words: words.filter(w => w.length >= 4 && !STOP.has(w) && !/^\d/.test(w) && !isSubstance(w)),
      numbers: words.filter(w => /^\d/.test(w)),
      substance: normText(row[1]).split(' ')[0] || '',
    };
  });
  return products;
}

function lev1(a, b) {
  // true, wenn a und b sich höchstens um einen Buchstaben unterscheiden (OCR-Fehler)
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Sucht Medikamente anhand von erkanntem Text. Gibt bis zu `limit` Vorschläge
 * mit Formularwerten zurück (ohne Packungsgrösse, die ist bei losen Blistern unbekannt).
 */
// Allgemeine Wörter, die in vielen Produktnamen vorkommen und allein nichts aussagen
const GENERIC = new Set(['tabletten', 'filmtabletten', 'lutschtabletten', 'brausetabletten', 'schmelztabletten', 'kautabletten',
  'kapseln', 'weichkapseln', 'tropfen', 'augentropfen', 'nasentropfen', 'ohrentropfen', 'losung', 'loesung', 'creme', 'salbe',
  'sirup', 'spray', 'nasenspray', 'granulat', 'pulver', 'suspension', 'emulsion', 'zapfchen', 'suppositorien', 'pflaster',
  'injektionslosung', 'injektionssuspension', 'durchstechflaschen', 'durchstechflasche', 'fertigspritze', 'anwendung',
  'mundhohle', 'einnehmen', 'erkaltung', 'resistenz', 'praparat', 'frischpflanzen', 'classic', 'kinder', 'junior', 'forte',
  'retard', 'rapid', 'extra', 'plus', 'akut', 'solution', 'pommade', 'comprimes', 'pelliculés', 'capsules', 'gouttes',
  'cutanee', 'application', 'buvable', 'sirop', 'injectable', 'baume', 'schmerz', 'husten', 'schlaf', 'magen', 'allergie',
  'pflanzlich', 'homoopathisch', 'arzneimittel', 'medikament', 'packung', 'inhalt', 'dosierung']);

/**
 * Vorschläge anhand des Texts auf dem Frontfoto. Bewusst streng: nur wenn ein
 * eindeutiges, langes Namenswort (z. B. „Echinaforce“, „Merfen“) auf dem Foto steht.
 * Lieber kein Vorschlag als ein falscher.
 */
export async function searchByText(text, limit = 3) {
  const idx = await productIndex();
  if (!idx) return [];
  const tokens = new Set(normText(text).split(' ').filter(t => t.length >= 4));
  const list = [...tokens];
  // unscharf: Texterkennung liest z. B. „Merfe“ statt „Merfen“ (® stört) oder vertauscht einen Buchstaben
  const has = w => tokens.has(w)
    || list.some(t => t.length >= 5 && lev1(t, w))
    || list.some(t => t.length >= 5 && w.startsWith(t) && w.length - t.length <= 1);
  const nums = new Set((String(text).match(/\d+(?:[.,]\d+)?/g) || []).map(n => n.replace(',', '.')));

  const scored = [];
  for (const p of idx) {
    const distinctive = p.words.filter(w => w.length >= 6 && !GENERIC.has(w));
    let score = 0;
    for (const w of distinctive) if (has(w)) score += w === p.brand ? 10 : 6;
    if (!score) continue;
    for (const n of p.numbers) if (nums.has(n) || nums.has(n.replace(',', '.'))) score += 2;
    // Darreichungsform auf dem Foto (z. B. „Tropfen“) passt zum Produktnamen
    for (const w of normText(p.row[0]).split(' ')) if (GENERIC.has(w) && tokens.has(w)) score += 3;
    scored.push({ score, p });
  }
  scored.sort((a, b) => b.score - a.score || a.p.row[0].length - b.p.row[0].length);
  return scored.slice(0, limit).map(({ p }) => rowToFields(p.row, { withQuantity: false }));
}

/** Namenssuche beim Eintippen: alle Suchwörter müssen im Produktnamen vorkommen. */
export async function searchByName(query, limit = 8) {
  const idx = await productIndex();
  const q = normText(query).split(' ').filter(Boolean);
  if (!idx || !q.length || q.join('').length < 3) return [];
  const hits = [];
  for (const p of idx) {
    const name = normText(p.row[0]);
    if (!q.every(w => name.includes(w))) continue;
    hits.push({ p, starts: name.startsWith(q[0]) || name.split(' ').some(x => x.startsWith(q[0])) });
  }
  hits.sort((a, b) => (b.starts - a.starts) || a.p.row[0].length - b.p.row[0].length);
  return hits.slice(0, limit).map(({ p }) => rowToFields(p.row, { withQuantity: false }));
}
