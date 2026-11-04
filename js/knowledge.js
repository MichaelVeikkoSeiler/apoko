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
