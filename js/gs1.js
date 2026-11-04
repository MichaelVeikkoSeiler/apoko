// GS1-Parser für Strichcodes auf Medikamentenpackungen.
//
// Seit der EU-Fälschungsschutzrichtlinie (und der Schweizer Umsetzung
// via SMVS) tragen die meisten Packungen einen GS1-DataMatrix-Code mit:
//   (01) GTIN  (17) Verfalldatum  (10) Charge  (21) Seriennummer
//   optional (11) Herstelldatum, (30) Menge, (71x) nationale Nummern
// Ältere oder einfache Packungen haben nur einen EAN-13 (= GTIN).

const GS = '\u001d';

// AI -> [feste Länge oder null für variabel, Feldname]
const AIS = {
  '00': [18, 'sscc'],
  '01': [14, 'gtin'],
  '02': [14, 'content'],
  '10': [null, 'batch'],
  '11': [6, 'prodDate'],
  '13': [6, 'packDate'],
  '15': [6, 'bestBefore'],
  '17': [6, 'expiry'],
  '21': [null, 'serial'],
  '30': [null, 'count'],
  '37': [null, 'count'],
  '240': [null, 'additionalId'],
  '710': [null, 'nhrnDE'], // PZN Deutschland
  '711': [null, 'nhrnFR'],
  '712': [null, 'nhrnES'],
  '713': [null, 'nhrnBR'],
  '714': [null, 'nhrnPT'],
};

function aiAt(s, i) {
  for (const len of [2, 3, 4]) {
    const ai = s.substr(i, len);
    if (AIS[ai]) return ai;
  }
  return null;
}

/** YYMMDD -> ISO-Datum. DD=00 bedeutet „Ende des Monats“. */
export function gs1Date(yymmdd) {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = +yymmdd.slice(0, 2);
  const mm = +yymmdd.slice(2, 4);
  let dd = +yymmdd.slice(4, 6);
  if (mm < 1 || mm > 12) return null;
  // GS1-Regel: Jahrhundert so wählen, dass das Datum -49..+50 Jahre um heute liegt
  const nowYY = new Date().getFullYear() % 100;
  const century = Math.floor(new Date().getFullYear() / 100) * 100;
  let year = century + yy;
  const diff = yy - nowYY;
  if (diff > 50) year -= 100;
  else if (diff < -49) year += 100;
  if (dd === 0) dd = new Date(Date.UTC(year, mm, 0)).getUTCDate();
  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (d.getUTCMonth() !== mm - 1) return null;
  return d.toISOString().slice(0, 10);
}

/** Prüfziffer nach GS1 (Modulo 10) für GTIN-8/12/13/14. */
export function gtinValid(code) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  digits.reverse().forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}

/** Vereinheitlicht eine GTIN auf 14 Stellen (Schlüssel für den Produktkatalog). */
export function normalizeGtin(code) {
  const c = String(code || '').replace(/\D/g, '');
  if (!c) return '';
  return c.padStart(14, '0');
}

/**
 * Schweizer Arzneimittel: GTIN 7680 + 5-stellige Swissmedic-Zulassungsnummer
 * + 3-stelliger Packungscode + Prüfziffer.
 */
export function swissmedicInfo(gtin14) {
  const g = normalizeGtin(gtin14).replace(/^0/, '');
  const m = /^7680(\d{5})(\d{3})\d$/.exec(g);
  if (!m) return null;
  return { authNo: m[1], packCode: m[2] };
}

function parseElementString(s) {
  const out = {};
  let i = 0;
  let guard = 0;
  while (i < s.length && guard++ < 50) {
    if (s[i] === GS) { i++; continue; }
    const ai = aiAt(s, i);
    if (!ai) return null; // kein gültiger GS1-String
    i += ai.length;
    const [len, field] = AIS[ai];
    let value;
    if (len) {
      value = s.substr(i, len);
      if (value.length !== len) return null;
      i += len;
    } else {
      const end = s.indexOf(GS, i);
      value = end === -1 ? s.slice(i) : s.slice(i, end);
      i = end === -1 ? s.length : end + 1;
    }
    out[field] = value;
  }
  return out;
}

/**
 * Nimmt den rohen Scannertext und liefert
 * { gtin, expiry, prodDate, batch, serial, count, raw, type }.
 */
export function parseBarcode(raw) {
  let s = String(raw || '').trim();
  const result = { raw: s, type: 'unknown' };
  if (!s) return result;

  // Symbologie-Präfixe entfernen (]d2 = GS1 DataMatrix, ]C1 = GS1-128, ]Q3 = GS1 QR)
  s = s.replace(/^\][A-Za-z]\d/, '');
  // Manche Scanner liefern FNC1 als Text
  s = s.replace(/<GS>|\{GS\}|\\x1d/gi, GS);

  let fields = null;

  // Klarschrift-Form: (01)07680...(17)271231(10)ABC
  if (/^\(\d{2,4}\)/.test(s)) {
    const parts = s.split(/(?=\(\d{2,4}\))/);
    s = parts.map(p => p.replace(/^\((\d{2,4})\)/, '$1')).join(GS);
  }

  if (/^(01|02|17|10|11|21)\d/.test(s) && s.length > 14) {
    fields = parseElementString(s);
  }

  if (fields && fields.gtin) {
    result.type = 'gs1';
    result.gtin = normalizeGtin(fields.gtin);
    if (fields.expiry) result.expiry = gs1Date(fields.expiry);
    if (fields.prodDate) result.prodDate = gs1Date(fields.prodDate);
    if (fields.batch) result.batch = fields.batch;
    if (fields.serial) result.serial = fields.serial;
    if (fields.count) result.count = parseInt(fields.count, 10) || undefined;
    if (fields.nhrnDE) result.pzn = fields.nhrnDE;
    return result;
  }

  const digits = s.replace(/\s/g, '');
  if (/^\d{8}$|^\d{12,14}$/.test(digits) && gtinValid(digits)) {
    result.type = 'gtin';
    result.gtin = normalizeGtin(digits);
    return result;
  }

  // Deutsche PZN im Code 39 (beginnt mit "-")
  if (/^-?\d{7,8}$/.test(digits)) {
    result.type = 'pzn';
    result.pzn = digits.replace(/^-/, '');
    return result;
  }

  result.type = 'text';
  return result;
}
