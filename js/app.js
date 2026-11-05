import { parseBarcode, swissmedicInfo, normalizeGtin } from './gs1.js';
import { FORMS, UNITS, CATEGORIES, CHECKLIST, NOTES, FORM_USES, PRODUCT_TYPES, looksFrench, formById } from './knowledge.js';
import * as store from './store.js';
import { startScanner, decodeImage, startCamera } from './scanner.js';
import { lookupSwissDrug, searchByText, searchByName, guessForm } from './drugdb.js';
import { lookupOpenProduct } from './productdb.js';
import * as photos from './photos.js';
import { recognizeText } from './ocr.js';
import { researchProduct, getApiKey, setApiKey } from './research.js';
import { SYMPTOMS, EMERGENCY, detectSymptoms, adviseFor } from './advice.js';
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
  el.value = el.type === 'month' || el.type === 'hidden' ? iso.slice(0, 7) : fmtMonth(iso);
  if (el === document.querySelector('#itemForm [name=expiry]')) syncPicker();
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
  if (name === 'help') renderHelp();
  if (name === 'settings') { renderLocationSettings(); renderPeople(); }
  window.scrollTo(0, 0);
}
$$('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));

// ---------- Vorrat ----------
/** Kurz: „17 Monate“, „45 Tage“, „Abgelaufen“. */
function describeDays(days) {
  if (days == null) return 'Kein Datum';
  if (days < 0) return 'Abgelaufen';
  if (days === 0) return 'Heute';
  if (days < 60) return `${days} ${days === 1 ? 'Tag' : 'Tage'}`;
  const months = Math.round(days / 30.4);
  return months < 24 ? `${months} Monate` : `${Math.round(days / 365)} Jahre`;
}

// Symbol als Platzhalter, wenn kein Produktbild da ist
const FORM_ICON = {
  tablette: '💊', kapsel: '💊', brausetablette: '🫧', lutschtablette: '🍬', pulver: '🧂',
  sirup: '🧴', tropfen: '💧', augentropfen: '👁️', ohrentropfen: '👂', nasenspray: '👃', spray: '🧴',
  inhalator: '🌬️', salbe: '🧴', zaepfchen: '💊', pflaster: '🩹', injektion: '💉', loesung: '🧪',
  medizinprodukt: '🩺', andere: '📦',
};

function matches(item, q) {
  if (!q) return true;
  const hay = [item.name, item.substance, item.strength, item.usage, item.location, item.person, item.notes, formById(item.form).label]
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

function itemCard(item, { readonly = false, tag = 'li' } = {}) {
  const st = store.expiryStatus(item);
  const form = formById(item.form);
  const pct = item.quantity > 0 && item.remaining != null ? Math.max(0, Math.min(100, item.remaining / item.quantity * 100)) : null;
  const icon = `<span class="thumb ph" aria-hidden="true">${FORM_ICON[form.id] || '📦'}</span>`;
  const thumb = readonly ? icon
    : item.imageUrl ? `<img class="thumb" src="${esc(item.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : photoKeys(item)[0] ? `<img class="thumb" data-photo="${esc(photoKeys(item)[0])}" alt="">`
    : icon;
  return `
    <${tag} class="item ${st.status}${st.recent ? ' recent' : ''}" ${readonly ? '' : `data-id="${esc(item.id)}" tabindex="0"`}>
      ${thumb}
      <div class="main">
        <h3>${esc(item.name)}${item.strength && !item.name.toLowerCase().includes(item.strength.toLowerCase()) ? ` <span class="muted">${esc(item.strength)}</span>` : ''}</h3>
        <div class="badges">
          ${st.status === 'unknown' ? '' : `<span class="badge ${st.status}${st.recent ? ' recent' : ''}" title="${st.eff ? 'bis ' + fmtMonth(st.eff.date) : ''}">${describeDays(st.days)}</span>`}
          ${item.rx ? `<span class="badge rx">℞${item.category ? ' ' + esc(item.category) : ''}</span>` : ''}
          ${!readonly && item.shared ? '<span class="badge shared">🔗</span>' : ''}
          ${!readonly && (item.location || item.person) ? `<span class="loc">${esc([item.location && '📍 ' + item.location, item.person && '👤 ' + item.person].filter(Boolean).join('  '))}</span>` : ''}
        </div>
      </div>
      <div class="right">
        <div>${esc(amountText(item))}</div>
        ${pct != null ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}
      </div>
    </${tag}>`;
}

function renderInventory() {
  const { items, household } = store.getState();
  $('#householdLabel').textContent = household.name;
  renderLocationFilter();

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
    .filter(x => passFilter(x.i, x.st) && passLocation(x.i) && matches(x.i, query))
    .sort((a, b) => order[a.st.status] - order[b.st.status] || (a.st.days ?? 1e9) - (b.st.days ?? 1e9) || a.i.name.localeCompare(b.i.name));

  // Jede Zeile: roter Löschen-Knopf hinten, Karte darüber (nach links wischen zeigt den Knopf)
  $('#itemList').innerHTML = list.map(x => `<li class="swipe-row">
      <button type="button" class="swipe-del" data-del="${esc(x.i.id)}" tabindex="-1">🗑️<span>Löschen</span></button>
      ${itemCard(x.i, { tag: 'div' })}
    </li>`).join('') ||
    (items.length ? '<p class="muted" style="text-align:center">Keine Treffer für diesen Filter.</p>' : '');
  $('#emptyState').hidden = items.length > 0;
  $$('#itemList img[data-photo]').forEach(async img => {
    const url = await photos.photoUrl(img.dataset.photo);
    if (url) img.src = url;
    else img.replaceWith(Object.assign(document.createElement('span'), { className: 'thumb ph', textContent: '📦' }));
  });
  $$('#filters .chip').forEach(c => c.classList.toggle('active', c.dataset.filter === filter));
}

function setFilter(f) { filter = f; renderInventory(); }
$('#filters').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (b) setFilter(b.dataset.filter); });
$('#stats').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (b) setFilter(b.dataset.filter); });
$('#search').addEventListener('input', e => { query = e.target.value.trim(); renderInventory(); });
// ---- Nach links wischen zum Löschen ----
const SWIPE_OPEN = -104;
let swipe = null;      // laufende Geste
let openCard = null;   // aktuell aufgeschobene Karte
let suppressClick = false;

function setOffset(card, x, animate) {
  card.style.transition = animate ? 'transform .2s ease' : 'none';
  card.style.transform = x ? `translateX(${x}px)` : '';
  card.closest('.swipe-row')?.classList.toggle('revealed', x < 0);
}
function closeOpenCard() {
  if (openCard) setOffset(openCard, 0, true);
  openCard = null;
}

$('#itemList').addEventListener('pointerdown', e => {
  const card = e.target.closest('.swipe-row > .item');
  if (!card || e.button > 0) return;
  if (openCard && openCard !== card) closeOpenCard();
  swipe = { card, x0: e.clientX, y0: e.clientY, base: card === openCard ? SWIPE_OPEN : 0, dx: 0, active: false, id: e.pointerId };
});
$('#itemList').addEventListener('pointermove', e => {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x0, dy = e.clientY - swipe.y0;
  if (!swipe.active) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; } // senkrecht = scrollen
    if (Math.abs(dx) < 10) return;
    swipe.active = true;
    swipe.card.setPointerCapture(e.pointerId);
  }
  swipe.dx = dx;
  setOffset(swipe.card, Math.max(SWIPE_OPEN - 30, Math.min(0, swipe.base + dx)), false);
});
function endSwipe(e) {
  if (!swipe || e.pointerId !== swipe.id) return;
  const { card, active, base, dx } = swipe;
  swipe = null;
  if (!active) return;
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 50);
  if (base + dx < SWIPE_OPEN / 2) { setOffset(card, SWIPE_OPEN, true); openCard = card; }
  else { setOffset(card, 0, true); if (openCard === card) openCard = null; }
}
$('#itemList').addEventListener('pointerup', endSwipe);
$('#itemList').addEventListener('pointercancel', endSwipe);

$('#itemList').addEventListener('click', e => {
  if (suppressClick) return;
  const del = e.target.closest('[data-del]');
  if (del) {
    const item = store.getState().items.find(i => i.id === del.dataset.del);
    if (item && confirm(`„${item.name}“ wirklich löschen?`)) {
      photoKeys(item).forEach(k => photos.deletePhoto(k));
      openCard = null;
      store.deleteItem(item.id);
      toast('Gelöscht');
    } else closeOpenCard();
    return;
  }
  const li = e.target.closest('.item[data-id]');
  if (!li) return;
  // Ist eine Karte aufgeschoben, schliesst ein Tippen sie zuerst
  if (openCard) return closeOpenCard();
  if (e.target.closest('img.thumb')) {
    const it = store.getState().items.find(i => i.id === li.dataset.id);
    return openViewer(itemImageSources(it), 0);
  }
  openItem(store.getState().items.find(i => i.id === li.dataset.id));
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
$('#productTypeSelect').innerHTML = PRODUCT_TYPES.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join('');
$('#categorySelect').innerHTML = CATEGORIES.map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('');

function fillDatalists() {
  const { items } = store.getState();
  const uniq = key => [...new Set(items.map(i => i[key]).filter(Boolean))].sort();
  const names = [...new Set([...store.getState().people.map(p => p.label), ...uniq('person')])];
  $('#persons').innerHTML = names.map(v => `<option value="${esc(v)}">`).join('');
  renderLocationChips();
}

// ---------- Ablaufdatum: Monate links, Jahre rechts ----------
const pick = { m: null, y: null };

// Jahre: neuestes = in 4 Jahren (heute 2030), absteigend 11 Jahre, als letzter Knopf „älter“
const OLD_YEAR = () => new Date().getFullYear() + 4 - 11; // „älter“ wird als dieses Jahr gespeichert (heute 2019)

function pickerYears() {
  const now = new Date().getFullYear();
  return Array.from({ length: 11 }, (_, i) => now + 4 - i);
}

const isOld = y => y != null && y <= OLD_YEAR();

function renderPicker() {
  $('#mpMonths').innerHTML = Array.from({ length: 12 }, (_, i) => i + 1)
    .map(m => `<button type="button" data-m="${m}" class="${pick.m === m && !isOld(pick.y) ? 'active' : ''}">${m}</button>`).join('');
  $('#mpYears').innerHTML = pickerYears()
    .map(y => `<button type="button" data-y="${y}" class="${pick.y === y ? 'active' : ''}">${y}</button>`).join('')
    + `<button type="button" data-y="old" class="${isOld(pick.y) ? 'active' : ''}">älter</button>`;
  $('#mpShow').textContent = isOld(pick.y) ? 'älter (abgelaufen)'
    : pick.m || pick.y ? `${pick.m ? String(pick.m).padStart(2, '0') : '––'}/${pick.y || '––––'}` : '';
  $('#mpClear').hidden = !(pick.m || pick.y);
}

/** Auswahl aus dem (versteckten) Feld übernehmen. */
function syncPicker() {
  const m = /^(\d{4})-(\d{2})/.exec(F.expiry.value || '');
  pick.y = m ? +m[1] : null;
  pick.m = m ? +m[2] : null;
  renderPicker();
}

function commitPicker() {
  // „älter“: Monat egal, längst abgelaufen
  if (isOld(pick.y)) F.expiry.value = `${pick.y}-${String(pick.m || 12).padStart(2, '0')}`;
  else F.expiry.value = pick.m && pick.y ? `${pick.y}-${String(pick.m).padStart(2, '0')}` : '';
  renderPicker();
}

$('.month-picker').addEventListener('click', e => {
  const b = e.target.closest('[data-m], [data-y]');
  if (!b) return;
  if (b.dataset.m) pick.m = pick.m === +b.dataset.m ? null : +b.dataset.m;
  if (b.dataset.y === 'old') pick.y = isOld(pick.y) ? null : OLD_YEAR();
  else if (b.dataset.y) pick.y = pick.y === +b.dataset.y ? null : +b.dataset.y;
  commitPicker();
});
$('#mpClear').addEventListener('click', () => { pick.m = pick.y = null; commitPicker(); });

// ---------- Standorte ----------
const sameLoc = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

function renderLocationChips() {
  const current = F.location.value;
  $('#locationChips').innerHTML = store.getState().locations
    .map(l => `<button type="button" class="chip loc${sameLoc(l, current) ? ' active' : ''}" data-loc="${esc(l)}">📍 ${esc(l)}</button>`)
    .join('');
}
$('#locationChips').addEventListener('click', e => {
  const b = e.target.closest('[data-loc]');
  if (!b) return;
  // Nochmals antippen = abwählen
  F.location.value = sameLoc(F.location.value, b.dataset.loc) ? '' : b.dataset.loc;
  if (F.location.value) F.location.classList.remove('field-invalid');
  renderLocationChips();
});
F.location.addEventListener('input', renderLocationChips);

let locationFilter = '';
function renderLocationFilter() {
  const { locations, items } = store.getState();
  const used = [...new Set(items.map(i => (i.location || '').trim()).filter(Boolean))];
  const all = [...locations, ...used.filter(u => !locations.some(l => sameLoc(l, u)))];
  if (locationFilter && locationFilter !== '__none' && !all.some(l => sameLoc(l, locationFilter))) locationFilter = '';
  $('#locationFilter').innerHTML = '<option value="">Alle Standorte</option>'
    + all.map(l => `<option${sameLoc(l, locationFilter) ? ' selected' : ''}>${esc(l)}</option>`).join('')
    + (items.some(i => !i.location) ? `<option value="__none"${locationFilter === '__none' ? ' selected' : ''}>Ohne Standort</option>` : '');
  $('#locationFilter').hidden = !all.length;
}
$('#locationFilter').addEventListener('change', e => { locationFilter = e.target.value; renderInventory(); });
const passLocation = item => !locationFilter
  || (locationFilter === '__none' ? !item.location : sameLoc(item.location, locationFilter));

function renderLocationSettings() {
  const { locations, items } = store.getState();
  $('#locationList').innerHTML = locations.length
    ? locations.map(l => {
      const n = items.filter(i => sameLoc(i.location, l)).length;
      return `<li><span class="locname">📍 ${esc(l)}</span><span class="count">${n} Artikel</span>
        <button class="btn ghost" data-rename="${esc(l)}">Umbenennen</button>
        <button class="btn ghost" data-remove-loc="${esc(l)}" aria-label="${esc(l)} löschen">✕</button></li>`;
    }).join('')
    : '<li class="muted small">Noch keine Standorte.</li>';
}
$('#btnAddLocation').addEventListener('click', () => {
  const v = $('#newLocation').value.trim();
  if (!v) return;
  if (store.addLocation(v)) toast(`Standort „${v}“ gespeichert`);
  else toast('Diesen Standort gibt es schon.');
  $('#newLocation').value = '';
});
$('#newLocation').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnAddLocation').click(); });
$('#locationList').addEventListener('click', e => {
  const del = e.target.closest('[data-remove-loc]')?.dataset.removeLoc;
  const ren = e.target.closest('[data-rename]')?.dataset.rename;
  if (del && confirm(`Standort „${del}“ aus der Liste löschen? Artikel behalten ihren Eintrag.`)) store.removeLocation(del);
  if (ren) {
    const nn = prompt('Neuer Name für den Standort:', ren);
    if (nn && nn.trim() && nn.trim() !== ren) store.renameLocation(ren, nn);
  }
});

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
  if (f && FORM_USES[f] && !F.usage.value) F.usage.value = FORM_USES[f];
  if ((f === 'pflaster' || f === 'medizinprodukt') && !F.productType.value) F.productType.value = 'medizinprodukt';
}
F.name.addEventListener('change', autoFormFromName);

// Namensvorschläge beim Eintippen (Swissmedic-Liste)
let nameTimer, nameHits = [];
F.name.addEventListener('input', () => {
  clearTimeout(nameTimer);
  nameTimer = setTimeout(async () => {
    const box = $('#nameSuggest');
    if (F.name.value.trim().length < 3) { box.hidden = true; return; }
    nameHits = await searchByName(F.name.value);
    box.hidden = !nameHits.length;
    box.innerHTML = nameHits.map((h, i) => `<button type="button" data-nh="${i}"><strong>${esc(h.name)}</strong><small>${esc([h.manufacturer, h.usage].filter(Boolean).join(' · '))}</small></button>`).join('');
  }, 200);
});
$('#nameSuggest').addEventListener('click', e => {
  const b = e.target.closest('[data-nh]');
  if (!b) return;
  const h = nameHits[+b.dataset.nh];
  for (const [k, v] of Object.entries(h)) {
    const el = F[k];
    if (!el || v == null || v === '') continue;
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  }
  $('#nameSuggest').hidden = true;
  $('#suggestions').hidden = true;
  updateFormHint(); updateRxWarn();
  toast('Angaben aus der Swissmedic-Liste übernommen');
});
F.name.addEventListener('blur', () => setTimeout(() => { $('#nameSuggest').hidden = true; }, 250));

// ---------- Fotos eines Artikels (Galerie) ----------
// Eigene Fotos liegen in IndexedDB; item.photos = Liste der Schlüssel (das erste ist das Frontbild).
// Ältere Artikel hatten ein einzelnes Foto unter der Artikel-ID.
function photoKeys(item) {
  if (!item) return [];
  if (Array.isArray(item.photos)) return item.photos;
  return item.hasPhoto ? [item.id] : [];
}

/** Alle Bilder eines Artikels für die Bildansicht: offizielles Frontbild zuerst. */
function itemImageSources(item) {
  const list = [];
  if (item.imageUrl) list.push({ src: item.imageUrl });
  for (const k of photoKeys(item)) list.push({ key: k });
  return list;
}

let scanNote = '';      // Hinweis zum gescannten Code (z. B. nicht in der Swissmedic-Liste)
let gallery = [];        // { key?, blob?, url }
let removedKeys = [];

function renderGallery() {
  const tiles = [];
  if (F.imageUrl.value) tiles.push({ url: F.imageUrl.value, official: true });
  gallery.forEach((g, i) => tiles.push({ url: g.url, idx: i }));
  $('#gallery').innerHTML = tiles.map((t, n) => `
    <div class="gtile">
      <button type="button" class="gimg" data-view="${n}"><img src="${esc(t.url || '')}" alt="" referrerpolicy="no-referrer"></button>
      ${n === 0 ? '<span class="gbadge">Front</span>' : '<span class="gbadge info">nur Info</span>'}
      ${n === 0 && !t.official ? `<button type="button" class="gcrop" data-crop="${t.idx}" aria-label="Zuschneiden">✂️</button>` : ''}
      ${t.official ? '<span class="gbadge src">offiziell</span>' : ''}
      <button type="button" class="gdel" ${t.official ? 'data-del-official' : `data-del-photo="${t.idx}"`} aria-label="Bild entfernen">✕</button>
    </div>`).join('') + `
    <label class="gtile gadd" aria-label="Foto hinzufügen">＋<span>Foto</span>
      <input id="photoInput" type="file" accept="image/*" capture="environment" hidden>
    </label>`;
  $('#photoHint').hidden = tiles.length > 0;
  if (F.imageUrl.value) $('#photoSource').textContent = `Frontbild: ${F.imageUrl.dataset.source || 'Open Products Facts'} (CC BY-SA)`;
  $('#photoSource').hidden = !F.imageUrl.value;
  // Eigene Fotos asynchron laden
  gallery.forEach((g, i) => {
    if (g.url || !g.key) return;
    photos.photoUrl(g.key).then(url => {
      g.url = url;
      const img = $(`#gallery [data-view="${i + (F.imageUrl.value ? 1 : 0)}"] img`);
      if (img && url) img.src = url;
    });
  });
}

