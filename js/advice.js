// Beschwerden -> passende Mittel aus dem eigenen Vorrat.
// Bewusst vorsichtig: keine Diagnose, keine Dosierung. Warnzeichen zuerst.
// Zuordnung über den ATC-Code (WHO-Klassifikation) und Stichworte in Name/Wirkstoff/Anwendung.

export const EMERGENCY = 'Notfall: 144 · Vergiftung: Tox Info Suisse 145 · Ärztlicher Notfalldienst: 0900 144 144 (kostenpflichtig) oder Hausarzt';

export const SYMPTOMS = [
  {
    id: 'kopf', label: 'Kopfschmerzen', icon: '🤕',
    syn: ['kopf', 'kopfweh', 'kopfschmerz', 'migräne', 'migraene', 'brummschädel'],
    atc: ['N02B', 'N02C', 'M01AE', 'M01AG'],
    keys: ['paracetamol', 'ibuprofen', 'acetylsalicyl', 'aspirin', 'dafalgan', 'panadol', 'algifor', 'brufen', 'naproxen', 'mefenamin', 'ponstan', 'kopfschmerz'],
    ask: 'Paracetamol oder Ibuprofen',
    tip: 'Genug trinken, Pause an der frischen Luft, Bildschirm weg.',
    red: 'Plötzlich stärkste Kopfschmerzen, Nackensteifigkeit mit Fieber, Lähmungen, Sprach- oder Sehstörungen, Verwirrtheit oder Kopfschmerzen nach einem Sturz.',
  },
  {
    id: 'fieber', label: 'Fieber', icon: '🌡️',
    syn: ['fieber', 'temperatur', 'schüttelfrost'],
    atc: ['N02BE', 'N02BA', 'N02BB', 'M01AE'],
    keys: ['paracetamol', 'ibuprofen', 'acetylsalicyl', 'aspirin', 'dafalgan', 'panadol', 'algifor', 'fieber'],
    ask: 'Paracetamol oder Ibuprofen',
    tip: 'Viel trinken und ausruhen. Fieber ist eine Abwehrreaktion und muss nicht immer gesenkt werden.',
    red: 'Säuglinge unter 3 Monaten mit Fieber, Fieber über 39.5 °C oder länger als 3 Tage, Atemnot, Verwirrtheit, steifer Nacken oder Hautausschlag, der beim Draufdrücken nicht verblasst.',
  },
  {
    id: 'hals', label: 'Halsschmerzen', icon: '🗣️',
    syn: ['hals', 'halsweh', 'halsschmerz', 'schluck', 'heiser', 'angina', 'rachen'],
    atc: ['R02', 'A01A', 'N02B', 'M01AE'],
    keys: ['lutsch', 'hals', 'rachen', 'neo-angin', 'mebucain', 'lemocin', 'strepsils', 'tantum', 'salbei'],
    ask: 'Lutschtabletten oder Rachenspray gegen Halsschmerzen',
    tip: 'Warme Getränke, Salbeitee, Lutschen hält den Hals feucht.',
    red: 'Starke Schluckbeschwerden, kaum Mund öffnen können, Atemnot, Speichelfluss oder hohes Fieber über mehr als 3 Tage.',
  },
  {
    id: 'husten', label: 'Husten', icon: '😮‍💨',
    syn: ['husten', 'hust', 'schleim', 'auswurf', 'bronch', 'reizhusten'],
    atc: ['R05'],
    keys: ['husten', 'sirup', 'bronch', 'acetylcystein', 'ambroxol', 'bromhexin', 'dextromethorphan', 'codein', 'efeu', 'thymian', 'resyl', 'bexin', 'prospan'],
    ask: 'einem Hustenmittel (schleimlösend bei festsitzendem, hustenstillend bei trockenem Husten)',
    tip: 'Viel trinken, Raumluft befeuchten, Inhalieren mit Dampf.',
    red: 'Atemnot, Brustschmerzen, Blut im Auswurf, hohes Fieber oder Husten länger als 3 Wochen.',
  },
  {
    id: 'schnupfen', label: 'Schnupfen / verstopfte Nase', icon: '🤧',
    syn: ['schnupfen', 'nase', 'verstopf', 'rotz', 'nies', 'erkält', 'sinus', 'nebenhöhle'],
    atc: ['R01A', 'R01B'],
    keys: ['nasenspray', 'nasentropfen', 'xylometazolin', 'oxymetazolin', 'otrivin', 'nasivin', 'triofan', 'rinosedin', 'meersalz', 'nasen'],
    ask: 'einem abschwellenden Nasenspray oder Meersalzspray',
    tip: 'Abschwellende Nasensprays höchstens 5 bis 7 Tage am Stück verwenden. Meersalzspray geht länger.',
    red: 'Starke Gesichts- oder Stirnschmerzen mit Fieber, Schwellung um die Augen oder Beschwerden länger als 10 Tage.',
  },
  {
    id: 'allergie', label: 'Allergie / Heuschnupfen', icon: '🌼',
    syn: ['allergi', 'heuschnupfen', 'pollen', 'niesen', 'quaddel', 'nesselsucht'],
    atc: ['R06', 'R01AC', 'R01AD', 'S01G'],
    keys: ['cetirizin', 'loratadin', 'desloratadin', 'fexofenadin', 'levocetirizin', 'bilastin', 'zyrtec', 'xyzal', 'aerius', 'telfast', 'fenistil', 'allergi'],
    ask: 'einem Antiallergikum (Antihistaminikum)',
    tip: 'Pollen meiden: abends Haare waschen, Kleider nicht im Schlafzimmer ausziehen.',
    red: 'Schwellung von Zunge, Lippen oder Rachen, Atemnot, Schwindel oder Kreislaufprobleme. Das kann eine lebensbedrohliche allergische Reaktion sein: sofort 144.',
  },
  {
    id: 'stich', label: 'Insektenstich / Juckreiz', icon: '🦟',
    syn: ['stich', 'mücke', 'muecke', 'wespe', 'biene', 'insekt', 'juck', 'zecke'],
    atc: ['D04', 'R06', 'D07'],
    keys: ['fenistil', 'hydrocortison', 'juck', 'stich', 'insekt', 'dimetinden', 'zeckenzange', 'pinzette'],
    ask: 'einem Gel gegen Juckreiz',
    tip: 'Kühlen. Bei einem Zeckenstich die Zecke sofort mit Pinzette oder Zeckenzange entfernen und die Stelle beobachten.',
    red: 'Stich im Mund oder Rachen, Atemnot, Schwellung im Gesicht, Schwindel (allergische Reaktion: 144) oder ein sich ausbreitender roter Ring nach einem Zeckenstich.',
  },
  {
    id: 'durchfall', label: 'Durchfall', icon: '🚽',
    syn: ['durchfall', 'diarrh', 'dünnflüssig', 'magen-darm', 'brechdurchfall'],
    atc: ['A07'],
    keys: ['loperamid', 'imodium', 'elektrolyt', 'normolytoral', 'oralpädon', 'perenterol', 'bioflorin', 'kohle', 'durchfall'],
    ask: 'einer Elektrolytlösung (und eventuell einem Mittel gegen Durchfall)',
    tip: 'Viel trinken, salzige Brühe, Zwieback. Flüssigkeit ersetzen ist das Wichtigste.',
    red: 'Blut im Stuhl, hohes Fieber, starke Bauchschmerzen, Zeichen von Austrocknung (kaum Urin, Benommenheit), Säuglinge, Kleinkinder und ältere Menschen, Dauer über 3 Tage. Loperamid nicht bei Fieber oder Blut im Stuhl.',
  },
  {
    id: 'uebelkeit', label: 'Übelkeit / Erbrechen', icon: '🤢',
    syn: ['übel', 'uebel', 'erbrech', 'kotz', 'brechreiz', 'reisekrank', 'seekrank'],
    atc: ['A04', 'A03F', 'A07C'],
    keys: ['übelkeit', 'reise', 'domperidon', 'motilium', 'itinerol', 'trawell', 'ingwer', 'elektrolyt'],
    ask: 'einem Mittel gegen Übelkeit oder Reisekrankheit',
    tip: 'In kleinen Schlucken trinken, Ingwer oder Pfefferminztee.',
    red: 'Erbrechen nach Kopfverletzung, starke Bauchschmerzen, Blut im Erbrochenen, Zeichen von Austrocknung oder anhaltendes Erbrechen bei Kindern.',
  },
  {
    id: 'sodbrennen', label: 'Sodbrennen / Magenbrennen', icon: '🔥',
    syn: ['sodbrennen', 'magenbrennen', 'magen', 'aufstoss', 'säure', 'saeure', 'reflux', 'gastritis'],
    atc: ['A02'],
    keys: ['rennie', 'riopan', 'alucol', 'gaviscon', 'pantoprazol', 'omeprazol', 'esomeprazol', 'antazid', 'sodbrennen'],
    ask: 'einem Mittel gegen Sodbrennen',
    tip: 'Kleinere Mahlzeiten, nicht spät essen, Oberkörper beim Schlafen etwas hoch lagern.',
    red: 'Brustschmerzen oder Druck auf der Brust (kann ein Herzinfarkt sein: 144), schwarzer Stuhl, Blut erbrechen, Schluckbeschwerden oder ungewollter Gewichtsverlust.',
  },
  {
    id: 'bauch', label: 'Bauchkrämpfe / Blähungen', icon: '🫄',
    syn: ['bauch', 'bauchkrampf', 'magenkrampf', 'bläh', 'blaeh', 'völle', 'voelle', 'reizdarm'],
    atc: ['A03', 'A16AX', 'A09'],
    keys: ['iberogast', 'buscopan', 'butylscopolamin', 'carminativ', 'kümmel', 'fenchel', 'simeticon', 'flatulex', 'pfefferminz'],
    ask: 'einem krampflösenden Mittel oder einem Mittel gegen Blähungen',
    tip: 'Wärme auf den Bauch, Fenchel- oder Kümmeltee.',
    red: 'Starke oder zunehmende Bauchschmerzen, harter Bauch, Fieber, Blut im Stuhl oder Schmerzen rechts unten (Blinddarm).',
  },
  {
    id: 'verstopfung', label: 'Verstopfung', icon: '🧻',
    syn: ['verstopf', 'stuhlgang', 'obstipation'],
    atc: ['A06'],
    keys: ['abführ', 'macrogol', 'movicol', 'laxoberon', 'dulcolax', 'bisacodyl', 'lactulose', 'flohsamen', 'metamucil'],
    ask: 'einem milden Abführmittel (z. B. Macrogol oder Flohsamen)',
    tip: 'Viel trinken, Bewegung, ballaststoffreich essen.',
    red: 'Starke Bauchschmerzen, Erbrechen, aufgeblähter Bauch ohne Winde, Blut im Stuhl oder neu aufgetretene Verstopfung ohne erkennbaren Grund.',
  },
  {
    id: 'wunde', label: 'Wunde / Schürfung / Schnitt', icon: '🩹',
    syn: ['wunde', 'schnitt', 'schürf', 'schuerf', 'kratzer', 'blutet', 'verletz', 'aufgeschlagen'],
    atc: ['D08', 'D03', 'D09'],
    forms: ['pflaster'],
    keys: ['pflaster', 'verband', 'desinf', 'merfen', 'betadine', 'octenisept', 'kompresse', 'gaze', 'wund', 'bepanthen'],
    ask: 'Wunddesinfektion und Pflastern',
    tip: 'Wunde mit sauberem Wasser ausspülen, desinfizieren, abdecken.',
    red: 'Stark blutende oder tiefe, klaffende Wunden, Bisswunden, Fremdkörper in der Wunde, Rötung und Schwellung nach einigen Tagen. Tetanusimpfung älter als 10 Jahre: zum Arzt.',
  },
  {
    id: 'verbrennung', label: 'Verbrennung / Sonnenbrand', icon: '☀️',
    syn: ['verbrenn', 'verbrüh', 'brandwund', 'sonnenbrand', 'sonne', 'brand'],
    atc: ['D03', 'D02', 'D04'],
    keys: ['bepanthen', 'dexpanthenol', 'brand', 'flammazine', 'after sun', 'after-sun', 'aloe', 'kühl'],
    ask: 'einer Brand- oder Wundsalbe',
    tip: 'Sofort 10 bis 20 Minuten mit lauwarmem (nicht eiskaltem) Wasser kühlen. Blasen nicht aufstechen.',
    red: 'Grossflächige Verbrennungen, Blasen grösser als die eigene Handfläche, Verbrennungen an Gesicht, Händen oder Genitalien, bei Kindern, oder Verbrennungen durch Strom oder Chemikalien: 144.',
  },
  {
    id: 'muskel', label: 'Muskel-, Gelenk- oder Rückenschmerzen', icon: '💪',
    syn: ['muskel', 'gelenk', 'rücken', 'ruecken', 'nacken', 'prell', 'zerr', 'verstauch', 'hexenschuss', 'knieschmerz', 'schulterschmerz', 'wadenkrampf', 'muskelkater'],
    atc: ['M01', 'M02', 'N02B', 'M03'],
    keys: ['voltaren', 'diclofenac', 'ibuprofen', 'perskindol', 'arnika', 'kühl', 'wärme', 'dolo', 'flector', 'algifor'],
    ask: 'einem Schmerzgel oder Ibuprofen',
    tip: 'Bei frischer Verletzung: kühlen, hochlagern, schonen. Bei Verspannungen eher Wärme.',
    red: 'Nach einem Unfall mit Fehlstellung oder starker Schwellung, wenn das Bein nicht belastbar ist, bei Taubheit, Lähmung oder Rückenschmerzen mit Problemen beim Wasserlassen.',
  },
  {
    id: 'zahn', label: 'Zahnschmerzen', icon: '🦷',
    syn: ['zahn', 'zähne', 'zaehne', 'zahnfleisch', 'kiefer'],
    atc: ['N02B', 'M01AE', 'A01A'],
    keys: ['paracetamol', 'ibuprofen', 'dafalgan', 'algifor', 'zahn'],
    ask: 'Ibuprofen oder Paracetamol (überbrückend bis zum Zahnarzt)',
    tip: 'Schmerzmittel überbrücken nur, die Ursache muss die Zahnärztin behandeln.',
    red: 'Schwellung im Gesicht oder am Hals, Fieber, Schluck- oder Atembeschwerden: sofort zum Zahnarzt oder Notfall.',
  },
  {
    id: 'mens', label: 'Menstruationsbeschwerden', icon: '🩸',
    syn: ['menstru', 'periode', 'regelschmerz', 'regelblutung', 'unterleib'],
    atc: ['M01AE', 'M01AG', 'N02B', 'A03'],
    keys: ['ibuprofen', 'mefenamin', 'ponstan', 'naproxen', 'buscopan', 'paracetamol', 'algifor'],
    ask: 'Ibuprofen oder Mefenaminsäure',
    tip: 'Wärmeflasche auf den Bauch, leichte Bewegung.',
    red: 'Ungewöhnlich starke Schmerzen oder Blutungen, Schmerzen mit Fieber oder Schwangerschaft möglich.',
  },
  {
    id: 'augen', label: 'Augen: trocken, juckend, gerötet', icon: '👁️',
    syn: ['auge', 'augen', 'bindehaut', 'trockene augen', 'tränen'],
    atc: ['S01X', 'S01G', 'S01A', 'S01'],
    forms: ['augentropfen'],
    keys: ['augen', 'hyaluron', 'tränen', 'visine', 'vismed', 'artelac'],
    ask: 'Augentropfen (Tränenersatz oder gegen Allergie)',
    tip: 'Angebrochene Augentropfen meist nur 4 Wochen verwenden.',
    red: 'Sehverschlechterung, starke Augenschmerzen, Lichtempfindlichkeit, Fremdkörper oder Chemikalie im Auge (sofort mit Wasser spülen, Notfall).',
  },
  {
    id: 'ohren', label: 'Ohrenschmerzen', icon: '👂',
    syn: ['ohr', 'ohren'],
    atc: ['S02', 'N02B', 'M01AE'],
    forms: ['ohrentropfen'],
    keys: ['ohren', 'otalgan', 'otipax', 'paracetamol', 'ibuprofen'],
    ask: 'einem Schmerzmittel (Ohrentropfen nur nach Rücksprache)',
    tip: 'Ohrentropfen nicht verwenden, wenn das Trommelfell verletzt sein könnte.',
    red: 'Ausfluss aus dem Ohr, Hörverlust, hohes Fieber, Schwellung hinter dem Ohr oder Ohrenschmerzen bei Kleinkindern länger als 1 Tag.',
  },
  {
    id: 'schlaf', label: 'Schlafprobleme / Unruhe', icon: '😴',
    syn: ['schlaf', 'einschlaf', 'durchschlaf', 'unruh', 'nervös', 'stress', 'angst'],
    atc: ['N05CM', 'N05C', 'N05B'],
    keys: ['baldrian', 'melisse', 'passionsblume', 'hopfen', 'zeller', 'redormin', 'lavendel', 'schlaf'],
    ask: 'einem pflanzlichen Beruhigungsmittel (z. B. Baldrian)',
    tip: 'Regelmässige Schlafzeiten, abends kein Bildschirm, kein Koffein am Nachmittag.',
    red: 'Anhaltende Schlaflosigkeit über Wochen, Niedergeschlagenheit oder Gedanken, sich etwas anzutun: Dargebotene Hand 143.',
  },
  {
    id: 'herpes', label: 'Fieberblasen / Lippenherpes', icon: '👄',
    syn: ['herpes', 'fieberblase', 'lippe', 'bläschen'],
    atc: ['D06BB'],
    keys: ['aciclovir', 'zovirax', 'herpes', 'lippe', 'compeed herpes'],
    ask: 'einer Herpescreme',
    tip: 'Früh beim ersten Kribbeln auftragen, Bläschen nicht berühren.',
    red: 'Herpes am Auge, sehr ausgedehnter Befall oder bei geschwächtem Immunsystem.',
  },
  {
    id: 'pilz', label: 'Haut- oder Fusspilz', icon: '🦶',
    syn: ['pilz', 'fusspilz', 'nagelpilz', 'hautpilz'],
    atc: ['D01'],
    keys: ['clotrimazol', 'terbinafin', 'lamisil', 'canesten', 'pevaryl', 'pilz'],
    ask: 'einer Creme gegen Hautpilz',
    tip: 'Füsse gut abtrocknen, auch zwischen den Zehen, Socken täglich wechseln.',
    red: 'Ausbreitung trotz Behandlung, Diabetes, Fieber oder entzündete, eitrige Stellen.',
  },
];

