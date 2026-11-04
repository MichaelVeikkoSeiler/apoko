// Freie Produktdatenbanken (Open Food Facts & Schwesterprojekte) für Artikel,
// die keine Arzneimittel sind: Pflaster, Verbände, Thermometer, Drogerieartikel.
// Es wird nur die Strichcode-Nummer abgefragt, keine persönlichen Daten.

const SOURCES = [
  'https://world.openproductsfacts.org',
  'https://world.openbeautyfacts.org',
  'https://world.openfoodfacts.org',
];
const FIELDS = 'product_name,product_name_de,product_name_fr,generic_name_de,generic_name,brands,quantity';

async function query(base, code, signal) {
  const r = await fetch(`${base}/api/v2/product/${code}.json?fields=${FIELDS}`, { signal });
  if (!r.ok) throw new Error('http ' + r.status);
  const j = await r.json();
  if (j.status !== 1 || !j.product) throw new Error('not found');
  const p = j.product;
  const name = p.product_name_de || p.product_name || p.generic_name_de || p.product_name_fr || p.generic_name;
  if (!name) throw new Error('no name');
  return { name: name.trim(), brand: (p.brands || '').split(',')[0].trim(), quantity: p.quantity || '' };
}

/** Sucht eine GTIN in den offenen Datenbanken. Liefert { name, quantity, unit } oder null. */
export async function lookupOpenProduct(gtin) {
  const code = String(gtin).replace(/^0+(?=\d{13}$)/, ''); // 14 -> 13 Stellen (EAN-13)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const p = await Promise.any(SOURCES.map(s => query(s, code, ctrl.signal)));
    ctrl.abort();
    let name = p.name;
    if (p.brand && !name.toLowerCase().includes(p.brand.toLowerCase())) name = `${p.brand} ${name}`;
    const m = /(\d+(?:[.,]\d+)?)\s*(ml|g|stk|stück|st\.?|pcs|pieces|pièces)?/i.exec(p.quantity);
    const qty = m ? parseFloat(m[1].replace(',', '.')) : null;
    const unit = !m?.[2] ? null : /ml/i.test(m[2]) ? 'ml' : /^g$/i.test(m[2]) ? 'g' : 'Stk';
    return { name, quantity: qty, unit };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
