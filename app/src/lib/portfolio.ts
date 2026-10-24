// Afgeleide cijfers voor Overzicht en Portefeuille. Puur (geen React), zodat het te testen is.
import { PLANS, TARGETS, type Category, type Plan, type Position } from '../data/sample';

export const CATEGORY_NAMES: [Category, string][] = [
  ['eq', "Aandelen & ETF's"],
  ['cr', 'Crypto'],
  ['cash', 'Cash'],
  ['gold', 'Goud'],
];

export function sumCategory(list: Position[], cat: Category): number {
  return list.filter((p) => p.cat === cat).reduce((a, p) => a + p.value, 0);
}

/** Belegd (alles met een aankoopprijs) en wat het gekost heeft. */
export function investedAndCost(list: Position[]) {
  const withCost = list.filter((p) => p.cost);
  return {
    invested: withCost.reduce((a, p) => a + p.value, 0),
    cost: withCost.reduce((a, p) => a + (p.cost ?? 0), 0),
  };
}

export const FILTERS = ['Alles', 'ETF', 'Aandelen', 'Crypto', 'Cash', 'Goud'] as const;
export type Filter = (typeof FILTERS)[number] | 'Aandelen & ETF';

export function matchesFilter(p: Position, f: Filter): boolean {
  switch (f) {
    case 'Alles': return true;
    case 'ETF': return p.cls === 'ETF';
    case 'Aandelen': return p.cls === 'Aandeel';
    case 'Aandelen & ETF': return p.cat === 'eq';
    case 'Crypto': return p.cat === 'cr';
    case 'Cash': return p.cat === 'cash';
    case 'Goud': return p.cat === 'gold';
  }
}

/** Eén regel in een groep; `override` is een deel van een positie (bijv. BTC op OKX). */
export type GroupRow = { position: Position; override?: { name: string; sub: string; value: number } };
export type Group = { name: string; total: number; rows: GroupRow[] };

export function groupByCategory(list: Position[], f: Filter): Group[] {
  return CATEGORY_NAMES.map(([cat, name]) => {
    const rows = list.filter((p) => p.cat === cat && matchesFilter(p, f)).map((position) => ({ position }));
    return { name, total: rows.reduce((a, r) => a + r.position.value, 0), rows };
  }).filter((g) => g.rows.length);
}

/** Per bron. Een munt op meerdere plekken (BTC op Trezor én OKX) staat bij elke plek met zijn eigen deel. */
export function groupBySource(list: Position[], f: Filter): Group[] {
  const groups = new Map<string, GroupRow[]>();
  const add = (src: string, row: GroupRow) => groups.set(src, [...(groups.get(src) ?? []), row]);
  for (const p of list.filter((x) => matchesFilter(x, f))) {
    if (p.wallets?.length) {
      for (const w of p.wallets) {
        add(w.name, { position: p, override: { name: p.name, sub: `${w.qty} · ${w.icon === 'lock' ? 'cold storage' : w.name}`, value: w.value } });
      }
    } else {
      add(p.src, { position: p });
    }
  }
  return [...groups].map(([name, rows]) => ({
    name, rows, total: rows.reduce((a, r) => a + (r.override?.value ?? r.position.value), 0),
  }));
}

/** Bedrag per maand van een plan; wekelijks telt als 52/12 keer per maand. */
export const perMonth = (p: Plan) => (p.freq === 'Wekelijks' ? (p.amount * 52) / 12 : p.amount);

export function monthlyInvesting(plans: Plan[] = PLANS): number {
  return plans.filter((p) => p.active).reduce((a, p) => a + perMonth(p), 0);
}

/** Aantal klassen dat meer dan 5 procentpunt van het doel afwijkt. */
export function rebalanceDeviations(list: Position[], total: number, targets = TARGETS): number {
  if (!total) return 0;
  return CATEGORY_NAMES.filter(([cat]) => Math.abs((sumCategory(list, cat) / total) * 100 - targets[cat]) > 5).length;
}

/** Bedragen voor "Waar het staat": per klasse, met spaargeld en betaalgeld apart, plus de bronnen erachter. */
export function allocation(list: Position[]) {
  const sources = (cat: Category) => [...new Set(list.filter((p) => p.cat === cat).flatMap((p) => p.wallets?.map((w) => w.name) ?? [p.src]))];
  const cash = list.filter((p) => p.cat === 'cash');
  return {
    eq: sumCategory(list, 'eq'),
    cr: sumCategory(list, 'cr'),
    gold: sumCategory(list, 'gold'),
    savings: cash.filter((p) => p.tile === 3).reduce((a, p) => a + p.value, 0),
    payment: cash.filter((p) => p.tile !== 3).reduce((a, p) => a + p.value, 0),
    eqSources: sources('eq'),
    crSources: sources('cr'),
  };
}
