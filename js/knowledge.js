// Medizinisches Hintergrundwissen für die Hausapotheke.
// Bewusst als Richtwerte formuliert: Massgebend ist immer die Packungsbeilage.

/** Darreichungsformen mit passender Einheit (openDays: Richtwert Haltbarkeit nach Anbruch, nur als Info). */
export const FORMS = [
  { id: 'tablette', label: 'Tabletten', unit: 'Stk', openDays: null },
  { id: 'kapsel', label: 'Kapseln', unit: 'Stk', openDays: null },
  { id: 'brausetablette', label: 'Brausetabletten', unit: 'Stk', openDays: null,
    hint: 'Röhrchen nach Entnahme sofort wieder gut verschliessen, Feuchtigkeit macht sie unwirksam.' },
  { id: 'lutschtablette', label: 'Lutschtabletten', unit: 'Stk', openDays: null },
  { id: 'pulver', label: 'Pulver / Granulat (Beutel)', unit: 'Stk', openDays: null },
  { id: 'sirup', label: 'Sirup / Saft', unit: 'ml', openDays: 180,
    hint: 'Viele Säfte halten nach Anbruch nur 1 bis 6 Monate. Antibiotika-Säfte, die selbst angerührt werden, oft nur 7 bis 14 Tage im Kühlschrank.' },
  { id: 'tropfen', label: 'Tropfen zum Einnehmen', unit: 'ml', openDays: 180 },
  { id: 'augentropfen', label: 'Augentropfen', unit: 'ml', openDays: 28,
    hint: 'Augentropfen mit Konservierungsmittel sind nach dem Öffnen meist nur 4 Wochen haltbar. Einzeldosen (EDO) sofort verwenden, Rest verwerfen.' },
  { id: 'ohrentropfen', label: 'Ohrentropfen', unit: 'ml', openDays: 28 },
  { id: 'nasenspray', label: 'Nasenspray / -tropfen', unit: 'ml', openDays: 180,
    hint: 'Abschwellende Nasensprays nicht länger als 5 bis 7 Tage am Stück anwenden. Aus hygienischen Gründen nur von einer Person verwenden.' },
  { id: 'spray', label: 'Spray (Haut / Rachen)', unit: 'ml', openDays: null },
  { id: 'inhalator', label: 'Inhalator', unit: 'Dosen', openDays: null },
  { id: 'salbe', label: 'Salbe / Creme / Gel (Tube)', unit: 'g', openDays: 180,
    hint: 'Tuben halten nach dem Öffnen meist etwa 6 Monate, Tiegel wegen Keimen deutlich kürzer.' },
  { id: 'zaepfchen', label: 'Zäpfchen', unit: 'Stk', openDays: null,
    hint: 'Kühl lagern (unter 25 °C), sonst schmelzen sie.' },
  { id: 'pflaster', label: 'Pflaster / Verband', unit: 'Stk', openDays: null },
  { id: 'injektion', label: 'Spritze / Pen / Ampulle', unit: 'Stk', openDays: 28,
    hint: 'Viele Insulin-Pens sind nach Anbruch 4 Wochen bei Raumtemperatur haltbar. Ungeöffnet meist im Kühlschrank lagern.' },
  { id: 'loesung', label: 'Lösung / Desinfektion', unit: 'ml', openDays: null },
  { id: 'medizinprodukt', label: 'Medizinprodukt / Hilfsmittel', unit: 'Stk', openDays: null },
  { id: 'andere', label: 'Andere', unit: 'Stk', openDays: null },
];

export const UNITS = ['Stk', 'ml', 'g', 'Dosen', 'Beutel', 'Ampullen', 'IE'];

export const formById = id => FORMS.find(f => f.id === id) || FORMS[FORMS.length - 1];

/**
 * Abgabekategorien in der Schweiz (seit der HMG-Revision 2019, Kategorie C
 * wurde aufgehoben). A und B sind rezeptpflichtig.
 */
export const CATEGORIES = [
  { id: '', label: 'unbekannt', rx: null },
  { id: 'A', label: 'A: verschärft rezeptpflichtig', rx: true },
  { id: 'B', label: 'B: rezeptpflichtig', rx: true },
  { id: 'D', label: 'D: Fachberatung (Apotheke/Drogerie)', rx: false },
  { id: 'E', label: 'E: frei verkäuflich', rx: false },
];

/** Tage, ab denen „läuft bald ab“ angezeigt wird. */
export const SOON_DAYS = 90;

