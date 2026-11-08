// Klicktöne wie in Taktland (taktland.ch, app/src/audio.ts): ein kurzes «Tock» beim Wechsel von Reiter und Filter,
// ein gläsernes Klicken beim Aufklappen und eine Quarte tiefer und leiser beim Zuklappen.
// Alles mit der Web Audio API gerechnet, ohne Aufnahme. In den Einstellungen abschaltbar, die Wahl bleibt auf dem Gerät.

const KEY = 'apoko.klick';

export function klickAn() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function klickSetzen(an) {
  try { localStorage.setItem(KEY, an ? 'on' : 'off'); } catch { /* egal */ }
}

/** [Beginn in s, Tonhöhe in Hz, Ausklang in s, Stärke], dieselben Werte wie in Taktland */
const MUSTER = {
  // «Tock»: E5 und H5, nach 0,12 s verklungen
  tock: [[0, 659.26, 0.12, 0.16], [0.012, 987.77, 0.12, 0.07]],
  // Glas: C7 mit einem unharmonischen Teilton darüber, nach 0,09 s verklungen
  auf: [[0, 2093, 0.09, 0.07], [0, 5651, 0.05, 0.025]],
  // dasselbe Glas eine Quarte tiefer (G6) und leiser
  zu: [[0, 1567.98, 0.08, 0.05], [0, 4234, 0.04, 0.018]],
};

let ctx = null;
let ausgangKnoten = null;

function kontext() {
  if (ctx) return ctx;
  try {
    const K = window.AudioContext || window.webkitAudioContext;
    ctx = K ? new K() : null;
  } catch { ctx = null; }
  return ctx;
}

/** gemeinsamer Ausgang wie in Taktland (Lautstärke 100 %): Verstärkung 1,2, dahinter ein Begrenzer gegen Kratzen */
function ausgang(c) {
  if (!ausgangKnoten) {
    ausgangKnoten = c.createGain();
    ausgangKnoten.gain.value = 1.2;
    let ziel = c.destination;
    try {
      const b = c.createDynamicsCompressor();
      b.threshold.value = -3; b.knee.value = 0; b.ratio.value = 20; b.attack.value = 0.002; b.release.value = 0.1;
      b.connect(c.destination);
      ziel = b;
    } catch { /* ohne Begrenzer */ }
    ausgangKnoten.connect(ziel);
  }
  return ausgangKnoten;
}

function spielen(muster) {
  if (!klickAn()) return;
  const c = kontext();
  if (!c) return;
  try {
    c.resume();
    const jetzt = c.currentTime;
    for (const [beginn, hoehe, ausklang, staerke] of muster) {
      const osc = c.createOscillator();
      const laut = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = hoehe;
      laut.gain.setValueAtTime(0.0001, jetzt + beginn);
      laut.gain.exponentialRampToValueAtTime(staerke, jetzt + beginn + 0.006);
      laut.gain.exponentialRampToValueAtTime(0.0001, jetzt + beginn + ausklang);
      osc.connect(laut).connect(ausgang(c));
      osc.start(jetzt + beginn);
      osc.stop(jetzt + beginn + ausklang + 0.05);
    }
  } catch { /* ohne Ton geht alles weiter */ }
}

export const tock = () => spielen(MUSTER.tock);
export const aufklappTon = () => spielen(MUSTER.auf);
export const zuklappTon = () => spielen(MUSTER.zu);

/**
 * Einmal für die ganze App: vor dem eigentlichen Klick (Capture), damit der Zustand von vorher zählt.
 * Reiter unten und Filter oben klingen nur, wenn sie wechseln; was aufklappt (aria-expanded, details), klickt gläsern.
 */
export function klickHoeren() {
  document.addEventListener('click', e => {
    const ziel = e.target instanceof Element ? e.target : null;
    if (!ziel) return;
    const auf = ziel.closest('[aria-expanded]');
    if (auf) { (auf.getAttribute('aria-expanded') === 'true' ? zuklappTon : aufklappTon)(); return; }
    const summary = ziel.closest('summary');
    if (summary) { (summary.parentElement?.hasAttribute('open') ? zuklappTon : aufklappTon)(); return; }
    const reiter = ziel.closest('.tab, #filters .chip');
    if (reiter && (!reiter.classList.contains('active') || reiter.hasAttribute('aria-pressed'))) tock();
  }, true);
}
