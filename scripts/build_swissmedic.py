#!/usr/bin/env python3
"""Erzeugt data/swissmedic.json aus der öffentlichen Swissmedic-Liste
"Zugelassene Packungen" (Humanarzneimittel, Excel).

  python scripts/build_swissmedic.py --download data/swissmedic.json
  python scripts/build_swissmedic.py --xlsx liste.xlsx data/swissmedic.json

Ergebnis: { "<Zulassungsnr 5-stellig><Packungscode 3-stellig>":
            [Bezeichnung, Wirkstoffe, Packungsgrösse, Einheit, Abgabekategorie, ATC-Code, Anwendungsgebiet] }
Die GTIN Schweizer Arzneimittel ist 7680 + Zulassungsnr + Packungscode + Prüfziffer.
"""
import argparse
import io
import json
import re
import sys
import urllib.request
from urllib.parse import urljoin

LIST_PAGE = 'https://www.swissmedic.ch/swissmedic/de/home/services/listen_neu.html'
UA = {'User-Agent': 'Mozilla/5.0 (apoko build; +https://github.com/MichaelVeikkoSeiler/apoko)'}

# Spalte -> Regex auf die Kopfzeile (Swissmedic ändert Bezeichnungen gelegentlich leicht)
# Mehrere Muster = Priorität von links nach rechts.
COLUMNS = {
    'auth': [r'zulassungs.?n(umme)?r'],
    'name': [r'bezeichnung des arzneimittels', r'bezeichnung'],
    'pack': [r'packungscode', r'packungs.?nr'],
    'size': [r'packungsgr'],
    'unit': [r'^einheit'],
    'cat': [r'abgabekategorie\s*packung', r'abgabekategorie\s*dosis', r'abgabekategorie'],
    'substance': [r'wirkstoff'],
    'atc': [r'^atc'],
    'use': [r'anwendungsgebiet arzneimittel', r'anwendungsgebiet'],
}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def find_xlsx_url():
    html = fetch(LIST_PAGE).decode('utf-8', 'replace')
    links = re.findall(r'href="([^"]+\.xlsx)"', html, re.I)
    candidates = [l for l in links if re.search(r'packungen', l, re.I) and not re.search(r'tam|tier|vet', l, re.I)]
    if not candidates:
        candidates = [l for l in links if re.search(r'packungen', l, re.I)]
    if not candidates:
        sys.exit('Keine Excel-Datei "Zugelassene Packungen" auf der Swissmedic-Seite gefunden. Links: %s' % links[:20])
    url = urljoin(LIST_PAGE, candidates[0])
    print('Lade', url)
    return url


def norm(s):
    return re.sub(r'\s+', ' ', str(s or '')).strip()


def convert(xlsx_bytes):
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(xlsx_bytes), read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = ws.iter_rows(values_only=True)

    header_idx = None
    for i, row in enumerate(rows):
        cells = [norm(c).lower() for c in row]
        if any(re.search(COLUMNS['pack'][0], c) for c in cells) and any(re.search(COLUMNS['auth'][0], c) for c in cells):
            header_idx = {}
            for key, patterns in COLUMNS.items():
                for rx in patterns:
                    j = next((j for j, c in enumerate(cells) if re.search(rx, c) and j not in header_idx.values()), None)
                    if j is not None:
                        header_idx[key] = j
                        break
            print('Kopfzeile:', [norm(c) for c in row])
            print('Zuordnung:', header_idx)
            break
        if i > 30:
            break
    if not header_idx or not {'auth', 'name', 'pack'} <= header_idx.keys():
        sys.exit('Kopfzeile der Swissmedic-Liste nicht erkannt.')

    def get(row, key):
        j = header_idx.get(key)
        return row[j] if j is not None and j < len(row) else None

    out = {}
    for row in rows:
        auth, pack = get(row, 'auth'), get(row, 'pack')
        if auth is None or pack is None:
            continue
        try:
            key = '%05d%03d' % (int(float(auth)), int(float(pack)))
        except (TypeError, ValueError):
            continue
        size = get(row, 'size')
        if isinstance(size, float) and size.is_integer():
            size = int(size)
        cat = norm(get(row, 'cat')).upper()[:1]
        out[key] = [
            norm(get(row, 'name')),
            norm(get(row, 'substance')),
            size if isinstance(size, (int, float)) else norm(size),
            norm(get(row, 'unit')),
            cat if cat in 'ABCDE' else '',
            norm(get(row, 'atc')).upper().replace(' ', ''),
            norm(get(row, 'use'))[:160],
        ]
    if len(out) < 1000:
        sys.exit('Nur %d Packungen gelesen, das ist zu wenig.' % len(out))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--download', action='store_true')
    g.add_argument('--xlsx')
    a = ap.parse_args()
    data = fetch(find_xlsx_url()) if a.download else open(a.xlsx, 'rb').read()
    out = convert(data)
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('%d Packungen geschrieben nach %s' % (len(out), a.out))


if __name__ == '__main__':
    main()