/** Grundausstattung einer Hausapotheke, Abgleich über Stichworte. */
export const CHECKLIST = [
  { label: 'Schmerz- und Fiebermittel', keys: ['paracetamol', 'ibuprofen', 'dafalgan', 'panadol', 'algifor', 'brufen', 'mefenamin', 'ponstan', 'novalgin', 'metamizol', 'acetylsalicyl', 'aspirin', 'naproxen'] },
  { label: 'Fieberthermometer', keys: ['thermometer'] },
  { label: 'Wunddesinfektion', keys: ['desinfektion', 'betadine', 'octenisept', 'merfen', 'povidon', 'chlorhexidin', 'jod'] },
  { label: 'Pflaster', keys: ['pflaster', 'hansaplast', 'band-aid'], forms: ['pflaster'] },
  { label: 'Verbandmaterial (Gaze, Binden)', keys: ['verband', 'gaze', 'binde', 'kompresse', 'elastisch'] },
  { label: 'Mittel gegen Durchfall / Elektrolyte', keys: ['loperamid', 'imodium', 'elektrolyt', 'normolytoral', 'oralpädon', 'perenterol', 'bioflorin'] },
  { label: 'Antiallergikum (Antihistaminikum)', keys: ['cetirizin', 'loratadin', 'desloratadin', 'fexofenadin', 'levocetirizin', 'zyrtec', 'xyzal', 'aerius', 'telfast', 'fenistil', 'dimetinden', 'bilastin'] },
  { label: 'Salbe bei Insektenstichen / Juckreiz', keys: ['fenistil', 'hydrocortison', 'insekt', 'stich', 'juck'] },
  { label: 'Brand- und Wundsalbe', keys: ['bepanthen', 'dexpanthenol', 'brand', 'wundsalbe', 'flammazine', 'vita-merfen'] },
  { label: 'Sonnenschutz / After-Sun', keys: ['sonnen', 'after sun', 'after-sun', 'spf'] },
  { label: 'Abschwellendes Nasenspray', keys: ['xylometazolin', 'oxymetazolin', 'otrivin', 'nasivin', 'triofan', 'rinosedin'], forms: ['nasenspray'] },
  { label: 'Pinzette / Zeckenzange', keys: ['pinzette', 'zecke'] },
  { label: 'Schere', keys: ['schere'] },
  { label: 'Einweghandschuhe', keys: ['handschuh'] },
  { label: 'Kühlkompresse', keys: ['kühl', 'cold', 'coolpack'] },
];

export const NOTES = {
  rxShare: 'Rezeptpflichtige Medikamente sind für eine bestimmte Person verschrieben. Gib sie nur nach Rücksprache mit Ärztin, Arzt oder Apotheke weiter. Dosis, Wechselwirkungen und Gegenanzeigen können sich stark unterscheiden.',
  disposal: 'Abgelaufene Medikamente gehören nicht in den Hausmüll oder in die Toilette. Bring sie kostenlos in eine Apotheke oder Drogerie oder zu einer Sammelstelle.',
  expiry: 'Steht auf der Packung nur Monat und Jahr (z. B. 12/2027), ist das Medikament bis zum letzten Tag dieses Monats haltbar.',
  storage: 'Die meisten Medikamente gehören trocken, dunkel, bei Raumtemperatur (15 bis 25 °C) und für Kinder unerreichbar gelagert. Das Badezimmer ist wegen der Feuchtigkeit ungünstig.',
};

/**
 * Anwendung in einfacher Sprache nach ATC-Code (Anatomisch-Therapeutisch-Chemische
 * Klassifikation der WHO). Der längste passende Präfix gewinnt.
 * Bewusst allgemein formuliert: Massgebend ist die Packungsbeilage.
 */
