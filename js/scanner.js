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
