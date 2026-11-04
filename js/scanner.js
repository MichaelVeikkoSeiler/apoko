// Kamera-Scanner für EAN-13, GS1-DataMatrix und QR-Codes.
// Nutzt die native BarcodeDetector-API (Chrome/Android), sonst ZXing (z. B. iPhone/Safari).

const FORMATS = ['data_matrix', 'ean_13', 'ean_8', 'upc_a', 'code_128', 'code_39', 'qr_code'];

let zxingPromise;
function loadZXing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  zxingPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/zxing.min.js';
    s.onload = () => resolve(window.ZXing);
    s.onerror = () => reject(new Error('Scanner-Bibliothek konnte nicht geladen werden.'));
    document.head.appendChild(s);
  });
  return zxingPromise;
}

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const supported = await BarcodeDetector.getSupportedFormats();
    const formats = FORMATS.filter(f => supported.includes(f));
    if (!formats.includes('data_matrix') || !formats.includes('ean_13')) return null;
    return new BarcodeDetector({ formats });
  } catch { return null; }
}

/** Startet nur die Kamera (für die Datumserkennung). Gibt stop() zurück. */
export async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Kamera ist in diesem Browser nicht verfügbar (HTTPS nötig).');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  await video.play();
  return () => { stream.getTracks().forEach(t => t.stop()); video.srcObject = null; };
}

/**
 * Schneidet den Bereich unter `frameEl` aus dem Videobild aus
 * (berücksichtigt object-fit: cover). Liefert ein Canvas.
 */
export function grabFrameRegion(video, frameEl, scale = 2) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  const vr = video.getBoundingClientRect();
  const fr = frameEl.getBoundingClientRect();
  const s = Math.max(vr.width / vw, vr.height / vh); // cover
  const offX = (vr.width - vw * s) / 2, offY = (vr.height - vh * s) / 2;
  const sx = (fr.left - vr.left - offX) / s, sy = (fr.top - vr.top - offY) / s;
  const sw = fr.width / s, sh = fr.height / s;
  const c = document.createElement('canvas');
  const out = Math.min(scale, 1600 / sw);
  c.width = Math.round(sw * out); c.height = Math.round(sh * out);
  const ctx = c.getContext('2d');
  ctx.filter = 'grayscale(1) contrast(1.4)';
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/**
 * Sucht einen Strichcode/DataMatrix-Code in einem Foto (Blob).
 * Liefert den Text des Codes oder null.
 */
export async function decodeImage(blob) {
  const detector = await nativeDetector();
  if (detector) {
    try {
      const bmp = await createImageBitmap(blob);
      const codes = await detector.detect(bmp);
      if (codes.length) return codes[0].rawValue;
    } catch { /* weiter mit ZXing */ }
  }
  const ZXing = await loadZXing();
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.DATA_MATRIX, ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
    ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39,
    ZXing.BarcodeFormat.QR_CODE,
  ]);
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  const reader = new ZXing.BrowserMultiFormatReader(hints);
  const tryUrl = async url => {
    try { return (await reader.decodeFromImageUrl(url))?.getText() || null; }
    catch { return null; }
  };
  const url = URL.createObjectURL(blob);
  try {
    const whole = await tryUrl(url);
    if (whole) return whole;
    // ZXing sucht DataMatrix-Codes von der Bildmitte aus. Liegt der Code am Rand,
    // wird er übersehen. Darum überlappende Ausschnitte (3×3, je 2/3 der Bildgrösse) prüfen.
    const img = await createImageBitmap(blob);
    const cw = Math.round(img.width * 2 / 3), ch = Math.round(img.height * 2 / 3);
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    for (const fy of [0.5, 0, 1]) {
      for (const fx of [0.5, 0, 1]) {
        if (fx === 0.5 && fy === 0.5) continue; // Mitte ist im Gesamtbild schon geprüft
        const x = Math.round((img.width - cw) * fx), y = Math.round((img.height - ch) * fy);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, x, y, cw, ch, 0, 0, cw, ch);
        const hit = await tryUrl(canvas.toDataURL('image/png'));
        if (hit) return hit;
      }
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
    reader.reset();
  }
}

/**
 * Startet den Scanner im übergebenen <video>-Element.
 * Gibt eine stop()-Funktion zurück. onResult(text) wird einmal aufgerufen.
 */
export async function startScanner(video, onResult) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Kamera ist in diesem Browser nicht verfügbar (HTTPS nötig).');
  }
  const constraints = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false };
  let stopped = false;
  let done = false;
  const finish = text => { if (done || stopped) return; done = true; navigator.vibrate?.(60); onResult(text); };

  const detector = await nativeDetector();
  if (detector) {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    await video.play();
    const tick = async () => {
      if (stopped || done) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length) return finish(codes[0].rawValue);
      } catch { /* Frame noch nicht bereit */ }
      setTimeout(tick, 120);
    };
    tick();
    return () => { stopped = true; stream.getTracks().forEach(t => t.stop()); video.srcObject = null; };
  }

  const ZXing = await loadZXing();
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.DATA_MATRIX, ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
    ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39,
    ZXing.BarcodeFormat.QR_CODE,
  ]);
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  const reader = new ZXing.BrowserMultiFormatReader(hints, 150);
  await reader.decodeFromConstraints(constraints, video, result => {
    if (result) finish(result.getText());
  });
  return () => { stopped = true; reader.reset(); };
}