const norm = s => String(s || '').toLowerCase().normalize('NFC');

/** Erkennt Beschwerden in einem frei eingegebenen Text. */
export function detectSymptoms(text) {
  const t = norm(text);
  if (!t.trim()) return [];
  return SYMPTOMS.filter(s => s.syn.some(w => t.includes(w))).map(s => s.id);
}

/** Wie gut passt ein Artikel zu einer Beschwerde? 0 = gar nicht. */
export function matchScore(item, symptom) {
  const atc = String(item.atc || '').toUpperCase();
  if (atc && symptom.atc.some(p => atc.startsWith(p))) return 3;
  if (symptom.forms?.includes(item.form)) return 2;
  const hay = norm([item.name, item.substance, item.usage].join(' '));
  if (symptom.keys.some(k => hay.includes(k))) return 1;
  return 0;
}

/**
 * Ergebnis pro Beschwerde:
 * { symptom, use: [...], rx: [...], expired: [...] } jeweils { item, score }
 */
export function adviseFor(symptomIds, items, expiryStatus) {
  return symptomIds.map(id => SYMPTOMS.find(s => s.id === id)).filter(Boolean).map(symptom => {
    const hits = items
      .map(item => ({ item, score: matchScore(item, symptom), st: expiryStatus(item) }))
      .filter(h => h.score > 0)
      .sort((a, b) => b.score - a.score || (a.st.days ?? 1e9) - (b.st.days ?? 1e9));
    return {
      symptom,
      use: hits.filter(h => h.st.status !== 'expired' && !h.item.rx),
      rx: hits.filter(h => h.st.status !== 'expired' && h.item.rx),
      expired: hits.filter(h => h.st.status === 'expired'),
    };
  });
}