$('#gallery').addEventListener('change', e => {
  if (e.target.id === 'photoInput') addPhoto(e.target.files[0]);
});

/** Foto ablegen (das erste ist das Frontbild) und gleich auslesen. */
async function addPhoto(file) {
  if (!file) return;
  try {
    const blob = await photos.resizeImage(file, 1400, 0.85);
    gallery.push({ blob, url: URL.createObjectURL(blob) });
    renderGallery();
    await analyzePhoto(file);
  } catch { toast('Foto konnte nicht gelesen werden.'); }
}
$('#gallery').addEventListener('click', e => {
  const del = e.target.closest('[data-del-photo]');
  if (del) {
    const [g] = gallery.splice(+del.dataset.delPhoto, 1);
    if (g?.key) removedKeys.push(g.key);
    return renderGallery();
  }
  if (e.target.closest('[data-del-official]')) { F.imageUrl.value = ''; return renderGallery(); }
  const c = e.target.closest('[data-crop]');
  if (c) return openCrop(+c.dataset.crop);
  const v = e.target.closest('[data-view]');
  if (v) {
    const list = [];
    if (F.imageUrl.value) list.push({ src: F.imageUrl.value });
    gallery.forEach(g => list.push({ src: g.url, key: g.key }));
    openViewer(list, +v.dataset.view);
  }
});

