// Teilen zwischen Haushalten ohne Server:
// Die geteilten Artikel werden komprimiert in einen Code bzw. Link gepackt,
// der als QR-Code, über WhatsApp/Mail usw. weitergegeben werden kann.
// Der andere Haushalt importiert ihn und sieht die Artikel schreibgeschützt.
// Erneutes Teilen aktualisiert den Stand beim Empfänger.

import { getState, expiryStatus } from './store.js';

const PREFIX_DEFLATE = 'A1';
const PREFIX_PLAIN = 'A0';

function b64urlEncode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

/** Nur Artikel mit „teilen“, die nicht abgelaufen sind. Notizen bleiben privat. */
export function sharedItems() {
  return getState().items
    .filter(i => i.shared && expiryStatus(i).status !== 'expired')
    .map(i => ({
      i: i.id, n: i.name, w: i.substance || undefined, s: i.strength || undefined,
      f: i.form, q: i.remaining ?? i.quantity ?? undefined, u: i.unit,
      e: expiryStatus(i).eff?.date, r: i.rx ? 1 : 0, c: i.category || undefined, a: i.usage || undefined, x: i.atc || undefined,
    }));
}

export async function buildShareCode() {
  const { household } = getState();
  const payload = { v: 1, h: household.id, n: household.name, t: new Date().toISOString(), it: sharedItems() };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream !== 'undefined') {
    try { return PREFIX_DEFLATE + b64urlEncode(await pipe(bytes, new CompressionStream('deflate-raw'))); }
    catch (e) { /* Fallback unten */ }
  }
  return PREFIX_PLAIN + b64urlEncode(bytes);
}

export function shareLink(code) {
  return location.origin + location.pathname + '#join=' + code;
}

/** Akzeptiert Code, Link oder QR-Inhalt. */
export async function parseShareCode(input) {
  let code = String(input || '').trim();
  const m = /#join=([A-Za-z0-9_-]+)/.exec(code);
  if (m) code = m[1];
  const prefix = code.slice(0, 2);
  let bytes;
  try {
    bytes = b64urlDecode(code.slice(2));
    if (prefix === PREFIX_DEFLATE) bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    else if (prefix !== PREFIX_PLAIN) throw new Error();
    const p = JSON.parse(new TextDecoder().decode(bytes));
    if (p.v !== 1 || !p.h || !Array.isArray(p.it)) throw new Error();
    return {
      id: p.h, name: p.n || 'Haushalt', sharedAt: p.t,
      items: p.it.map(x => ({
        id: x.i, name: x.n, substance: x.w, strength: x.s, form: x.f,
        quantity: x.q, unit: x.u, expiry: x.e, rx: !!x.r, category: x.c, usage: x.a, atc: x.x,
      })),
    };
  } catch {
    throw new Error('Der Code ist ungültig oder unvollständig.');
  }
}