export const ATC_USES = {
  // A – Verdauung und Stoffwechsel
  A01A: 'Bei Entzündungen und Schmerzen im Mund und Rachen',
  A02: 'Gegen Sodbrennen und saures Aufstossen',
  A02B: 'Gegen Sodbrennen und zum Schutz des Magens',
  A03: 'Gegen Bauchkrämpfe',
  A03F: 'Gegen Übelkeit und Völlegefühl',
  A04: 'Gegen Übelkeit und Erbrechen',
  A05: 'Für Galle und Leber',
  A06: 'Gegen Verstopfung',
  A07A: 'Gegen Infektionen im Darm',
  A07B: 'Gegen Durchfall (bindet Giftstoffe im Darm)',
  A07C: 'Ersetzt Flüssigkeit und Salze bei Durchfall',
  A07D: 'Gegen Durchfall',
  A07F: 'Baut die Darmflora auf, z. B. bei Durchfall',
  A07: 'Gegen Durchfall und Darmbeschwerden',
  A08: 'Zur Gewichtsabnahme',
  A09: 'Unterstützt die Verdauung',
  A10: 'Gegen Diabetes (senkt den Blutzucker)',
  A11: 'Vitamine',
  A12: 'Mineralstoffe (z. B. Kalzium, Magnesium)',
  A12C: 'Mineralstoffe (z. B. Magnesium, Zink)',
  A13: 'Stärkungsmittel',
  // B – Blut
  B01: 'Hemmt die Blutgerinnung (Blutverdünnung)',
  B02: 'Fördert die Blutgerinnung',
  B03: 'Gegen Blutarmut (z. B. Eisenmangel)',
  B05: 'Infusionen und Spüllösungen',
  // C – Herz und Kreislauf
  C01: 'Für das Herz',
  C02: 'Gegen Bluthochdruck',
  C03: 'Entwässernd (z. B. bei Bluthochdruck)',
  C04: 'Fördert die Durchblutung',
  C05A: 'Gegen Hämorrhoiden',
  C05B: 'Gegen Krampfadern und schwere Beine',
  C05: 'Für die Venen',
  C07: 'Gegen Bluthochdruck und für das Herz',
  C08: 'Gegen Bluthochdruck',
  C09: 'Gegen Bluthochdruck',
  C10: 'Senkt die Blutfette (Cholesterin)',
  // D – Haut
  D01: 'Gegen Pilzinfektionen der Haut und Nägel',
  D02: 'Pflegt und schützt trockene oder wunde Haut',
  D03: 'Fördert die Wundheilung',
  D04: 'Gegen Juckreiz, z. B. nach Insektenstichen',
  D05: 'Gegen Schuppenflechte',
  D06: 'Gegen Infektionen der Haut',
  D06BB: 'Gegen Lippenherpes und Virusinfektionen der Haut',
  D07: 'Gegen Hautentzündungen und Juckreiz (Kortison)',
  D08: 'Zum Desinfizieren von Haut und Wunden',
  D09: 'Wundverband mit Wirkstoff',
  D10: 'Gegen Akne',
  D11: 'Für Haut, Haare und Nägel',
  // G – Urogenital
  G01: 'Gegen Infektionen im Intimbereich',
  G02: 'Für den Intimbereich',
  G03A: 'Zur Empfängnisverhütung',
  G03: 'Hormone',
  G04BD: 'Gegen häufigen Harndrang und Blasenschwäche',
  G04B: 'Für Blase und Harnwege',
  G04C: 'Bei Prostatabeschwerden',
  G04: 'Für Blase und Harnwege',
  // H – Hormone
  H02: 'Kortison gegen Entzündungen und Allergien',
  H03: 'Für die Schilddrüse',
  // J – Infektionen
  J01: 'Antibiotikum gegen bakterielle Infektionen',
  J02: 'Gegen Pilzinfektionen',
  J04: 'Gegen Tuberkulose',
  J05: 'Gegen Virusinfektionen',
  J06: 'Stärkt die Abwehr (Antikörper)',
  J07: 'Impfstoff',
  // L – Krebs und Immunsystem
  L01: 'Gegen Krebs',
  L02: 'Hormontherapie gegen Krebs',
  L03: 'Stärkt das Immunsystem',
  L04: 'Unterdrückt das Immunsystem',
  // M – Muskeln und Gelenke
  M01: 'Gegen Schmerzen und Entzündungen, z. B. in Gelenken und Rücken',
  M01AE: 'Gegen Schmerzen, Entzündungen und Fieber',
  M02: 'Zum Einreiben bei Muskel- und Gelenkschmerzen',
  M03: 'Löst Muskelverspannungen',
  M04: 'Gegen Gicht',
  M05: 'Stärkt die Knochen',
  // N – Nervensystem
  N01: 'Zur Betäubung',
  N01B: 'Zur örtlichen Betäubung',
  N02A: 'Starkes Schmerzmittel',
  N02B: 'Gegen Schmerzen und Fieber',
  N02BA: 'Gegen Schmerzen, Fieber und Erkältungsbeschwerden',
  N02C: 'Gegen Migräne',
  N03: 'Gegen Epilepsie',
  N04: 'Gegen Parkinson',
  N05A: 'Gegen Psychosen',
  N05B: 'Beruhigend, gegen Angst und Unruhe',
  N05C: 'Zum Einschlafen',
  N05CM: 'Pflanzlich beruhigend und zum Einschlafen',
  N06A: 'Gegen Depression',
  N06B: 'Fördert Konzentration und Aufmerksamkeit',
  N06D: 'Gegen Demenz',
  N07B: 'Gegen Abhängigkeit (z. B. Rauchstopp)',
  N07C: 'Gegen Schwindel',
  // P – Parasiten
  P01: 'Gegen Parasiten (z. B. Malaria)',
  P02: 'Gegen Wurmbefall',
  P03: 'Gegen Läuse, Krätze und Insekten',
  // R – Atemwege
  R01A: 'Abschwellend bei verstopfter Nase',
  R01AD: 'Gegen Heuschnupfen und Entzündungen der Nase (Kortison)',
  R01AC: 'Gegen Heuschnupfen in der Nase',
  R01: 'Für die Nase',
  R02: 'Gegen Halsschmerzen',
  R03: 'Gegen Asthma und Atemnot',
  R05C: 'Löst Schleim bei Husten',
  R05D: 'Gegen trockenen Reizhusten',
  R05: 'Gegen Husten und Erkältung',
  R06: 'Gegen Allergien (z. B. Heuschnupfen, Juckreiz)',
  R07: 'Für die Atemwege',
  // S – Augen und Ohren
  S01A: 'Gegen Infektionen am Auge',
  S01B: 'Gegen Entzündungen am Auge',
  S01E: 'Gegen grünen Star (Glaukom)',
  S01G: 'Gegen allergische, juckende oder gerötete Augen',
  S01X: 'Befeuchtet und pflegt die Augen',
  S01: 'Für die Augen',
  S02: 'Für die Ohren (z. B. Ohrenschmerzen)',
  S03: 'Für Augen und Ohren',
  // V – Verschiedenes
  V01: 'Allergietest oder Allergiebehandlung',
  V03AB: 'Gegenmittel bei Vergiftungen',
  V06: 'Spezialnahrung',
};

