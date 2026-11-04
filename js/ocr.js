// Texterkennung (Tesseract, läuft komplett auf dem Gerät, nichts wird hochgeladen).
let workerPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Texterkennung konnte nicht geladen werden.'));
    document.head.appendChild(s);
  });
}

async function getWorker(onProgress) {
  workerPromise ||= (async () => {
    if (!window.Tesseract) await loadScript('vendor/tesseract/tesseract.min.js');
    const base = new URL('vendor/tesseract/', location.href).href;
    return window.Tesseract.createWorker('deu', 1, {
      workerPath: base + 'worker.min.js',
      corePath: base + 'core',
      langPath: base + 'lang',
      logger: m => progressFn?.(m),
    });
  })();
  progressFn = onProgress;
  return workerPromise;
}
let progressFn = null;

/** Liefert den erkannten Text eines Bildes (Blob). */
export async function recognizeText(blob, onProgress) {
  const worker = await getWorker(onProgress);
  progressFn = onProgress;
  const { data } = await worker.recognize(blob);
  return data.text || '';
}
