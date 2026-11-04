import { parseBarcode, swissmedicInfo, normalizeGtin } from './gs1.js';
import { FORMS, UNITS, CATEGORIES, CHECKLIST, NOTES, formById } from './knowledge.js';
import * as store from './store.js';
import { startScanner, decodeImage, startCamera, grabFrameRegion } from './scanner.js';
import { lookupSwissDrug, searchByText, guessForm } from './drugdb.js';
import { lookupOpenProduct } from './productdb.js';
import * as photos from './photos.js';
import { recognizeText, preloadOcr } from './ocr.js';
import { parseExpiryText } from './dates.js';
import { buildShareCode, shareLink, parseShareCode, sharedItems } from './share.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = iso => iso ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('de-CH') : '–';
// Ablaufdatum: nur Monat/Jahr. Intern gilt der Monatsletzte (JJJJ-MM-TT).
const fmtMonth = iso => iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '–';
const monthEnd = (y, m) => `${y}-${String(m).padStart(2, '0')}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
/** Setzt ein Monatsfeld (type=month, ältere Browser: Textfeld MM/JJJJ). */
function setMonth(el, iso) {
  if (!iso) { el.value = ''; return; }
  el.value = el.type === 'month' ? iso.slice(0, 7) : fmtMonth(iso);
}
/** Liest ein Monatsfeld und liefert den Monatsletzten als JJJJ-MM-TT. */
function readMonth(el) {
  const v = el.value.trim();
  let m = /^(\d{4})-(\d{1,2})/.exec(v);
  if (m) return monthEnd(+m[1], +m[2]);
  m = /^(\d{1,2})\s*[./\s-]\s*(\d{4})$/.exec(v);
  if (m && +m[1] >= 1 && +m[1] <= 12) return monthEnd(+m[2], +m[1]);
  return null;
}
const fmtNum = n => (n === '' || n == null || isNaN(n)) ? '' : Number(n).toLocaleString('de-CH');

let filter = 'all';
let query = '';

function toast(msg) {
  const t = $('#toast');
  // Offene Dialoge liegen über allem: Meldung dort hineinhängen, sonst ist sie unsichtbar
  const host = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
  if (t.parentElement !== host) host.appendChild(t);
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- Navigation ----------
function showView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  $('#fab').hidden = name !== 'inventory';
  if (name === 'linked') renderLinked();
  if (name === 'check') renderChecklist();
  window.scrollTo(0, 0);
}
$$('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));

// ---------- Vorrat ----------
function describeDays(days) {
  if (days == null) return 'Kein Ablaufdatum';
  if (days < 0) return `Abgelaufen seit ${-days} ${-days === 1 ? 'Tag' : 'Tagen'}`;
  if (days === 0) return 'Läuft heute ab';
  if (days < 60) return `Läuft ab in ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
  const months = Math.round(days / 30.4);
  return months < 24 ? `Haltbar noch ${months} Monate` : `Haltbar noch ${Math.round(days / 365)} Jahre`;
}

function matches(item, q) {
  if (!q) return true;
  const hay = [item.name, item.substance, item.strength, item.location, item.person, item.notes, formById(item.form).label]
    .join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every(w => hay.includes(w));
}

function passFilter(item, st) {
  switch (filter) {
    case 'soon': return st.status === 'soon';
    case 'expired': return st.status === 'expired';
    case 'rx': return !!item.rx;
    case 'otc': return !item.rx;
    case 'shared': return !!item.shared;
    case 'private': return !item.shared;
    default: return true;
  }
}

function amountText(item) {
  if (item.quantity == null && item.remaining == null) return '';
  const unit = item.unit || '';
  if (item.remaining != null && item.quantity != null && item.remaining !== item.quantity)
    return `${fmtNum(item.remaining)} / ${fmtNum(item.quantity)} ${unit}`;
  return `${fmtNum(item.remaining ?? item.quantity)} ${unit}`;
}