function openItem(item) {
  form.reset();
  $$('.field-invalid', form).forEach(el => el.classList.remove('field-invalid'));
  $('#scanInfo').hidden = true;
  $('#scanInfo').textContent = '';
  scanNote = '';
  $('#suggestions').hidden = true;
  $('#nameSuggest').hidden = true;
  formTouched = !!item;
  gallery = photoKeys(item).map(key => ({ key, url: '' }));
  removedKeys = [];
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
  syncPicker();
  renderGallery();
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
    usage: F.usage.value.trim(),
    atc: F.atc.value.trim(),
    manufacturer: F.manufacturer.value.trim(),
    productType: F.productType.value,
    info: F.info.value.trim(),
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
  if (!F.location.value.trim()) return flagField(F.location, 'Bitte einen Standort wählen oder eingeben.');
  // Ablaufdatum ist optional; nur ein unvollständig eingetipptes Datum wird beanstandet
  if (!F.expiry.value && (pick.m || pick.y)) { toast('Ablaufdatum unvollständig: bitte Monat und Jahr wählen oder leeren.'); return $('.month-picker').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  const item = readForm();
  const isNew = !item.id;
  item.id ||= store.uid();
  if (item.remaining != null && item.quantity != null && item.remaining > item.quantity)
    return toast('„Noch vorhanden“ ist grösser als die Packungsgrösse.');
  if (item.rx && item.shared && !confirm(NOTES.rxShare + '\n\nTrotzdem teilen?')) return;
  // Nur ein Bild pro Artikel: das offizielle Frontbild, sonst das erste eigene Foto.
  // Weitere Fotos dienen nur dem Auslesen und werden verworfen.
  const keys = [];
  const front = item.imageUrl ? null : gallery[0];
  const discard = gallery.filter(g => g !== front && g.key).map(g => g.key);
  if (front?.key) keys.push(front.key);
  else if (front?.blob) {
    const key = `${item.id}:${store.uid()}`;
    try { await photos.savePhoto(key, front.blob); keys.push(key); }
    catch { toast('Foto konnte nicht gespeichert werden.'); }
  }
  for (const k of [...removedKeys, ...discard]) await photos.deletePhoto(k);
  item.photos = keys;
  item.hasPhoto = keys.length > 0;
  store.upsertItem(item);
  dlg.close();
  toast(isNew ? 'Erfasst' : 'Gespeichert');
});
$('[data-close]', dlg).addEventListener('click', () => dlg.close());
$('#btnDelete').addEventListener('click', () => {
  if (!confirm(`„${F.name.value}“ löschen?`)) return;
  const old = store.getState().items.find(i => i.id === F.id.value);
  photoKeys(old).forEach(k => photos.deletePhoto(k));
  store.deleteItem(F.id.value);
  dlg.close();
  toast('Gelöscht');
});
// „+ Erfassen“ öffnet direkt die Kamera für den Strichcode; Schliessen führt ins Formular
// „+ Erfassen“: Schritt 1 Strichcode scannen (legt schon Infos ab), Schritt 2 automatisch die Fotos
$('#fab').addEventListener('click', () => {
  openItem(null);
  openScanner(async code => { await applyScan(code); openCapture('add'); },
    'Schritt 1: Strichcode scannen, am besten den quadratischen Code, sonst den langen Strichcode.',
    { photoLabel: 'Kein Strichcode: weiter zu den Fotos →' });
});

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
      if (known.imageUrl) renderGallery();
      info.push('Produkt bekannt, Angaben übernommen');
    } else if (sm) {
      $('#scanInfo').hidden = false;
      $('#scanInfo').textContent = 'Suche in der Swissmedic-Liste …';
      const drug = await lookupSwissDrug(r.gtin);
      if (drug) {
        fill(drug);
        if (drug.usageDetail && drug.usageDetail !== drug.usage && !F.info.value) F.info.value = `• Anwendung laut Swissmedic: ${drug.usageDetail}`;
        info.push(drug.sameAuthorization
          ? 'Gefunden in der Swissmedic-Liste über die Zulassungsnummer (ältere Packung, Packungsgrösse bitte prüfen)'
          : 'Gefunden in der Swissmedic-Liste');
      } else {
        // Ältere Packungen (z. B. umbenannte Produkte) fehlen in der aktuellen Liste
        scanNote = `Strichcode gelesen (Swissmedic-Nr. ${sm.authNo}), aber nicht in der aktuellen Swissmedic-Liste, vermutlich eine ältere Packung.`;
        const prod = await lookupOpenProduct(r.gtin);
        if (prod) {
          fill({ name: prod.name, quantity: prod.quantity });
          if (prod.unit) F.unit.value = prod.unit;
          info.push(`Gefunden in ${prod.source}, bitte kontrollieren`);
        } else {
          info.push(scanNote + ' Der Name wird aus den Fotos gesucht.');
        }
      }
    } else {
      $('#scanInfo').hidden = false;
      $('#scanInfo').textContent = 'Suche in offenen Produktdatenbanken …';
      const prod = await lookupOpenProduct(r.gtin);
      if (prod) {
        fill({ name: prod.name, quantity: prod.quantity });
        const form = guessForm(prod.name);
        if (form) { F.form.value = form; F.unit.value = formById(form).unit; }
        if (form && FORM_USES[form] && !F.usage.value) F.usage.value = FORM_USES[form];
        if ((form === 'pflaster' || form === 'medizinprodukt') && !F.productType.value) F.productType.value = 'medizinprodukt';
        if (prod.unit) F.unit.value = prod.unit;
        if (prod.imageUrl) {
          F.imageUrl.value = prod.imageUrl;
          F.imageUrl.dataset.source = prod.source;
          renderGallery();
        }
        info.push(`Gefunden in ${prod.source}, bitte kontrollieren`);
      } else {
        info.push('Kein Arzneimittel und in keiner Datenbank gefunden: Name bitte einmal eintippen, beim nächsten Scan kennt die App das Produkt');
      }
    }
  }
  if (r.pzn) info.push(`PZN ${r.pzn}`);
  if (r.batch) F.batch.value = r.batch;
  if (r.count && !F.quantity.value) F.quantity.value = r.count;

  $('#scanInfo').hidden = false;
  $('#scanInfo').textContent = '✓ ' + info.join(' · ');
  updateFormHint(); updateRxWarn();
  if (!F.name.value) F.name.focus();
}

