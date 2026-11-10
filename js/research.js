// Produkt-Recherche mit Claude (optional, mit eigenem API-Schlüssel des Nutzers).
// Die Fotos werden an die Anthropic-API geschickt; Claude erkennt das Produkt, sucht im Web
// nach den wichtigsten Angaben und liefert sie über das Werkzeug „produkt_speichern“ zurück.
import { FORMS, PRODUCT_TYPES } from './knowledge.js';

const KEY_STORE = 'apoko.apiKey';
const MODEL = 'claude-opus-5-5';

export function getApiKey() {
  try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; }
}
export function setApiKey(key) {
  try {
    if (key) localStorage.setItem(KEY_STORE, key.trim());
    else localStorage.removeItem(KEY_STORE);
  } catch { /* privater Modus */ }
}

let sdkPromise;
const loadSdk = () => (sdkPromise ||= import('../vendor/anthropic.mjs').then(m => m.default));

/** Bild verkleinern (spart Tokens) und als Base64-JPEG liefern. */
async function toBase64Jpeg(blob, max = 1280) {
  const img = await createImageBitmap(blob);
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}

const MIN_AGE_DESC = 'Ab welchem Alter (in Jahren) das Produkt laut offizieller Packungsbeilage/Fachinformation angewendet werden darf, '
  + 'z. B. 0 = ab Geburt, 2, 6, 12, 18 (nur Erwachsene). Bei Monaten in Jahre umrechnen (6 Monate = 0.5). '
  + 'Gilt je nach Alter eine andere Form/Stärke, das Alter für genau diese Packung. -1, wenn nicht sicher belegt.';

const SAVE_TOOL = {
  name: 'produkt_speichern',
  description: 'Speichert die recherchierten Angaben zum Produkt in der Hausapotheke. Genau einmal aufrufen, ganz am Schluss. Unbekannte Textfelder als leeren Text "" übergeben.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'hersteller', 'menge', 'einheit', 'darreichungsform', 'art', 'anwendung_allgemein', 'produktinfo', 'rezeptpflichtig', 'quellen', 'frontbild_rahmen', 'mindestalter_jahre'],
    properties: {
      name: { type: 'string', description: 'Handelsname wie auf der Packung, inkl. Stärke und Form, z. B. "Dafalgan 500 mg, Tabletten"' },
      hersteller: { type: 'string', description: 'Hersteller bzw. Zulassungsinhaberin, z. B. "Bayer (Schweiz) AG"' },
      menge: { type: 'string', description: 'Packungsinhalt als Zahl, z. B. "100" bei 100 ml oder "20" bei 20 Tabletten' },
      einheit: { type: 'string', enum: ['Stk', 'ml', 'g', 'Dosen', 'Beutel', 'Ampullen', ''] },
      darreichungsform: { type: 'string', enum: [...FORMS.map(f => f.id), ''] },
      art: { type: 'string', enum: PRODUCT_TYPES.map(t => t.id) },
      anwendung_allgemein: { type: 'string', description: 'Wofür, in einfacher Sprache, höchstens 8 Wörter, z. B. "Gegen Magen-Darm-Beschwerden"' },
      produktinfo: { type: 'string', description: '3 bis 5 kurze Stichpunkte (je Zeile mit "• "), einfache Sprache: Wofür genau, Wirkstoffe verständlich erklärt, wichtige Hinweise (z. B. Altersgrenze, nicht in der Schwangerschaft). Keine Dosierung, keine Lagertemperatur.' },
      rezeptpflichtig: { type: 'string', enum: ['ja', 'nein', 'unbekannt'] },
      mindestalter_jahre: { type: 'number', description: MIN_AGE_DESC },
      quellen: { type: 'string', description: 'Die genutzten Webseiten (URLs), durch Leerzeichen getrennt' },
      frontbild_rahmen: {
        type: 'object',
        additionalProperties: false,
        required: ['links', 'oben', 'rechts', 'unten'],
        description: 'Rahmen um die Verpackung auf dem ERSTEN Foto, in Prozent der Bildbreite bzw. -höhe (0 bis 100), möglichst eng: nur die Packung, ohne Hand und Hintergrund. Ist keine Packung erkennbar: 0, 0, 100, 100.',
        properties: {
          links: { type: 'number' }, oben: { type: 'number' }, rechts: { type: 'number' }, unten: { type: 'number' },
        },
      },
    },
  },
};

function prompt(known) {
  return `Das sind Fotos einer Packung aus einer Hausapotheke in der Schweiz. Das erste Foto zeigt die wichtigste Seite.
${Object.keys(known).length ? `Bereits bekannt (aus Strichcode und der Swissmedic-Liste, verlässlich): ${JSON.stringify(known)}\n` : ''}
Aufgabe:
1. Erkenne das Produkt anhand aller Fotos (Name, Hersteller, Packungsinhalt wie "100 ml" oder "20 Tabletten").
2. Recherchiere mit der Websuche die wichtigsten Angaben, bevorzugt aus offiziellen Quellen (Swissmedic, compendium.ch, Herstellerseite). Kläre auch, ob es ein pflanzliches Arzneimittel ist.
3. Kläre das zugelassene Mindestalter für genau diese Packung (Packungsbeilage auf compendium.ch oder swissmedicinfo.ch).
4. Bestimme auf dem ersten Foto den Rahmen um die Verpackung (für den Zuschnitt des Produktbilds).
5. Rufe am Schluss genau einmal das Werkzeug produkt_speichern auf.

Regeln: Nur Angaben, die auf den Fotos stehen oder in seriösen Quellen belegt sind; was unklar ist, leer lassen. Deutsch und einfach formulieren. Keine Dosierungsempfehlungen und keine Lagertemperatur.`;
}