function itemCard(item, { readonly = false } = {}) {
  const st = store.expiryStatus(item);
  const form = formById(item.form);
  const pct = item.quantity > 0 && item.remaining != null ? Math.max(0, Math.min(100, item.remaining / item.quantity * 100)) : null;
  return `
    <li class="item ${st.status}${!readonly && (item.hasPhoto || item.imageUrl) ? ' has-photo' : ''}" ${readonly ? '' : `data-id="${esc(item.id)}" tabindex="0"`}>
      ${readonly ? '' : item.hasPhoto ? `<img class="thumb" data-photo="${esc(item.id)}" alt="">`
        : item.imageUrl ? `<img class="thumb" src="${esc(item.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
      <div>
        <h3>${esc(item.name)}${item.strength && !item.name.toLowerCase().includes(item.strength.toLowerCase()) ?` <span class="muted">${esc(item.strength)}</span>` : ''}</h3>
        <div class="meta">${esc([item.substance, form.label].filter(Boolean).join(' · '))}</div>
        ${!readonly && (item.location || item.person) ? `<div class="meta">${esc([item.location && '📍 ' + item.location, item.person && '👤 ' + item.person].filter(Boolean).join('   '))}</div>` : ''}
      </div>
      <div class="right">
        <div>${esc(amountText(item))}</div>
        ${pct != null ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}
        <div class="muted">${st.eff ? fmtMonth(st.eff.date) : ''}</div>
      </div>
      <div class="badges">
        <span class="badge ${st.status}">${describeDays(st.days)}</span>
        ${item.rx ? `<span class="badge rx">℞ Rezeptpflichtig${item.category ? ' · ' + esc(item.category) : ''}</span>` : ''}
        ${!readonly && item.shared ? '<span class="badge shared">🔗 Geteilt</span>' : ''}
      </div>
    </li>`;
}

function renderInventory() {
  const { items, household } = store.getState();
  $('#householdLabel').textContent = household.name;

  const withStatus = items.map(i => ({ i, st: store.expiryStatus(i) }));
  const counts = {
    all: items.length,
    expired: withStatus.filter(x => x.st.status === 'expired').length,
    soon: withStatus.filter(x => x.st.status === 'soon').length,
    rx: items.filter(i => i.rx).length,
  };
  $('#stats').innerHTML = `
    <button class="stat" data-filter="all"><b>${counts.all}</b><span>Artikel</span></button>
    <button class="stat soon" data-filter="soon"><b>${counts.soon}</b><span>bald ablaufend</span></button>
    <button class="stat expired" data-filter="expired"><b>${counts.expired}</b><span>abgelaufen</span></button>
    <button class="stat rx" data-filter="rx"><b>${counts.rx}</b><span>rezeptpflichtig</span></button>`;

  $('#alerts').innerHTML = counts.expired
    ? `<div class="alert danger"><strong>${counts.expired} Artikel abgelaufen.</strong> ${esc(NOTES.disposal)}</div>` : '';

  const order = { expired: 0, soon: 1, ok: 2, unknown: 3 };
  const list = withStatus
    .filter(x => passFilter(x.i, x.st) && matches(x.i, query))
    .sort((a, b) => order[a.st.status] - order[b.st.status] || (a.st.days ?? 1e9) - (b.st.days ?? 1e9) || a.i.name.localeCompare(b.i.name));

  $('#itemList').innerHTML = list.map(x => itemCard(x.i)).join('') ||
    (items.length ? '<p class="muted" style="text-align:center">Keine Treffer für diesen Filter.</p>' : '');
  $('#emptyState').hidden = items.length > 0;
  $$('#itemList img[data-photo]').forEach(async img => {
    const url = await photos.photoUrl(img.dataset.photo);
    if (url) img.src = url; else img.remove();
  });
  $$('#filters .chip').forEach(c => c.classList.toggle('active', c.dataset.filter === filter));
}

function setFilter(f) { filter = f; renderInventory(); }
$('#filters').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (b) setFilter(b.dataset.filter); });
$('#stats').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (b) setFilter(b.dataset.filter); });
$('#search').addEventListener('input', e => { query = e.target.value.trim(); renderInventory(); });
$('#itemList').addEventListener('click', e => {
  const li = e.target.closest('.item[data-id]');
  if (li) openItem(store.getState().items.find(i => i.id === li.dataset.id));
});
$('#itemList').addEventListener('keydown', e => {
  if (e.key === 'Enter') e.target.closest('.item[data-id]')?.click();
});

// ---------- Erfassen / Bearbeiten ----------
const dlg = $('#itemDialog');
const form = $('#itemForm');
const F = form.elements;

$('#formSelect').innerHTML = FORMS.map(f => `<option value="${f.id}">${esc(f.label)}</option>`).join('');
$('#unitSelect').innerHTML = UNITS.map(u => `<option>${u}</option>`).join('');
$('#categorySelect').innerHTML = CATEGORIES.map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('');

function fillDatalists() {
  const { items } = store.getState();
  const uniq = key => [...new Set(items.map(i => i[key]).filter(Boolean))].sort();
  $('#locations').innerHTML = uniq('location').map(v => `<option value="${esc(v)}">`).join('');
  $('#persons').innerHTML = uniq('person').map(v => `<option value="${esc(v)}">`).join('');
}

function updateFormHint() {
  const f = formById(F.form.value);
  $('#formHint').hidden = !f.hint;
  $('#formHint').textContent = f.hint || '';
}

function updateRxWarn() {
  const show = F.rx.checked && F.shared.checked;
  $('#rxShareWarn').hidden = !show;
  $('#rxShareWarn').textContent = '⚠️ ' + NOTES.rxShare;
}

F.form.addEventListener('change', () => {
  const f = formById(F.form.value);
  F.unit.value = f.unit;
  updateFormHint();
});
F.category.addEventListener('change', () => {
  const c = CATEGORIES.find(c => c.id === F.category.value);
  if (c && c.rx != null) F.rx.checked = c.rx;
  updateRxWarn();
});
F.rx.addEventListener('change', () => {
  const cat = CATEGORIES.find(c => c.id === F.category.value);
  if (cat?.rx != null && cat.rx !== F.rx.checked) F.category.value = '';
  updateRxWarn();
});
F.shared.addEventListener('change', updateRxWarn);

// Form aus dem Namen ableiten (z. B. „Pflaster“, „Verband“), solange noch die Voreinstellung gewählt ist
let formTouched = false;
F.form.addEventListener('input', () => { formTouched = true; });
function autoFormFromName() {
  if (formTouched) return;
  const f = guessForm(F.name.value);
  if (f && f !== F.form.value) {
    F.form.value = f;
    F.unit.value = formById(f).unit;
    updateFormHint();
  }
}
F.name.addEventListener('change', autoFormFromName);

// undefined = unverändert, null = entfernen, Blob = neues Foto
let pendingPhoto;

const SOURCE_DEFAULT = 'Produktbild: wird automatisch geladen, wenn ein offizielles freies Foto existiert.';

function showPhoto(url, source = '') {
  $('#photoImg').hidden = !url;
  $('#photoEmpty').hidden = !!url;
  if (url) $('#photoImg').src = url; else $('#photoImg').removeAttribute('src');
  $('#btnPhotoRemove').hidden = !url;
  $('#photoSource').textContent = url ? source : SOURCE_DEFAULT;
}

/** Zeigt das passende Bild: eigenes Foto vor offiziellem Bild. */
function refreshPhoto(ownUrl) {
  if (ownUrl) return showPhoto(ownUrl, 'Eigenes Foto');
  if (F.imageUrl.value) return showPhoto(F.imageUrl.value, `Bild: ${F.imageUrl.dataset.source || 'Open Products Facts'} (CC BY-SA)`);
  showPhoto(null);
}

function setPendingPhoto(blob) {
  pendingPhoto = blob;
  refreshPhoto(blob ? URL.createObjectURL(blob) : null);
}

$('#photoInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try { setPendingPhoto(await photos.resizeImage(file)); }
  catch { toast('Foto konnte nicht gelesen werden.'); }
});
$('#btnPhotoRemove').addEventListener('click', () => {
  // Erst das eigene Foto entfernen; ist keins da, das offizielle Bild
  if ($('#photoSource').textContent === 'Eigenes Foto') setPendingPhoto(null);
  else { F.imageUrl.value = ''; refreshPhoto(null); }
});

function openItem(item) {
  form.reset();
  $$('.field-invalid', form).forEach(el => el.classList.remove('field-invalid'));
  $('#scanInfo').hidden = true;
  $('#suggestions').hidden = true;
  pendingPhoto = undefined;
  formTouched = !!item;
  const ownPhoto = item?.hasPhoto ? photos.photoUrl(item.id) : null;
  const isNew = !item;
  item ||= { form: 'tablette', unit: 'Stk', shared: false, rx: false };
  $('#itemDialogTitle').textContent = isNew ? 'Artikel erfassen' : 'Artikel bearbeiten';
  $('#btnDelete').hidden = isNew;
  for (const el of form.elements) {
    if (!el.name) continue;
    const v = item[el.name];
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.name === 'expiry') setMonth(el, v);
    else el.value = v ?? '';
  }
  delete F.imageUrl.dataset.source;
  refreshPhoto(null);
  ownPhoto?.then(url => { if (pendingPhoto === undefined && url) refreshPhoto(url); });
  $('#expiryInfo').hidden = true;
  $('#btnExpiryPhoto').classList.remove('attention');
  fillDatalists();
  updateFormHint();
  updateRxWarn();
  dlg.showModal();
  if (isNew) $('#btnScan').focus();
}

function readForm() {
  const num = v => v === '' ? null : Number(v);
  return {
    id: F.id.value || undefined,
    name: F.name.value.trim(),
    substance: F.substance.value.trim(),
    strength: F.strength.value.trim(),
    form: F.form.value,
    quantity: num(F.quantity.value),
    remaining: num(F.remaining.value),
    unit: F.unit.value,
    expiry: readMonth(F.expiry),
    rx: F.rx.checked,
    category: F.category.value,
    shared: F.shared.checked,
    location: F.location.value.trim(),
    person: F.person.value.trim(),
    batch: F.batch.value.trim(),
    gtin: F.gtin.value.replace(/\D/g, '') ? normalizeGtin(F.gtin.value) : '',
    notes: F.notes.value.trim(),
    imageUrl: F.imageUrl.value || '',
  };
}

/** Fehlendes Pflichtfeld deutlich zeigen (die Browser-Blase liegt sonst oft ausserhalb des Bildschirms). */
function flagField(el, msg) {
  el.classList.add('field-invalid');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (el.type !== 'month') el.focus({ preventScroll: true });
  toast(msg);
  el.addEventListener('input', () => el.classList.remove('field-invalid'), { once: true });
  el.addEventListener('change', () => el.classList.remove('field-invalid'), { once: true });
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!F.name.value.trim()) return flagField(F.name, 'Bitte einen Namen eingeben.');
  if (!readMonth(F.expiry)) return flagField(F.expiry, 'Bitte das Ablaufdatum (Monat/Jahr) wählen.');
  const item = readForm();
  const isNew = !item.id;
  item.id ||= store.uid();
  if (item.remaining != null && item.quantity != null && item.remaining > item.quantity)
    return toast('„Noch vorhanden“ ist grösser als die Packungsgrösse.');
  if (item.rx && item.shared && !confirm(NOTES.rxShare + '\n\nTrotzdem teilen?')) return;
  if (pendingPhoto instanceof Blob) {
    try { await photos.savePhoto(item.id, pendingPhoto); item.hasPhoto = true; }
    catch { toast('Foto konnte nicht gespeichert werden.'); }
  } else if (pendingPhoto === null) {
    await photos.deletePhoto(item.id);
    item.hasPhoto = false;
  }
  store.upsertItem(item);
  dlg.close();
  toast(isNew ? 'Erfasst' : 'Gespeichert');
});
$('[data-close]', dlg).addEventListener('click', () => dlg.close());
$('#btnDelete').addEventListener('click', () => {
  if (!confirm(`„${F.name.value}“ löschen?`)) return;
  photos.deletePhoto(F.id.value);
  store.deleteItem(F.id.value);
  dlg.close();
  toast('Gelöscht');
});
$('#fab').addEventListener('click', () => openItem(null));

async function applyScan(raw) {
  const r = parseBarcode(raw);
  const info = [];
  if (r.type === 'text' || r.type === 'unknown') {
    $('#scanInfo').hidden = false;
    $('#scanInfo').textContent = 'Code gelesen, aber kein Produkt-Strichcode erkannt: ' + r.raw.slice(0, 60);
    return;
  }
  const fill = data => {
    for (const [k, v] of Object.entries(data)) {
      const el = F[k];
      if (!el || v == null || v === '') continue;
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    }
  };
  if (r.gtin) {
    F.gtin.value = r.gtin;
    const known = store.catalogLookup(r.gtin);
    const sm = swissmedicInfo(r.gtin);
    if (known) {
      fill(known);
      if (known.imageUrl && !(pendingPhoto instanceof Blob)) refreshPhoto(null);
      info.push('Produkt bekannt, Angaben übernommen');
    } else if (sm) {
      $('#scanInfo').hidden = false;
      $('#scanInfo').textContent = 'Suche in der Swissmedic-Liste …';
      const drug = await lookupSwissDrug(r.gtin);
      if (drug) {
        fill(drug);
        info.push('Gefunden in der Swissmedic-Liste');
      } else {
        info.push(`Swissmedic-Nr. ${sm.authNo}, nicht in der Liste gefunden: Name bitte eintippen`);
      }
    } else {
      $('#scanInfo').hidden = false;
      $('#scanInfo').textContent = 'Suche in offenen Produktdatenbanken …';
      const prod = await lookupOpenProduct(r.gtin);
      if (prod) {
        fill({ name: prod.name, quantity: prod.quantity });
        const form = guessForm(prod.name);
        if (form) { F.form.value = form; F.unit.value = formById(form).unit; }
        if (prod.unit) F.unit.value = prod.unit;
        if (prod.imageUrl) {
          F.imageUrl.value = prod.imageUrl;
          F.imageUrl.dataset.source = prod.source;
          if (!(pendingPhoto instanceof Blob)) refreshPhoto(null);
        }
        info.push(`Gefunden in ${prod.source}, bitte kontrollieren`);
      } else {
        info.push('Kein Arzneimittel und in keiner Datenbank gefunden: Name bitte einmal eintippen, beim nächsten Scan kennt die App das Produkt');
      }
    }
  }
  if (r.pzn) info.push(`PZN ${r.pzn}`);
  if (r.expiry) { setMonth(F.expiry, r.expiry); info.push(`Ablauf ${fmtMonth(r.expiry)}`); }
  if (r.batch) F.batch.value = r.batch;
  if (r.count && !F.quantity.value) F.quantity.value = r.count;

  if (!r.expiry && !F.expiry.value) {
    info.push('Ablaufdatum steht nicht im Strichcode: unten „📷 Ablaufdatum scannen“ antippen oder eingeben');
    $('#btnExpiryPhoto').classList.add('attention');
  }
  $('#scanInfo').hidden = false;
  $('#scanInfo').textContent = '✓ ' + info.join(' · ');
  updateFormHint(); updateRxWarn();
  if (!F.name.value) F.name.focus();
}

// ---------- Ablaufdatum per Foto ----------
$('#btnExpiryPhoto').addEventListener('click', () => openDateScanner());

/** Ausschnitte eines Bildes als Canvas (Etikett ist im Foto oft klein, Hintergrund stört). */
async function* imageTiles(blob) {
  const img = await createImageBitmap(blob);
  const tw = img.width * 0.7, th = img.height * 0.32;
  const xs = [0.5, 0, 1], ys = [0.5, 0.3, 0.7, 0.1, 0.9, 0, 1];
  for (const fy of ys) for (const fx of xs) {
    const c = document.createElement('canvas');
    const scale = Math.min(2, 1400 / tw);
    c.width = Math.round(tw * scale); c.height = Math.round(th * scale);
    const ctx = c.getContext('2d');
    ctx.filter = 'grayscale(1) contrast(1.4)';
    ctx.drawImage(img, (img.width - tw) * fx, (img.height - th) * fy, tw, th, 0, 0, c.width, c.height);
    yield c;
  }
}

$('#expiryInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const info = $('#expiryInfo');
  info.hidden = false;
  info.className = 'scaninfo';
  info.textContent = 'Foto wird gelesen …';
  try {
    const big = await photos.resizeImage(file, 1800, 0.9);
    // Steht ein DataMatrix-Code mit drauf, ist der am zuverlässigsten
    const code = await decodeImage(big).catch(() => null);
    const parsed = code ? parseBarcode(code) : null;
    if (parsed?.expiry) return setExpiryFromScan(parsed, 'DataMatrix-Code');
    const progress = m => { if (/load|initializ/.test(m.status)) info.textContent = 'Texterkennung wird vorbereitet (nur beim ersten Mal) …'; };
    // Ganzes Bild, dann Ausschnitte. Die Charge wird aus Text nicht übernommen (Punktdruck oft falsch gelesen).
    let found = parseExpiryText(await recognizeText(big, progress, { sparse: true }));
    let n = 0;
    if (!found.expiry) {
      for await (const tile of imageTiles(big)) {
        info.textContent = `Datum wird gesucht … (${++n}/21)`;
        found = parseExpiryText(await recognizeText(tile, progress, { sparse: true }));
        if (found.expiry) break;
      }
    }
    if (!found.expiry) {
      info.className = 'warn';
      info.textContent = 'Kein Datum gefunden. Tipp: „Ablaufdatum scannen“ verwenden und das Datum in den Rahmen halten, oder Monat/Jahr eingeben. Eingeprägte Daten (ohne Farbe) sind kaum lesbar.';
      return;
    }
    setExpiryFromScan({ expiry: found.expiry }, 'Foto');
  } catch (err) {
    info.className = 'warn';
    info.textContent = 'Lesen fehlgeschlagen: ' + err.message;
  }
});

// ---------- Erkennen ohne Packung (Foto + Texterkennung) ----------
$('#btnRecognize').addEventListener('click', () => $('#recognizeInput').click());

$('#recognizeInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const info = $('#scanInfo');
  $('#suggestions').hidden = true;
  info.hidden = false;
  info.textContent = 'Foto wird gelesen …';
  try {
    const big = await photos.resizeImage(file, 1800, 0.9);
    // 1. Ist ein Strichcode oder DataMatrix-Code im Bild? Der ist zuverlässiger als Text.
    info.textContent = 'Suche Strichcode im Foto …';
    const code = await decodeImage(big).catch(() => null);
    if (code && parseBarcode(code).type !== 'text') {
      await applyScan(code);
      return;
    }
    // 2. Sonst den aufgedruckten Text lesen
    const text = await recognizeText(big, m => {
      if (m.status === 'recognizing text') info.textContent = `Text wird erkannt … ${Math.round(m.progress * 100)} %`;
      else if (/load|initializ/.test(m.status)) info.textContent = 'Texterkennung wird vorbereitet (nur beim ersten Mal) …';
    });
    info.textContent = 'Suche in der Swissmedic-Liste …';
    renderSuggestions(await searchByText(text), text);
  } catch (err) {
    info.textContent = 'Erkennung fehlgeschlagen: ' + err.message;
  }
});

const TABLET_NOTE = '<p>⚠️ Lose Tabletten ohne Aufdruck lassen sich nicht sicher erkennen. Nimm nichts ein, was du nicht eindeutig zuordnen kannst. Im Zweifel in der Apotheke nachfragen.</p>';

function renderSuggestions(hits, text) {
  const info = $('#scanInfo');
  const box = $('#suggestions');
  box.hidden = false;
  if (!hits.length) {
    // Kein Arzneimittel gefunden (z. B. Pflaster): gelesene Zeilen als Namen anbieten
    const lines = [...new Set(text.split('\n')
      .map(l => l.replace(/[|_~®™•]+/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(l => l.length >= 4 && l.length <= 50 && (l.match(/[a-zäöüéèà]/gi) || []).length / l.length > 0.6))]
      .slice(0, 6);
    if (!lines.length) {
      info.textContent = 'Kein Text erkannt. Tipp: Bei gutem Licht, ohne Spiegelung, nah an den aufgedruckten Namen gehen.';
      box.innerHTML = TABLET_NOTE;
      return;
    }
    info.textContent = 'Kein Arzneimittel aus der Swissmedic-Liste. Gelesenen Text als Namen übernehmen?';
    box.innerHTML = lines.map((l, i) => `<button type="button" class="suggestion" data-line="${i}"><strong>${esc(l)}</strong></button>`).join('')
      + '<p>Mehrere antippen, um sie zu kombinieren (z. B. Marke + Produkt).</p>';
    box.onclick = ev => {
      const b = ev.target.closest('[data-line]');
      if (!b) return;
      const l = lines[+b.dataset.line];
      F.name.value = F.name.value ? `${F.name.value} ${l}` : l;
      b.classList.add('picked');
      autoFormFromName();
      info.textContent = '✓ Als Name übernommen. Bei Bedarf noch anpassen.';
    };
    return;
  }
  info.textContent = `${hits.length === 1 ? '1 Vorschlag' : hits.length + ' Vorschläge'}: bitte den richtigen antippen und kontrollieren.`;
  box.innerHTML = hits.map((h, i) => `
    <button type="button" class="suggestion" data-i="${i}">
      <strong>${esc(h.name)}</strong>${h.rx ? '<span class="badge rx">℞</span>' : ''}
      <small>${esc([h.substance, formById(h.form).label].filter(Boolean).join(' · '))}</small>
    </button>`).join('') + TABLET_NOTE;
  box.onclick = ev => {
    const b = ev.target.closest('.suggestion');
    if (!b) return;
    for (const [k, v] of Object.entries(hits[+b.dataset.i])) {
      const el = F[k];
      if (!el || v == null || v === '') continue;
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    }
    box.hidden = true;
    info.textContent = '✓ Übernommen. Bitte Menge und Ablaufdatum ergänzen (steht meist auf dem Blister-Rand).';
    updateFormHint(); updateRxWarn();
  };
}

// ---------- Scanner ----------
const scanDlg = $('#scanDialog');
let stopScan = null;
let scanHandler = null;

let scanMode = 'code'; // 'code' = Strichcode/QR, 'date' = Ablaufdatum lesen

function setScanMode(mode) {
  scanMode = mode;
  scanDlg.classList.toggle('date-mode', mode === 'date');
  $('#manualRow').hidden = mode === 'date';
  $('#btnScanPhoto').textContent = mode === 'date' ? '📷 Stattdessen Foto wählen' : '📷 Stattdessen Foto aufnehmen';
}

async function openScanner(handler, hint) {
  setScanMode('code');
  scanHandler = handler;
  $('#manualCode').value = '';
  $('#scanStatus').textContent = 'Kamera wird gestartet …';
  $('#btnScanPhoto').hidden = handler !== applyScan;
  scanDlg.showModal();
  // Nicht das Eingabefeld fokussieren, sonst öffnet sich die Tastatur und verdeckt die Kamera
  $('#btnScanClose').focus();
  try {
    stopScan = await startScanner($('#scanVideo'), text => { closeScanner(); handler(text); });
    $('#scanStatus').textContent = hint;
  } catch (e) {
    $('#scanStatus').textContent = (e.name === 'NotAllowedError' ? 'Kein Kamerazugriff erlaubt.' : e.message) + ' Du kannst den Code unten eintippen.';
  }
}
function closeScanner() {
  stopScan?.(); stopScan = null;
  if (scanDlg.open) scanDlg.close();
}
scanDlg.addEventListener('close', () => { stopScan?.(); stopScan = null; });
$('#btnScanClose').addEventListener('click', closeScanner);
$('#btnScanPhoto').addEventListener('click', () => {
  const input = scanMode === 'date' ? '#expiryInput' : '#recognizeInput';
  closeScanner();
  $(input).click();
});

// Datumskamera: liest laufend nur den Rahmen-Ausschnitt, bis zweimal dasselbe Datum erkannt wurde
async function openDateScanner() {
  setScanMode('date');
  $('#btnScanPhoto').hidden = false;
  const status = $('#scanStatus');
  status.textContent = 'Kamera wird gestartet …';
  scanDlg.showModal();
  $('#btnScanClose').focus();
  let alive = true;
  let stopCam;
  try {
    stopCam = await startCamera($('#scanVideo'));
  } catch (e) {
    status.textContent = (e.name === 'NotAllowedError' ? 'Kein Kamerazugriff erlaubt.' : e.message) + ' Du kannst stattdessen ein Foto wählen.';
    return;
  }
  stopScan = () => { alive = false; stopCam(); };
  if (!scanDlg.open) return stopScan();
  status.textContent = 'Texterkennung wird vorbereitet …';
  await preloadOcr().catch(() => {});
  status.textContent = 'Ablaufdatum in den Rahmen halten, möglichst nah und gerade.';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let last = null;
  while (alive) {
    const canvas = grabFrameRegion($('#scanVideo'), $('#scanFrame'));
    if (!canvas) { await sleep(200); continue; }
    let found = {};
    try { found = parseExpiryText(await recognizeText(canvas, null, { sparse: true })); } catch { /* weiter */ }
    if (!alive) return;
    if (found.expiry && found.expiry === last) {
      closeScanner();
      setExpiryFromScan({ expiry: found.expiry }, 'Kamera');
      return;
    }
    if (found.expiry) status.textContent = `Gelesen: ${fmtMonth(found.expiry)}. Bitte kurz ruhig halten …`;
    else if (last) status.textContent = 'Ablaufdatum in den Rahmen halten, möglichst nah und gerade.';
    last = found.expiry || null;
    await sleep(150);
  }
}

function setExpiryFromScan(found, via) {
  const info = $('#expiryInfo');
  info.hidden = false;
  info.className = 'scaninfo';
  setMonth(F.expiry, found.expiry);
  const parts = [`Ablauf ${fmtMonth(found.expiry)}`];
  $('#btnExpiryPhoto').classList.remove('attention');
  info.textContent = `✓ ${parts.join(' · ')} (${via}). Bitte kurz mit der Packung vergleichen.`;
}
$('#btnManual').addEventListener('click', () => {
  const v = $('#manualCode').value.trim();
  if (!v) return;
  closeScanner();
  scanHandler?.(v);
});
$('#manualCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnManual').click(); });
$('#btnScan').addEventListener('click', () =>
  openScanner(applyScan, 'Am besten den quadratischen DataMatrix-Code scannen, er enthält auch das Ablaufdatum.'));

// ---------- Verbunden ----------
let lastShareCode = '';

function renderLinked() {
  const n = sharedItems().length;
  $('#shareCount').innerHTML = n
    ? `<b>${n}</b> Artikel werden geteilt.`
    : 'Momentan teilst du keine Artikel. Aktiviere „Teilen“ beim jeweiligen Artikel.';

  const q = $('#linkedSearch').value.trim();
  const { linked } = store.getState();
  if (!linked.length) {
    $('#linkedList').innerHTML = '<p class="muted" style="text-align:center">Noch keine Haushalte verbunden.</p>';
    return;
  }
  $('#linkedList').innerHTML = linked.map(h => {
    const items = h.items.filter(i => matches(i, q))
      .sort((a, b) => (a.expiry || '').localeCompare(b.expiry || ''));
    if (q && !items.length) return '';
    return `
      <div class="card household">
        <div class="household-head">
          <div>
            <h2>🏠 ${esc(h.name)}</h2>
            <p class="muted small">${h.items.length} geteilte Artikel · Stand ${fmtDate(h.sharedAt?.slice(0, 10))}</p>
          </div>
          <button class="btn ghost small" data-remove="${esc(h.id)}">Entfernen</button>
        </div>
        <ul class="list">${items.map(i => itemCard(i, { readonly: true })).join('') || '<p class="muted small">Keine Artikel.</p>'}</ul>
      </div>`;
  }).join('') || '<p class="muted" style="text-align:center">Kein verbundener Haushalt hat das.</p>';
}

$('#linkedSearch').addEventListener('input', renderLinked);
$('#linkedList').addEventListener('click', e => {
  const id = e.target.closest('[data-remove]')?.dataset.remove;
  if (id && confirm('Diesen Haushalt entfernen?')) { store.removeLinked(id); renderLinked(); }
});

$('#btnShare').addEventListener('click', async () => {
  if (!sharedItems().length && !confirm('Du teilst aktuell keine Artikel. Trotzdem einen (leeren) Code erstellen, damit der andere Haushalt dich sieht?')) return;
  lastShareCode = await buildShareCode();
  const link = shareLink(lastShareCode);
  const box = $('#qr');
  box.innerHTML = '';
  try {
    const qr = qrcode(0, 'L');
    qr.addData(link);
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } catch {
    box.innerHTML = '<p class="muted small" style="color:#333">Zu viele Artikel für einen QR-Code. Bitte den Link senden.</p>';
  }
  $('#sharePanel').hidden = false;
  $('#btnShareNative').hidden = !navigator.share;
});
$('#btnCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(shareLink(lastShareCode)); toast('Link kopiert'); }
  catch { prompt('Link kopieren:', shareLink(lastShareCode)); }
});
$('#btnShareNative').addEventListener('click', () => {
  navigator.share({ title: 'Apoko: ' + store.getState().household.name, text: 'Verbinde dich mit meiner Hausapotheke:', url: shareLink(lastShareCode) }).catch(() => {});
});

async function join(input) {
  try {
    const snap = await parseShareCode(input);
    const exists = store.getState().linked.some(h => h.id === snap.id);
    if (!confirm(`${exists ? 'Aktualisieren' : 'Verbinden'}: „${snap.name}“ mit ${snap.items.length} geteilten Artikeln?`)) return;
    const res = store.upsertLinked(snap);
    toast(res === 'updated' ? `„${snap.name}“ aktualisiert` : `„${snap.name}“ verbunden`);
    $('#joinCode').value = '';
    showView('linked');
  } catch (e) { alert(e.message); }
}
$('#btnJoin').addEventListener('click', () => join($('#joinCode').value));
$('#btnJoinScan').addEventListener('click', () => openScanner(join, 'QR-Code des anderen Haushalts in den Rahmen halten.'));

function handleHash() {
  const m = /#join=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  join(m[1]);
}
window.addEventListener('hashchange', handleHash);

// ---------- Checkliste ----------
function renderChecklist() {
  const items = store.getState().items.filter(i => store.expiryStatus(i).status !== 'expired');
  $('#checklist').innerHTML = CHECKLIST.map(c => {
    const hits = items.filter(i => {
      const hay = [i.name, i.substance].join(' ').toLowerCase();
      return c.keys.some(k => hay.includes(k)) || (c.forms || []).includes(i.form);
    });
    return `<li><span class="mark">${hits.length ? '✅' : '⬜️'}</span>
      <div><div>${esc(c.label)}</div>${hits.length ? `<div class="have">${esc(hits.map(h => h.name).join(', '))}</div>` : ''}</div></li>`;
  }).join('');
  $('#tips').innerHTML = `<h2>Gut zu wissen</h2>
    <p class="small">🗓️ ${esc(NOTES.expiry)}</p>
    <p class="small">🌡️ ${esc(NOTES.storage)}</p>
    <p class="small">♻️ ${esc(NOTES.disposal)}</p>
    <p class="small">℞ ${esc(NOTES.rxShare)}</p>`;
}

// ---------- Einstellungen ----------
$('#householdName').value = store.getState().household.name;
$('#householdName').addEventListener('change', e => { store.setHouseholdName(e.target.value); toast('Name gespeichert'); });
$('#btnExport').addEventListener('click', async () => {
  const data = JSON.parse(store.exportBackup());
  data.photos = {};
  try {
    for (const [id, b] of Object.entries(await photos.allPhotos())) data.photos[id] = await photos.blobToDataUrl(b);
  } catch { /* Sicherung dann ohne Fotos */ }
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `apoko-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#fileImport').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    if (!confirm('Aktuelle Daten durch die Sicherung ersetzen?')) return;
    store.importBackup(text);
    const pics = JSON.parse(text).photos || {};
    for (const [id, url] of Object.entries(pics)) await photos.savePhoto(id, await photos.dataUrlToBlob(url));
    renderInventory();
    $('#householdName').value = store.getState().household.name;
    toast('Sicherung wiederhergestellt');
  } catch (err) { alert(err.message); }
  finally { e.target.value = ''; }
});
$('#btnReset').addEventListener('click', () => {
  if (!confirm('Wirklich ALLE Daten auf diesem Gerät löschen?')) return;
  store.resetAll();
  photos.allPhotos().then(all => Object.keys(all).forEach(id => photos.deletePhoto(id))).catch(() => {});
  $('#householdName').value = store.getState().household.name;
  toast('Alle Daten gelöscht');
});

// ---------- Start ----------
store.onChange(() => { renderInventory(); if ($('#view-linked').classList.contains('active')) renderLinked(); });
renderInventory();
handleHash();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