// ---------- Erkennen ohne Packung (Foto + Texterkennung) ----------
$('#btnRecognize').addEventListener('click', () => openCapture('add'));

/** Liest ein Foto aus: zuerst Strichcode/DataMatrix, sonst (falls noch kein Name) den aufgedruckten Text. */
async function analyzePhoto(file) {
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
    if (F.name.value.trim()) { info.hidden = true; return; } // Name schon bekannt: nichts weiter nötig
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
}

// ---------- Erfassen mit Fotos ----------
const capDlg = $('#captureDialog');
let capCam = null;
let capShots = [];
let capMode = 'new'; // 'new' = neuer Artikel, 'add' = Fotos zum offenen Artikel

function capRender() {
  const n = capShots.length;
  const known = F.name.value.trim();
  $('#capHint').innerHTML = n === 0
    ? `${known ? `✓ Erkannt: <strong>${esc(known)}</strong><br>` : ''}<strong>Schritt 2:</strong> Fotografiere die <strong>wichtigste Seite</strong> der Packung (Vorderseite mit dem Namen).`
    : `✓ ${n} Foto${n > 1 ? 's' : ''}. Fotografiere jetzt <strong>weitere relevante Seiten</strong>: Rückseite, Strichcode, Packungsinhalt (z. B. 100 ml). Dann <strong>Abschliessen</strong>.`;
  $('#capDone').disabled = n === 0;
  $('#capThumbs').innerHTML = capShots.map(s => `<img src="${s.url}" alt="">`).join('');
}

async function openCapture(mode) {
  capMode = mode;
  capShots = [];
  capRender();
  $('#capShoot').disabled = false;
  $('#capManual').hidden = mode !== 'new';
  capDlg.showModal();
  $('#capCancel').focus();
  try {
    capCam = await startCamera($('#capVideo'));
    if (!capDlg.open) { capCam.stop(); capCam = null; }
  } catch (e) {
    $('#capShoot').disabled = true;
    $('#capHint').textContent = (e.name === 'NotAllowedError' ? 'Kein Kamerazugriff erlaubt. ' : 'Kamera nicht verfügbar. ') + 'Wähle die Fotos aus der Galerie.';
  }
}
function closeCapture() {
  capCam?.stop(); capCam = null;
  if (capDlg.open) capDlg.close();
}
capDlg.addEventListener('close', () => { capCam?.stop(); capCam = null; });

$('#capShoot').addEventListener('click', async () => {
  if (!capCam) return;
  $('#capFlash').classList.add('on');
  setTimeout(() => $('#capFlash').classList.remove('on'), 80);
  try {
    const blob = await capCam.takePhoto();
    capShots.push({ blob, url: URL.createObjectURL(blob) });
    capRender();
  } catch { toast('Foto konnte nicht aufgenommen werden.'); }
});
$('#capFile').addEventListener('change', e => {
  for (const f of e.target.files) capShots.push({ blob: f, url: URL.createObjectURL(f) });
  e.target.value = '';
  capRender();
});
$('#capCancel').addEventListener('click', closeCapture);
$('#capManual').addEventListener('click', () => { closeCapture(); openItem(null); });
$('#capDone').addEventListener('click', async () => {
  const shots = capShots.map(s => s.blob);
  closeCapture();
  if (capMode === 'new') openItem(null);
  // Das erste Foto wird das Artikelbild; alle Fotos werden ausgewertet
  for (const b of shots) {
    const small = await photos.resizeImage(b, 1400, 0.85).catch(() => null);
    if (small) gallery.push({ blob: small, url: URL.createObjectURL(small) });
  }
  renderGallery();
  analyzeAll(shots);
});

