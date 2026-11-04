// Produktfotos: verkleinert als JPEG in IndexedDB (nicht in localStorage, das wäre zu klein).
const DB_NAME = 'apoko-photos';
const STORE = 'photos';
let dbp;

function db() {
  dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

const urlCache = new Map();

export async function getPhoto(id) {
  try { return await tx('readonly', s => s.get(id)) || null; } catch { return null; }
}

export async function photoUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const blob = await getPhoto(id);
  const url = blob ? URL.createObjectURL(blob) : null;
  urlCache.set(id, url);
  return url;
}

export async function savePhoto(id, blob) {
  await tx('readwrite', s => s.put(blob, id));
  const old = urlCache.get(id);
  if (old) URL.revokeObjectURL(old);
  urlCache.delete(id);
}

export async function deletePhoto(id) {
  try { await tx('readwrite', s => s.delete(id)); } catch { /* egal */ }
  const old = urlCache.get(id);
  if (old) URL.revokeObjectURL(old);
  urlCache.delete(id);
}

export async function allPhotos() {
  const d = await db();
  return new Promise((resolve, reject) => {
    const out = {};
    const req = d.transaction(STORE).objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return resolve(out);
      out[c.key] = c.value;
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/** Bild verkleinern (längste Seite max), als JPEG-Blob. */
export async function resizeImage(file, max = 900, quality = 0.8) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  let img = bmp;
  if (!img) {
    img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = URL.createObjectURL(file);
    });
  }
  const w = img.width, h = img.height;
  const scale = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(resolve => c.toBlob(resolve, 'image/jpeg', quality));
}

export const blobToDataUrl = blob => new Promise(resolve => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.readAsDataURL(blob);
});

export const dataUrlToBlob = url => fetch(url).then(r => r.blob());