/** Einfache Anwendung zu einem ATC-Code (längster Präfix), sonst ''. */
export function useFromAtc(atc) {
  const code = String(atc || '').toUpperCase().replace(/\s/g, '');
  for (let len = Math.min(code.length, 7); len >= 3; len--) {
    const hit = ATC_USES[code.slice(0, len)];
    if (hit) return hit;
  }
  return '';
}

/** Standardanwendung für Produkte ohne ATC-Code, nach Darreichungsform. */
export const FORM_USES = {
  pflaster: 'Zum Abdecken und Schützen kleiner Wunden',
};

/** Grobe Einordnung nach dem ersten Buchstaben des ATC-Codes (letzter Ausweg). */
export const ATC_GROUPS = {
  A: 'Für Magen, Darm und Stoffwechsel',
  B: 'Für das Blut',
  C: 'Für Herz und Kreislauf',
  D: 'Für die Haut',
  G: 'Für Blase, Harnwege und Intimbereich',
  H: 'Hormone',
  J: 'Gegen Infektionen',
  L: 'Für das Immunsystem bzw. gegen Krebs',
  M: 'Für Muskeln, Gelenke und Knochen',
  N: 'Für das Nervensystem',
  P: 'Gegen Parasiten',
  R: 'Für die Atemwege',
  S: 'Für Augen und Ohren',
  V: 'Verschiedenes',
};

/** true, wenn ein Text eher französisch als deutsch aussieht (Swissmedic-Liste ist gemischt). */
export function looksFrench(text) {
  const t = String(text || '');
  if (/[äöüß]/i.test(t)) return false;
  return /[éèêàçùâî]|\b(des|du|pour|les|la|le|et|en|peau|plaies|douleurs|traitement|soigner)\b/i.test(t);
}

/** Art des Produkts (Feld „Art“). */
export const PRODUCT_TYPES = [
  { id: '', label: 'unbekannt' },
  { id: 'chemisch', label: 'Arzneimittel (chemisch-synthetisch)' },
  { id: 'pflanzlich', label: '🌿 Pflanzliches Arzneimittel' },
  { id: 'komplementaer', label: 'Homöopathisch / Komplementärmedizin' },
  { id: 'biologisch', label: 'Biologisch (z. B. Impfstoff, Insulin)' },
  { id: 'medizinprodukt', label: 'Medizinprodukt (z. B. Pflaster, Thermometer)' },
  { id: 'nahrung', label: 'Nahrungsergänzung / Vitamine' },
  { id: 'pflege', label: 'Pflege / Kosmetik' },
  { id: 'andere', label: 'Andere' },
];

/** Heilmittelcode der Swissmedic-Liste -> Art. */
export function typeFromCode(code) {
  const c = String(code || '').toLowerCase();
  if (!c) return '';
  if (/phyto/.test(c)) return 'pflanzlich';
  if (/homöo|homoeo|homéo|anthropo|komplement|complément|asiat|tibet|tcm|ayurved|spagyr|gemmo/.test(c)) return 'komplementaer';
  if (/biotech|blut|sang|impf|vaccin|allergen|radio|transplant|zell|gen|immunolog|antiven|bakterien|hefe/.test(c)) return 'biologisch';
  if (/synth|chem|antidot/.test(c)) return 'chemisch';
  return '';
}