/** Packungsinhalt aus gelesenem Text, z. B. „100 ml“, „20 Tabletten“. Grösster Wert gewinnt. */
function quantityFromText(text) {
  const rx = /(\d+(?:[.,]\d+)?)\s*(ml|g|stück|stk|filmtabletten|brausetabletten|tabletten|kapseln|dragées|beutel|sachets|zäpfchen|suppositorien|pflaster|dosen|sprühstösse|hübe|ampullen)(?![a-zäöü])/gi;
  let best = null, m;
  while ((m = rx.exec(text))) {
    const qty = parseFloat(m[1].replace(',', '.'));
    if (!(qty > 0) || qty > 5000) continue;
    const u = m[2].toLowerCase();
    const unit = u === 'ml' ? 'ml' : u === 'g' ? 'g' : /dosen|sprüh|hübe/.test(u) ? 'Dosen' : /beutel|sachet/.test(u) ? 'Beutel' : /ampull/.test(u) ? 'Ampullen' : 'Stk';
    if (!best || qty > best.qty) best = { qty, unit };
  }
  return best;
}

/** Wertet alle Fotos aus: Strichcode, Text (Menge, Name, pflanzlich) und – falls eingerichtet – die KI-Recherche. */
async function analyzeAll(shots) {
  const firstNew = gallery.length - shots.length; // Index des ersten neuen Fotos in der Galerie
  const info = $('#scanInfo');
  info.hidden = false;
  $('#suggestions').hidden = true;
  const bigs = [];
  for (const b of shots) bigs.push(await photos.resizeImage(b, 1800, 0.9).catch(() => b));
  try {
    // 1. Strichcode / DataMatrix in irgendeinem Foto (nicht nötig, wenn schon gescannt)
    for (let i = 0; i < bigs.length && !F.gtin.value; i++) {
      info.textContent = `Suche Strichcode (${i + 1}/${bigs.length}) …`;
      const code = await decodeImage(bigs[i]).catch(() => null);
      if (code && parseBarcode(code).type !== 'text') { await applyScan(code); break; }
    }
    // 2. Aufgedruckten Text lesen, wenn noch etwas fehlt
    let text = '', frontText = '';
    // Mit Claude-Schlüssel: Texterkennung auf dem Handy überspringen, Claude liest die Fotos selbst (schneller, genauer)
    if (!getApiKey() && (!F.name.value || !F.quantity.value || !F.productType.value)) {
      for (let i = 0; i < Math.min(bigs.length, 4); i++) {
        info.textContent = `Text wird gelesen (${i + 1}/${Math.min(bigs.length, 4)}) …`;
        const t = await recognizeText(bigs[i], m => {
          if (/load|initializ/.test(m.status)) info.textContent = 'Texterkennung wird vorbereitet (nur beim ersten Mal) …';
        }, { sparse: true }).catch(() => '');
        if (i === 0) frontText = t; // Name steht auf der Vorderseite; die Rückseite hat zu viele allgemeine Wörter
        text += '\n' + t;
      }
      const q = quantityFromText(text);
      if (q && !F.quantity.value) { F.quantity.value = q.qty; F.unit.value = q.unit; }
      if (!F.productType.value && /pflanzlich|phytoarznei|phytothérap|phytotherap/i.test(text)) F.productType.value = 'pflanzlich';
    }
    // 3. KI-Recherche mit Websuche (optional)
    if (getApiKey()) {
      await runResearch(bigs, firstNew);
    } else if (!F.name.value && frontText.trim()) {
      renderSuggestions(await searchByText(frontText), frontText);
    } else {
      info.textContent = (info.textContent.startsWith('✓') ? info.textContent + ' · ' : '✓ ')
        + 'Tipp: Mit einem Claude-API-Schlüssel (Einstellungen) recherchiert die App Hersteller, Art und Produktinfos automatisch.';
    }
    if (!F.name.value) F.name.focus();
  } catch (err) {
    info.textContent = 'Auswertung fehlgeschlagen: ' + err.message;
  }
}

async function runResearch(bigs, firstNew = 0) {
  const info = $('#scanInfo');
  const known = {};
  for (const [k, label] of [['name', 'name'], ['manufacturer', 'hersteller'], ['usage', 'anwendung']]) if (F[k].value) known[label] = F[k].value;
  if (F.quantity.value) known.menge = `${F.quantity.value} ${F.unit.value}`;
  try {
    const r = await researchProduct({ images: bigs, known, onStatus: t => { info.textContent = t; } });
    const done = [];
    const setIf = (el, v, label, force = false) => {
      if (!v || (!force && el.value)) return;
      el.value = v; done.push(label);
    };
    setIf(F.name, r.name, 'Name');
    setIf(F.manufacturer, r.hersteller, 'Hersteller');
    if (!F.quantity.value && parseFloat(r.menge) > 0) { F.quantity.value = parseFloat(r.menge); if (r.einheit) F.unit.value = r.einheit; done.push('Menge'); }
    if (!formTouched && !F.atc.value && r.darreichungsform && FORMS.some(f => f.id === r.darreichungsform)) { F.form.value = r.darreichungsform; updateFormHint(); }
    if (r.art && (!F.productType.value || r.art === 'pflanzlich')) { F.productType.value = r.art; done.push('Art'); }
    setIf(F.usage, r.anwendung_allgemein, 'Anwendung', looksFrench(F.usage.value));
    // Frontbild auf die Packung zuschneiden (nur wenn das erste neue Foto auch das Frontbild ist)
    const fr = r.frontbild_rahmen;
    if (fr && firstNew === 0 && gallery[0] && !F.imageUrl.value) {
      let l = fr.links / 100, t = fr.oben / 100, rr = fr.rechts / 100, b = fr.unten / 100;
      if (rr - l > 0.1 && b - t > 0.1 && (rr - l) * (b - t) < 0.92) {
        const m = 0.02; // etwas Rand lassen
        const src = gallery[0].blob || await photos.getPhoto(gallery[0].key);
        const cut = src && await photos.cropImage(src, { l: l - m, t: t - m, r: rr + m, b: b + m });
        if (cut) {
          if (gallery[0].key) removedKeys.push(gallery[0].key);
          gallery[0] = { blob: cut, url: URL.createObjectURL(cut) };
          renderGallery();
          done.push('Frontbild zugeschnitten');
        }
      }
    }
    if (r.produktinfo) {
      const src = r.quellen ? `\nQuellen: ${r.quellen}` : '';
      F.info.value = [F.info.value, r.produktinfo.trim() + src].filter(Boolean).join('\n');
      done.push('Produktinfo');
    }
    if (!F.category.value && r.rezeptpflichtig !== 'unbekannt') { F.rx.checked = r.rezeptpflichtig === 'ja'; updateRxWarn(); }
    info.textContent = done.length
      ? `✓ Recherche: ${done.join(', ')} ergänzt. Bitte kurz kontrollieren.`
      : '✓ Recherche abgeschlossen, keine neuen Angaben gefunden.';
  } catch (err) {
    info.textContent = 'Recherche nicht möglich: ' + err.message;
  }
}

const TABLET_NOTE = '<p>⚠️ Lose Tabletten ohne Aufdruck lassen sich nicht sicher erkennen. Nimm nichts ein, was du nicht eindeutig zuordnen kannst. Im Zweifel in der Apotheke nachfragen.</p>';

