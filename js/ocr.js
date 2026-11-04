// Texterkennung (Tesseract, läuft komplett auf dem Gerät, nichts wird hochgeladen).
let workerPromise = null;
let progressFn = null;
let busy = Promise.resolve();

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Texterkennung konnte nicht geladen werden.'));
    document.head.appendChild(s);
  });
}

function getWorker() {
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
  return workerPromise;
}

/** Lädt die Texterkennung vorab (z. B. beim Öffnen der Datumskamera). */
export const preloadOcr = onProgress => { progressFn = onProgress; return getWorker(); };

/**
 * Liefert den erkannten Text eines Bildes (Blob oder Canvas).
 * sparse = true: verstreuten Text suchen (gut für Etiketten mit LOT/EXP).
 */
export function recognizeText(image, onProgress, { sparse = false } = {}) {
  // Aufrufe nacheinander abarbeiten (ein Worker)
  const run = busy.then(async () => {
    const worker = await getWorker();
    progressFn = onProgress;
    await worker.setParameters({ tessedit_pageseg_mode: sparse ? '11' : '3' });
    const { data } = await worker.recognize(image);
    return data.text || '';
  });
  busy = run.catch(() => {});
  return run;
}
