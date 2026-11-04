// Lokale Datenhaltung (localStorage). Alles bleibt auf dem Gerät.
import { normalizeGtin } from './gs1.js';
import { SOON_DAYS } from './knowledge.js';

const KEY = 'apoko.v1';

const empty = () => ({
  household: { id: uid(), name: 'Mein Haushalt' },
  items: [],
  catalog: {},   // GTIN -> zuletzt erfasste Produktdaten (für Autovervollständigung)
  linked: [],    // verbundene Haushalte: { id, name, importedAt, sharedAt, items[] }
  locations: [], // gespeicherte Standorte (Lagerorte)
});

/** Ältere Daten: Standorte aus den vorhandenen Artikeln übernehmen. */
function migrate(s) {
  if (!Array.isArray(s.locations)) s.locations = [];
  for (const it of s.items || []) {
    const loc = (it.location || '').trim();
    if (loc && !s.locations.some(l => l.toLowerCase() === loc.toLowerCase())) s.locations.push(loc);
  }
  return s;
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return migrate({ ...empty(), ...s });
    }
  } catch (e) { console.warn('Speicher nicht lesbar', e); }
  return empty();
}

const listeners = new Set();
export const onChange = fn => listeners.add(fn);

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { alert('Speichern fehlgeschlagen: ' + e.message); }
  listeners.forEach(fn => fn(state));
}

export const getState = () => state;

export function setHouseholdName(name) {
  state.household.name = name.trim() || 'Mein Haushalt';
  save();
}

// ---- Standorte ----
const sameLoc = (a, b) => a.toLowerCase() === b.toLowerCase();

export function addLocation(name, persist = true) {
  const loc = String(name || '').trim();
  if (!loc || state.locations.some(l => sameLoc(l, loc))) return false;
  state.locations.push(loc);
  state.locations.sort((a, b) => a.localeCompare(b, 'de'));
  if (persist) save();
  return true;
}

/** Entfernt einen Standort aus der Liste (Artikel behalten ihren Eintrag). */
export function removeLocation(name) {
  state.locations = state.locations.filter(l => !sameLoc(l, name));
  save();
}

/** Benennt einen Standort um, auch bei allen Artikeln. */
export function renameLocation(oldName, newName) {
  const nn = String(newName || '').trim();
  if (!nn) return;
  state.locations = state.locations.filter(l => !sameLoc(l, oldName) && !sameLoc(l, nn));
  state.locations.push(nn);
  state.locations.sort((a, b) => a.localeCompare(b, 'de'));
  for (const it of state.items) if (it.location && sameLoc(it.location, oldName)) it.location = nn;
  save();
}

export function upsertItem(item) {
  const now = new Date().toISOString();
  const i = state.items.findIndex(x => x.id === item.id);
  if (i >= 0) state.items[i] = { ...state.items[i], ...item, updatedAt: now };
  else state.items.push({ ...item, id: item.id || uid(), createdAt: now, updatedAt: now });

  addLocation(item.location, false);
  if (item.gtin) {
    state.catalog[normalizeGtin(item.gtin)] = {
      name: item.name, substance: item.substance, strength: item.strength,
      form: item.form, quantity: item.quantity, unit: item.unit, usage: item.usage, atc: item.atc,
      rx: item.rx, category: item.category, imageUrl: item.imageUrl,
    };
  }
  save();
}

export function deleteItem(id) {
  state.items = state.items.filter(x => x.id !== id);
  save();
}

export const catalogLookup = gtin => state.catalog[normalizeGtin(gtin)] || null;

export function upsertLinked(snapshot) {
  if (snapshot.id === state.household.id) throw new Error('Das ist dein eigener Haushalt.');
  const entry = {
    id: snapshot.id, name: snapshot.name, sharedAt: snapshot.sharedAt,
    importedAt: new Date().toISOString(), items: snapshot.items,
  };
  const i = state.linked.findIndex(h => h.id === snapshot.id);
  if (i >= 0) state.linked[i] = entry; else state.linked.push(entry);
  save();
  return i >= 0 ? 'updated' : 'added';
}

export function removeLinked(id) {
  state.linked = state.linked.filter(h => h.id !== id);
  save();
}

export function exportBackup() {
  return JSON.stringify({ app: 'apoko', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function importBackup(json) {
  const data = JSON.parse(json);
  if (data.app !== 'apoko' || !Array.isArray(data.items)) throw new Error('Keine gültige Apoko-Sicherung.');
  state = migrate({ ...empty(), household: data.household, items: data.items, catalog: data.catalog || {}, linked: data.linked || [], locations: data.locations });
  save();
}

export function resetAll() {
  state = empty();
  save();
}

// ---- Ablauf-Logik ----

const DAY = 86400000;
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/** Massgebend ist allein das Verfalldatum auf der Packung. */
export function effectiveExpiry(item) {
  return item.expiry ? { date: item.expiry, reason: 'Verfalldatum' } : null;
}

/** 'expired' | 'soon' | 'ok' | 'unknown' und Resttage. */
export function expiryStatus(item) {
  const eff = effectiveExpiry(item);
  if (!eff) return { status: 'unknown', days: null, eff };
  const end = new Date(eff.date + 'T00:00:00');
  const days = Math.round((end - today()) / DAY);
  const status = days < 0 ? 'expired' : days <= SOON_DAYS ? 'soon' : 'ok';
  return { status, days, eff };
}
