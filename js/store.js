// Lokale Datenhaltung (localStorage). Alles bleibt auf dem Gerät.
import { normalizeGtin } from './gs1.js';
import { SOON_DAYS } from './knowledge.js';

const KEY = 'apoko.v1';

const empty = () => ({
  household: { id: uid(), name: 'Mein Haushalt' },
  items: [],
  catalog: {},   // GTIN -> zuletzt erfasste Produktdaten (für Autovervollständigung)
  linked: [],    // verbundene Haushalte: { id, name, importedAt, sharedAt, items[] }
});

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
      return { ...empty(), ...s };
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

export function upsertItem(item) {
  const now = new Date().toISOString();
  const i = state.items.findIndex(x => x.id === item.id);
  if (i >= 0) state.items[i] = { ...state.items[i], ...item, updatedAt: now };
  else state.items.push({ ...item, id: item.id || uid(), createdAt: now, updatedAt: now });

  if (item.gtin) {
    state.catalog[normalizeGtin(item.gtin)] = {
      name: item.name, substance: item.substance, strength: item.strength,
      form: item.form, quantity: item.quantity, unit: item.unit,
      rx: item.rx, category: item.category, openDays: item.openDays,
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
  state = { ...empty(), household: data.household, items: data.items, catalog: data.catalog || {}, linked: data.linked || [] };
  save();
}

export function resetAll() {
  state = empty();
  save();
}

// ---- Ablauf-Logik ----

const DAY = 86400000;
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/** Effektives Ablaufdatum: frühere von Verfalldatum und Anbruch + Haltbarkeit. */
export function effectiveExpiry(item) {
  const dates = [];
  if (item.expiry) dates.push({ date: item.expiry, reason: 'Verfalldatum' });
  if (item.openedAt && item.openDays) {
    const d = new Date(item.openedAt);
    d.setDate(d.getDate() + Number(item.openDays));
    dates.push({ date: d.toISOString().slice(0, 10), reason: 'nach Anbruch' });
  }
  if (!dates.length) return null;
  return dates.sort((a, b) => a.date.localeCompare(b.date))[0];
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
