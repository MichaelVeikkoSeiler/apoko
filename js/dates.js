// Ablauf- und Herstelldatum aus gelesenem Packungstext herausfinden.
// Typische Aufdrucke: "EXP 08/2027", "Verw. bis 31.08.2027", "EXP: 2027-08",
// "Verwendbar bis 08 2027", "SCAD. 08/27", "MFG 03/2025", "Ch.-B./LOT A1234".

const EXP_KEYS = /(exp|verw|verfall|ablauf|haltbar|use\s*by|utiliser|util\.|scad|val\.?|best)/i;
const MFG_KEYS = /(mfg|mfd|herg|herst|prod|fabr|manuf|datum der herst)/i;
const LOT_RX = /(?:lot|ch\.?\s*-?\s*b\.?|charge|batch)\s*[:.]?\s*([A-Z0-9][A-Z0-9-]{2,15})/i;

const MONTHS = {
  jan: 1, feb: 2, fev: 2, mar: 3, mrz: 3, mae: 3, apr: 4, avr: 4, mai: 5, may: 5, jun: 6, juin: 6,
  jul: 7, juil: 7, aug: 8, aou: 8, sep: 9, sept: 9, okt: 10, oct: 10, nov: 11, dez: 12, dec: 12,
};

const pad = n => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function makeDate(y, m, d) {
  if (y < 100) y += 2000;
  if (y < 2000 || y > 2070 || m < 1 || m > 12) return null;
  const day = d ?? lastDay(y, m); // nur Monat/Jahr: gilt bis Monatsende
  if (day < 1 || day > lastDay(y, m)) return null;
  return `${y}-${pad(m)}-${pad(day)}`;
}

/** Häufige Lesefehler in Ziffernfolgen korrigieren (O→0, l/I→1, S→5, B→8). */
function fixDigits(text) {
  return text.replace(/[0-9OoIlSB]{1,4}(?=[./\-\s]\s*[0-9OoIlSB])|(?<=[./\-]\s*)[0-9OoIlSB]{2,4}/g,
    s => s.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/S/g, '5').replace(/B/g, '8'));
}

/** Alle Daten im Text mit Position und Art (exp/mfg/null). */
export function findDates(rawText) {
  const text = fixDigits(String(rawText || '')).replace(/[‐–—]/g, '-');
  const found = [];
  const add = (index, date, len, short = false) => {
    if (!date) return;
    const before = text.slice(Math.max(0, index - 28), index);
    // nächstgelegenes Stichwort davor zählt
    const e = before.search(new RegExp(EXP_KEYS.source + '(?!.*' + EXP_KEYS.source + ')', 'i'));
    const m = before.search(new RegExp(MFG_KEYS.source + '(?!.*' + MFG_KEYS.source + ')', 'i'));
    let kind = null;
    if (e >= 0 || m >= 0) kind = e > m ? 'exp' : 'mfg';
    if (short && !kind) return; // zweistellige Jahre nur mit Stichwort davor
    if (found.some(f => index >= f.index && index < f.index + f.len)) return;
    found.push({ index, len, date, kind });
  };
  let r;
  // 31.08.2027 / 31/08/27 / 31-08-2027
  const dmy = /\b(\d{1,2})\s?[./-]\s?(\d{1,2})\s?[./-]\s?(\d{4}|\d{2})\b/g;
  while ((r = dmy.exec(text))) add(r.index, makeDate(+r[3], +r[2], +r[1]), r[0].length, r[3].length === 2);
  // 2027-08-31 / 2027/08
  const ymd = /\b(20\d{2})\s?[./-]\s?(\d{1,2})(?:\s?[./-]\s?(\d{1,2}))?\b/g;
  while ((r = ymd.exec(text))) add(r.index, makeDate(+r[1], +r[2], r[3] ? +r[3] : undefined), r[0].length);
  // 08/2027 / 08.2027 / 08 2027 / 08-2027
  const my = /\b(\d{1,2})\s?[./\-\s]\s?(20\d{2})\b/g;
  while ((r = my.exec(text))) add(r.index, makeDate(+r[2], +r[1]), r[0].length);
  // AUG 2027 / AUG-27
  const named = /\b([A-Za-zÄäÖöÜü]{3,4})\.?\s?[./\-\s]?\s?(20\d{2}|\d{2})\b/g;
  while ((r = named.exec(text))) {
    const key = r[1].toLowerCase().replace('ä', 'ae').replace('û', 'u');
    if (MONTHS[key]) add(r.index, makeDate(+r[2], MONTHS[key]), r[0].length, r[2].length === 2);
  }
  // 08/27 (nur mit Stichwort)
  const myShort = /\b(\d{1,2})\s?[./-]\s?(\d{2})\b(?![./-]\d)/g;
  while ((r = myShort.exec(text))) add(r.index, makeDate(+r[2], +r[1]), r[0].length, true);
  return found.sort((a, b) => a.index - b.index);
}

/**
 * Liefert { expiry, prodDate, batch } (jeweils oder undefined).
 * Ohne Stichwort gilt: spätestes Datum = Ablauf, früheres = Herstellung (nur wenn zwei da sind).
 */
export function parseExpiryText(text) {
  const all = findDates(text);
  const out = {};
  const latest = list => list.map(f => f.date).sort().pop();
  const exp = all.filter(f => f.kind === 'exp');
  const mfg = all.filter(f => f.kind === 'mfg');
  const free = all.filter(f => !f.kind);
  out.expiry = latest(exp) || latest(free);
  out.prodDate = latest(mfg);
  if (!out.prodDate && !exp.length && free.length >= 2) {
    const sorted = free.map(f => f.date).sort();
    if (sorted[0] < out.expiry) out.prodDate = sorted[0];
  }
  if (out.prodDate && out.expiry && out.prodDate >= out.expiry) delete out.prodDate;
  const lot = LOT_RX.exec(text);
  if (lot) out.batch = lot[1];
  return out;
}
