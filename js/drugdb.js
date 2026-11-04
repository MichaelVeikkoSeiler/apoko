// Nachschlagen in der Swissmedic-Liste der zugelassenen Packungen.
// data/swissmedic.json wird beim Veröffentlichen (GitHub Actions) frisch erzeugt
// und erst beim ersten Scan eines Schweizer Arzneimittels geladen.
import { swissmedicInfo } from './gs1.js';

let dbPromise = null;

function loadDb() {
  dbPromise ||= fetch('data/swissmedic.json')
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null);
  return dbPromise;
}

const FORM_RULES = [
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

function guessForm(text) {
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

/**
 * Liefert Formularwerte für eine GTIN oder null.
 * { name, substance, strength, form, quantity, unit, category, rx }
 */
export async function lookupSwissDrug(gtin) {
  const sm = swissmedicInfo(gtin);
  if (!sm) return null;
  const db = await loadDb();
  const row = db?.[sm.authNo + sm.packCode];
  if (!row) return null;
  const [name, substance, size, unit, category] = row;
  const qty = typeof size === 'number' ? size : parseFloat(String(size).replace(',', '.'));
  return {
    name,
    substance: cap(substance),
    strength: extractStrength(name),
    form: guessForm(`${name} ${unit}`),
    quantity: Number.isFinite(qty) ? qty : null,
    unit: mapUnit(unit),
    category: ['A', 'B', 'D', 'E'].includes(category) ? category : '',
    rx: category === 'A' || category === 'B' ? true : category ? false : null,
  };
}