function renderSuggestions(hits, text) {
  const info = $('#scanInfo');
  const note = scanNote ? scanNote + ' ' : '';
  const box = $('#suggestions');
  box.hidden = false;
  if (!hits.length) {
    // Kein Arzneimittel gefunden (z. B. Pflaster): gelesene Zeilen als Namen anbieten
    const lines = [...new Set(text.split('\n')
      .map(l => l.replace(/[|_~®™•]+/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(l => l.length >= 4 && l.length <= 50 && (l.match(/[a-zäöüéèà]/gi) || []).length / l.length > 0.6))]
      .slice(0, 6);
    if (!lines.length) {
      info.textContent = note + 'Kein eindeutiger Name erkannt. Tipp: Den Namen eintippen, die App schlägt dann passende Produkte aus der Swissmedic-Liste vor.';
      box.innerHTML = TABLET_NOTE;
      return;
    }
    info.textContent = note + 'Kein eindeutiger Treffer. Gelesenen Text als Namen übernehmen, oder den Namen eintippen: Die App schlägt dann passende Produkte vor.';
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
  info.textContent = note + `${hits.length === 1 ? '1 Vorschlag' : hits.length + ' Vorschläge'} aus den Fotos: bitte den richtigen antippen und kontrollieren.`;
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

// ---------- Frontbild zuschneiden ----------
const cropDlg = $('#cropDialog');
const crop = { idx: null, blob: null, rect: { l: 0, t: 0, r: 1, b: 1 }, drag: null };

function layoutCrop() {
  const r = crop.rect, box = $('#cropBox');
  box.style.left = r.l * 100 + '%'; box.style.top = r.t * 100 + '%';
  box.style.width = (r.r - r.l) * 100 + '%'; box.style.height = (r.b - r.t) * 100 + '%';
}

async function openCrop(idx) {
  const g = gallery[idx];
  if (!g) return;
  const blob = g.blob || await photos.getPhoto(g.key);
  if (!blob) return toast('Foto nicht gefunden.');
  crop.idx = idx; crop.blob = blob;
  crop.rect = { l: 0.04, t: 0.04, r: 0.96, b: 0.96 };
  const img = $('#cropImg');
  img.src = URL.createObjectURL(blob);
  await img.decode().catch(() => {});
  cropDlg.showModal();
  layoutCrop();
}

$('#cropStage').addEventListener('pointerdown', e => {
  const handle = e.target.closest('[data-h]')?.dataset.h;
  const inBox = e.target.closest('#cropBox');
  if (!handle && !inBox) return;
  e.preventDefault();
  $('#cropStage').setPointerCapture(e.pointerId);
  const w = $('#cropWrap').getBoundingClientRect();
  crop.drag = { mode: handle || 'move', x0: e.clientX, y0: e.clientY, w: w.width, h: w.height, start: { ...crop.rect }, id: e.pointerId };
});
$('#cropStage').addEventListener('pointermove', e => {
  const d = crop.drag;
  if (!d || e.pointerId !== d.id) return;
  const dx = (e.clientX - d.x0) / d.w, dy = (e.clientY - d.y0) / d.h;
  const s = d.start, MIN = 0.08, cl = v => Math.min(1, Math.max(0, v));
  const r = { ...s };
  if (d.mode === 'move') {
    const w = s.r - s.l, h = s.b - s.t;
    r.l = Math.min(1 - w, Math.max(0, s.l + dx)); r.r = r.l + w;
    r.t = Math.min(1 - h, Math.max(0, s.t + dy)); r.b = r.t + h;
  } else {
    if (d.mode.includes('w')) r.l = Math.min(cl(s.l + dx), s.r - MIN);
    if (d.mode.includes('e')) r.r = Math.max(cl(s.r + dx), s.l + MIN);
    if (d.mode.includes('n')) r.t = Math.min(cl(s.t + dy), s.b - MIN);
    if (d.mode.includes('s')) r.b = Math.max(cl(s.b + dy), s.t + MIN);
  }
  crop.rect = r;
  layoutCrop();
});
const endCropDrag = e => { if (crop.drag?.id === e.pointerId) crop.drag = null; };
$('#cropStage').addEventListener('pointerup', endCropDrag);
$('#cropStage').addEventListener('pointercancel', endCropDrag);
$('#cropCancel').addEventListener('click', () => cropDlg.close());
$('#cropReset').addEventListener('click', () => { crop.rect = { l: 0, t: 0, r: 1, b: 1 }; layoutCrop(); });
$('#cropApply').addEventListener('click', async () => {
  const cut = await photos.cropImage(crop.blob, crop.rect);
  const g = gallery[crop.idx];
  if (g?.key) removedKeys.push(g.key);
  gallery[crop.idx] = { blob: cut, url: URL.createObjectURL(cut) };
  cropDlg.close();
  renderGallery();
  toast('Zugeschnitten. Wird beim Speichern übernommen.');
});

// ---------- Bildansicht (vergrössern) ----------
const viewer = $('#viewer');
const vImg = $('#viewerImg');
let vList = [], vIndex = 0;
let vScale = 1, vX = 0, vY = 0;
const vPointers = new Map();
let vGesture = null, vLastTap = 0;

function vApply(animate = false) {
  vImg.style.transition = animate ? 'transform .2s ease' : 'none';
  vImg.style.transform = `translate(${vX}px, ${vY}px) scale(${vScale})`;
}
function vReset(animate) { vScale = 1; vX = 0; vY = 0; vApply(animate); }

async function vShow(i) {
  if (!vList.length) return;
  vIndex = (i + vList.length) % vList.length;
  const it = vList[vIndex];
  vImg.src = it.src || (it.key ? await photos.photoUrl(it.key) : '') || '';
  vReset();
  $('#viewerCount').textContent = vList.length > 1 ? `${vIndex + 1} / ${vList.length}` : '';
  $('#viewerPrev').hidden = $('#viewerNext').hidden = vList.length < 2;
}

function openViewer(list, index = 0) {
  vList = list.filter(x => x.src || x.key);
  if (!vList.length) return;
  viewer.showModal();
  vShow(index);
}
$('#viewerClose').addEventListener('click', () => viewer.close());
$('#viewerPrev').addEventListener('click', () => vShow(vIndex - 1));
$('#viewerNext').addEventListener('click', () => vShow(vIndex + 1));

const stage = $('#viewerStage');
const vDist = () => { const [a, b] = [...vPointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
stage.addEventListener('pointerdown', e => {
  stage.setPointerCapture(e.pointerId);
  vPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (vPointers.size === 2) vGesture = { type: 'pinch', d0: vDist(), s0: vScale };
  else if (vPointers.size === 1) vGesture = { type: 'pan', x0: e.clientX, y0: e.clientY, tx: vX, ty: vY, moved: false };
});
stage.addEventListener('pointermove', e => {
  if (!vPointers.has(e.pointerId)) return;
  vPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (vGesture?.type === 'pinch' && vPointers.size === 2) {
    vScale = Math.min(6, Math.max(1, vGesture.s0 * vDist() / vGesture.d0));
    if (vScale === 1) { vX = 0; vY = 0; }
    vApply();
  } else if (vGesture?.type === 'pan') {
    const dx = e.clientX - vGesture.x0, dy = e.clientY - vGesture.y0;
    if (Math.abs(dx) + Math.abs(dy) > 6) vGesture.moved = true;
    if (vScale > 1) { vX = vGesture.tx + dx; vY = vGesture.ty + dy; vApply(); }
  }
});
function vEnd(e) {
  if (!vPointers.has(e.pointerId)) return;
  vPointers.delete(e.pointerId);
  if (vGesture?.type === 'pan' && vPointers.size === 0) {
    const dx = e.clientX - vGesture.x0;
    if (!vGesture.moved) {
      // Doppeltippen: vergrössern / zurück
      const now = Date.now();
      if (now - vLastTap < 300) {
        if (vScale > 1) vReset(true);
        else {
          const r = stage.getBoundingClientRect();
          vScale = 2.5;
          vX = (r.width / 2 - (e.clientX - r.left)) * 1.5;
          vY = (r.height / 2 - (e.clientY - r.top)) * 1.5;
          vApply(true);
        }
        vLastTap = 0;
      } else vLastTap = now;
    } else if (vScale === 1 && Math.abs(dx) > 60) vShow(vIndex + (dx < 0 ? 1 : -1)); // wischen
  }
  if (vPointers.size === 1) { // von zwei auf einen Finger: weiter verschieben
    const [p] = [...vPointers.values()];
    vGesture = { type: 'pan', x0: p.x, y0: p.y, tx: vX, ty: vY, moved: true };
  } else if (!vPointers.size) vGesture = null;
}
stage.addEventListener('pointerup', vEnd);
stage.addEventListener('pointercancel', vEnd);
stage.addEventListener('wheel', e => { // Maus/Trackpad
  e.preventDefault();
  vScale = Math.min(6, Math.max(1, vScale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
  if (vScale === 1) { vX = 0; vY = 0; }
  vApply();
}, { passive: false });

// ---------- Scanner ----------
const scanDlg = $('#scanDialog');
let stopScan = null;
let scanHandler = null;

async function openScanner(handler, hint, { photoLabel = '📷 Stattdessen Fotos aufnehmen' } = {}) {
  scanHandler = handler;
  $('#manualCode').value = '';
  $('#scanStatus').textContent = 'Kamera wird gestartet …';
  // Beim Verbinden von Haushalten (QR) gibt es keinen Foto-Weg
  $('#btnScanPhoto').hidden = handler === join;
  $('#btnScanPhoto').textContent = photoLabel;
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
  closeScanner();
  openCapture('add');
});

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

// ---------- Beschwerden: Empfehlung aus dem Vorrat ----------
const pickedSymptoms = new Set();

let showAllSymptoms = false;

function renderSymptomChips(detected = []) {
  const active = s => pickedSymptoms.has(s.id) || detected.includes(s.id);
  const anyActive = SYMPTOMS.some(active);
  // Ist etwas gewählt, nur die aktiven zeigen (die Empfehlung soll nicht weit unten landen)
  const list = anyActive && !showAllSymptoms ? SYMPTOMS.filter(active) : SYMPTOMS;
  $('#symptomChips').innerHTML = list.map(s =>
    `<button type="button" class="chip sym${active(s) ? ' active' : ''}" data-sym="${s.id}">${s.icon} ${esc(s.label)}</button>`).join('')
    + (anyActive ? `<button type="button" class="chip" data-more>${showAllSymptoms ? '− weniger' : '＋ weitere'}</button>` : '');
}

function recRow(item, st, { linkedName = '', expired = false, note = '', blocked = false } = {}) {
  const loc = [item.location && '📍 ' + item.location, item.person && '👤 für ' + item.person].filter(Boolean).join('  ');
  const keys = photoKeys(item);
  const thumb = item.imageUrl ? `<img class="thumb" src="${esc(item.imageUrl)}" alt="" referrerpolicy="no-referrer">`
    : keys[0] && !linkedName ? `<img class="thumb" data-photo="${esc(keys[0])}" alt="">`
    : `<span class="thumb">${FORM_ICON[item.form] || '📦'}</span>`;
  const sub = [item.usage, linkedName ? '🏠 ' + linkedName : loc, st && !expired && st.status !== 'unknown' ? describeDays(st.days) : ''].filter(Boolean).join(' · ');
  const openable = !linkedName && !expired && !blocked;
  return `<div class="rec${item.rx ? ' rx' : ''}${expired ? ' expired' : ''}${blocked ? ' blocked' : ''}" ${openable ? `data-open="${esc(item.id)}"` : ''}>
    ${thumb}<div class="txt"><strong>${esc(item.name)}</strong><small>${esc(sub)}</small>${note ? `<span class="note">⚠️ ${esc(note)}</span>` : ''}</div></div>`;
}

// Ablauf: 1. Beschwerden → „Weiter: Für wen?“ → 2. Person wählen → 3. Empfehlung
let helpStep = 'input';
let helpPerson = null;

const personText = p => [`${p.age} J`, `${p.weight} kg`, p.height ? `${p.height} cm` : ''].filter(Boolean).join(' · ');

function currentSymptomIds() {
  const detected = detectSymptoms($('#complaint').value);
  return { detected, ids: [...new Set([...detected, ...pickedSymptoms])] };
}

function renderHelp() {
  const text = $('#complaint').value;
  const { detected, ids } = currentSymptomIds();
  renderSymptomChips(detected);
  $('#emergency').textContent = EMERGENCY;
  if (!ids.length && helpStep !== 'input') helpStep = 'input';

  const next = $('#btnHelpNext');
  next.disabled = !ids.length;
  next.parentElement.hidden = helpStep !== 'input';
  next.textContent = ids.length ? `Weiter: Für wen? →` : 'Beschwerde eingeben oder antippen';

  // Schritt 2: Person wählen
  const people = store.getState().people;
  $('#personPick').hidden = helpStep !== 'person';
  $('#personButtons').innerHTML = people.map(p => `
    <button type="button" class="person-btn" data-person="${esc(p.id)}">
      <span class="pi">${p.icon || '🙂'}</span><strong>${esc(p.label)}</strong><small>${esc(personText(p))}${p.confirmed ? '' : ' · unbestätigt'}</small>
    </button>`).join('');
  $('#personUnconfirmed').hidden = people.every(p => p.confirmed);

  if (helpStep !== 'result' || !helpPerson) {
    $('#adviceResult').innerHTML = !ids.length && text.trim()
      ? '<p class="muted" style="text-align:center">Nicht erkannt. Tippe oben auf eine passende Beschwerde.</p>' : '';
    return;
  }

  // Schritt 3: Empfehlung für diese Person
  const person = people.find(p => p.id === helpPerson) || people[0];
  const { items, linked } = store.getState();
  const results = adviseFor(ids, items, store.expiryStatus, person);
  const linkedItems = linked.flatMap(h => h.items.map(i => ({ ...i, _hh: h.name })));
  const linkedResults = adviseFor(ids, linkedItems, store.expiryStatus, person);
  const kid = person.age < 12;
  $('#adviceResult').innerHTML = `
    <div class="card for-person">
      <div><strong>Für: ${person.icon || ''} ${esc(person.label)}</strong><br><small class="muted">${esc(personText(person))}${person.confirmed ? '' : ' · Angaben unbestätigt'}</small></div>
      <div class="row" style="margin:0"><button type="button" class="btn small-btn" data-help="person">Andere Person</button><button type="button" class="btn small-btn" data-help="new">Neu</button></div>
    </div>
    <p class="hint small">${kid
      ? `Kind mit ${esc(String(person.weight))} kg: Nur Mittel verwenden, die für dieses Alter zugelassen sind, Dosierung nach Gewicht laut Packungsbeilage. Im Zweifel Apotheke oder Kinderarzt fragen.`
      : 'Dosierung immer nach Packungsbeilage. In der Schwangerschaft, mit Dauermedikamenten oder Vorerkrankungen zuerst in der Apotheke fragen.'}</p>`
    + results.map((r, n) => {
      const s = r.symptom;
      const fromLinked = linkedResults[n].use;
      const row = (h, o = {}) => recRow(h.item, h.st, { note: h.check.note, ...o });
      return `<div class="card advice">
        <h2>${s.icon} ${esc(s.label)}</h2>
        <div class="redflag"><strong>⚠️ Sofort ärztliche Hilfe oder 144 bei:</strong>${esc(s.red)}</div>
        ${r.use.length ? `<h3>✅ Passt aus deinem Vorrat</h3>${r.use.map(h => row(h)).join('')}` : ''}
        ${r.rx.length ? `<h3>℞ Für ${esc(person.label)} verschrieben</h3>${r.rx.map(h => row(h)).join('')}` : ''}
        ${!r.use.length && !r.rx.length ? `<div class="none">Nichts Passendes für ${esc(person.label)} im Haus. In der Apotheke nach ${esc(s.ask)} fragen${kid ? ' (für Kinder)' : ''}.</div>` : ''}
        ${!r.use.length && fromLinked.length ? `<h3>🏠 Bei verbundenen Haushalten</h3>${fromLinked.map(h => row(h, { linkedName: h.item._hh })).join('')}` : ''}
        ${r.caution.length ? `<h3>⚠️ Eher nicht für ${esc(person.label)}</h3>${r.caution.map(h => recRow(h.item, h.st, { note: h.check.caution })).join('')}` : ''}
        ${r.blocked.length ? `<h3>⛔ Nicht für ${esc(person.label)}</h3>${r.blocked.map(h => recRow(h.item, h.st, { note: h.check.block, blocked: true })).join('')}` : ''}
        ${r.rxOther.length ? `<h3>℞ Rezeptpflichtig, nicht für ${esc(person.label)} verschrieben</h3>${r.rxOther.map(h => recRow(h.item, h.st, { note: 'Nicht ohne ärztliche Rücksprache verwenden.', blocked: true })).join('')}` : ''}
        ${r.expired.length ? `<h3>🗑️ Abgelaufen, nicht mehr verwenden</h3>${r.expired.map(h => recRow(h.item, h.st, { expired: true })).join('')}<p class="muted small">Abgelaufene Medikamente in der Apotheke zurückgeben.</p>` : ''}
        <p class="tip">💡 ${esc(s.tip)}</p>
      </div>`;
    }).join('');
  $$('#adviceResult img[data-photo]').forEach(async img => {
    const url = await photos.photoUrl(img.dataset.photo);
    if (url) img.src = url; else img.replaceWith(Object.assign(document.createElement('span'), { className: 'thumb', textContent: '📦' }));
  });
}

function backToInput() { helpStep = 'input'; renderHelp(); }

let helpTimer;
$('#complaint').addEventListener('input', () => {
  clearTimeout(helpTimer);
  helpTimer = setTimeout(() => { if (helpStep !== 'input') helpStep = 'input'; renderHelp(); }, 250);
});
$('#symptomChips').addEventListener('click', e => {
  if (e.target.closest('[data-more]')) { showAllSymptoms = !showAllSymptoms; return renderHelp(); }
  const b = e.target.closest('[data-sym]');
  if (!b) return;
  const id = b.dataset.sym;
  if (detectSymptoms($('#complaint').value).includes(id)) return; // kommt aus dem Text
  pickedSymptoms.has(id) ? pickedSymptoms.delete(id) : pickedSymptoms.add(id);
  helpStep = 'input';
  renderHelp();
});
$('#btnHelpNext').addEventListener('click', () => {
  if (!currentSymptomIds().ids.length) return;
  helpStep = 'person';
  renderHelp();
  $('#personPick').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#personButtons').addEventListener('click', e => {
  const b = e.target.closest('[data-person]');
  if (!b) return;
  helpPerson = b.dataset.person;
  helpStep = 'result';
  renderHelp();
  $('#adviceResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#adviceResult').addEventListener('click', e => {
  const act = e.target.closest('[data-help]')?.dataset.help;
  if (act === 'person') { helpStep = 'person'; renderHelp(); return $('#personPick').scrollIntoView({ behavior: 'smooth' }); }
  if (act === 'new') {
    $('#complaint').value = ''; pickedSymptoms.clear(); helpPerson = null;
    backToInput(); window.scrollTo({ top: 0, behavior: 'smooth' }); return;
  }
  const r = e.target.closest('[data-open]');
  if (r) openItem(store.getState().items.find(i => i.id === r.dataset.open));
});

// ---------- Personen (Einstellungen) ----------
const PERSON_EMOJIS = ['👨', '👩', '🧔', '👱‍♂️', '👱‍♀️', '👨‍🦰', '👩‍🦰', '👨‍🦱', '👩‍🦱', '👨‍🦳', '👩‍🦳', '👴', '👵', '🧑', '🧒', '👦', '👧', '👶', '🙂', '😎', '🤓', '🦸', '🐶', '🐱'];
let emojiOpenFor = null;

function renderPeople() {
  const num = v => (v == null || v === '' ? '' : esc(String(v)));
  $('#peopleList').innerHTML = store.getState().people.map(p => `
    <div class="person-row" data-pid="${esc(p.id)}">
      <div class="person-head">
        <button type="button" class="pi" data-emoji-toggle aria-label="Emoji wählen" title="Emoji wählen">${p.icon || '🙂'}</button>
        <input data-f="label" value="${esc(p.label)}" aria-label="Name">
      </div>
      ${emojiOpenFor === p.id ? `<div class="emoji-grid">${PERSON_EMOJIS.map(e => `<button type="button" data-emoji="${e}" class="${e === p.icon ? 'active' : ''}">${e}</button>`).join('')}</div>` : ''}
      <div class="person-nums">
        <label>Alter (J)<input data-f="age" type="number" step="0.5" min="0" max="120" inputmode="decimal" value="${num(p.age)}"></label>
        <label>Gewicht (kg)<input data-f="weight" type="number" step="0.5" min="1" max="300" inputmode="decimal" value="${num(p.weight)}"></label>
        <label>Grösse (cm)<input data-f="height" type="number" step="1" min="30" max="250" inputmode="numeric" value="${num(p.height)}" placeholder="–"></label>
      </div>
      <label class="conf"><input type="checkbox" data-f="confirmed" ${p.confirmed ? 'checked' : ''}> Angaben ${p.confirmed ? 'bestätigt' : 'noch nicht bestätigt'}</label>
    </div>`).join('');
}
$('#peopleList').addEventListener('change', e => {
  const row = e.target.closest('[data-pid]');
  const f = e.target.dataset.f;
  if (!row || !f) return;
  const v = f === 'confirmed' ? e.target.checked
    : f === 'label' ? e.target.value.trim() || 'Person'
    : e.target.value === '' ? null : Number(e.target.value);
  store.updatePerson(row.dataset.pid, { [f]: v });
  renderPeople();
  toast('Gespeichert');
});
$('#peopleList').addEventListener('click', e => {
  const row = e.target.closest('[data-pid]');
  if (!row) return;
  if (e.target.closest('[data-emoji-toggle]')) {
    emojiOpenFor = emojiOpenFor === row.dataset.pid ? null : row.dataset.pid;
    return renderPeople();
  }
  const pick = e.target.closest('[data-emoji]');
  if (pick) {
    store.updatePerson(row.dataset.pid, { icon: pick.dataset.emoji });
    emojiOpenFor = null;
    renderPeople();
    toast('Gespeichert');
  }
});

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

// ---------- KI-Recherche: API-Schlüssel ----------
function renderKeyState() {
  const k = getApiKey();
  $('#apiKeyState').textContent = k ? `✓ Schlüssel gespeichert (…${k.slice(-4)}). Die Recherche läuft nach dem Fotografieren automatisch.` : 'Kein Schlüssel hinterlegt: Die App arbeitet ohne KI-Recherche.';
  $('#btnSaveKey').textContent = k ? 'Entfernen' : 'Speichern';
  $('#apiKey').hidden = !!k;
}
$('#btnSaveKey').addEventListener('click', () => {
  if (getApiKey()) { setApiKey(''); toast('Schlüssel entfernt'); }
  else {
    const v = $('#apiKey').value.trim();
    if (!/^sk-ant-/.test(v)) return toast('Das sieht nicht wie ein Claude-API-Schlüssel aus (beginnt mit sk-ant-).');
    setApiKey(v); $('#apiKey').value = ''; toast('Schlüssel gespeichert');
  }
  renderKeyState();
});
renderKeyState();

// ---------- Start ----------
store.onChange(() => { renderInventory(); renderLocationSettings(); if ($('#view-linked').classList.contains('active')) renderLinked(); });
renderInventory();
handleHash();

// Bestehende Artikel: fehlende Standardanwendung einmalig ergänzen
(async () => {
  // auch ATC-Code (für „Beschwerden“) nachtragen
  for (const it of store.getState().items.filter(i => !i.usage || looksFrench(i.usage) || (!i.atc && i.gtin && swissmedicInfo(i.gtin)))) {
    const patch = { id: it.id };
    const drug = it.gtin && swissmedicInfo(it.gtin) ? await lookupSwissDrug(it.gtin).catch(() => null) : null;
    if (drug?.atc && !it.atc) patch.atc = drug.atc;
    if (!it.usage || looksFrench(it.usage)) patch.usage = drug?.usage || FORM_USES[it.form] || '';
    if (Object.keys(patch).length > 1 && (patch.atc || patch.usage)) store.upsertItem(patch);
  }
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