/**
 * Recherchiert ein Produkt. images: Blob[] (erstes = Frontbild), known: bereits bekannte Felder.
 * Liefert das Objekt aus produkt_speichern.
 */
export async function researchProduct({ images, known = {}, onStatus = () => {} }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt (Einstellungen).');
  const Anthropic = await loadSdk();
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, timeout: 180_000, maxRetries: 1 });

  onStatus('Fotos werden vorbereitet …');
  const content = [];
  for (const blob of images.slice(0, 6)) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await toBase64Jpeg(blob) } });
  }
  content.push({ type: 'text', text: prompt(known) });
  const messages = [{ role: 'user', content }];

  // Websuche kann die Antwort unterbrechen (pause_turn): dann mit dem bisherigen Verlauf fortsetzen.
  for (let round = 0; round < 4; round++) {
    onStatus(round === 0 ? 'Claude recherchiert im Web …' : 'Recherche läuft weiter …');
    let response;
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }, SAVE_TOOL],
        tool_choice: { type: 'auto' },
        messages,
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new Error('API-Schlüssel ungültig.');
      if (err instanceof Anthropic.PermissionDeniedError) throw new Error('Kein Zugriff mit diesem API-Schlüssel.');
      if (err instanceof Anthropic.RateLimitError) throw new Error('Zu viele Anfragen, bitte später nochmals versuchen.');
      if (err instanceof Anthropic.APIConnectionError) throw new Error('Keine Verbindung zur Anthropic-API.');
      if (err instanceof Anthropic.APIError) throw new Error(`Anthropic-API meldet Fehler ${err.status ?? ''}.`.trim());
      throw err;
    }
    if (response.stop_reason === 'refusal') throw new Error('Die Anfrage wurde abgelehnt.');
    const save = response.content.find(b => b.type === 'tool_use' && b.name === 'produkt_speichern');
    if (save) return save.input;
    if (response.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: response.content });
  }
  throw new Error('Claude hat keine Angaben geliefert.');
}

// ---------- Nur Mindestalter recherchieren (für bereits erfasste Artikel, ohne Fotos) ----------
const AGE_TOOL = {
  name: 'alter_speichern',
  description: 'Speichert das recherchierte Mindestalter. Genau einmal aufrufen, ganz am Schluss.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['mindestalter_jahre', 'quelle'],
    properties: {
      mindestalter_jahre: { type: 'number', description: MIN_AGE_DESC },
      quelle: { type: 'string', description: 'Genutzte Webseite (URL), sonst ""' },
    },
  },
};

/** Recherchiert das Mindestalter eines Artikels. Liefert { mindestalter_jahre, quelle }. */
export async function researchMinAge(item, { onStatus = () => {} } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt (Einstellungen).');
  const Anthropic = await loadSdk();
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, timeout: 120_000, maxRetries: 1 });
  const facts = { name: item.name, hersteller: item.manufacturer, wirkstoff: item.substance, atc: item.atc, form: item.form, packung: item.quantity ? `${item.quantity} ${item.unit}` : '', gtin: item.gtin };
  const known = Object.fromEntries(Object.entries(facts).filter(([, v]) => v));
  const messages = [{ role: 'user', content: `Produkt aus einer Hausapotheke in der Schweiz: ${JSON.stringify(known)}
Suche in der offiziellen Packungsbeilage (compendium.ch oder swissmedicinfo.ch, sonst Herstellerseite), ab welchem Alter genau dieses Produkt angewendet werden darf.
Rufe dann genau einmal das Werkzeug alter_speichern auf. Wenn nicht sicher belegt: -1.` }];
  for (let round = 0; round < 3; round++) {
    onStatus(round === 0 ? 'Claude sucht das Mindestalter …' : 'Suche läuft weiter …');
    let response;
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 2 }, AGE_TOOL],
        tool_choice: { type: 'auto' },
        messages,
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new Error('API-Schlüssel ungültig.');
      if (err instanceof Anthropic.RateLimitError) throw new Error('Zu viele Anfragen, bitte später nochmals versuchen.');
      if (err instanceof Anthropic.APIConnectionError) throw new Error('Keine Verbindung zur Anthropic-API.');
      if (err instanceof Anthropic.APIError) throw new Error(`Anthropic-API meldet Fehler ${err.status ?? ''}.`.trim());
      throw err;
    }
    if (response.stop_reason === 'refusal') throw new Error('Die Anfrage wurde abgelehnt.');
    const save = response.content.find(b => b.type === 'tool_use' && b.name === 'alter_speichern');
    if (save) return save.input;
    if (response.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: response.content });
  }
  throw new Error('Kein Mindestalter gefunden.');
}
