// Afgeleide cijfers voor Overzicht en Portefeuille. Puur (geen React), zodat het te testen is.
import {
  PLANS, POSITIONS, TARGETS, TOTAL,
  type Category, type Plan, type Position,
} from '../data/sample';

export const CATEGORY_NAMES: [Category, string][] = [
  ['eq', "Aandelen & ETF's"],
  ['cr', 'Crypto'],
  ['cash', 'Cash'],
  ['gold', 'Goud'],
];

export function sumCategory(cat: Category, list: Position[] = POSITIONS): number {
  return list.filter((p) => p.cat === cat).reduce((a, p) => a + p.value, 0);
}

/** Belegd (alles met een aankoopprijs) en wat het gekost heeft. */
export function investedAndCost(list: Position[] = POSITIONS) {
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

export function groupByCategory(f: Filter): Group[] {
  return CATEGORY_NAMES.map(([cat, name]) => {
    const rows = POSITIONS.filter((p) => p.cat === cat && matchesFilter(p, f)).map((position) => ({ position }));
    return { name, total: rows.reduce((a, r) => a + r.position.value, 0), rows };
  }).filter((g) => g.rows.length);
}

export function groupBySource(f: Filter): Group[] {
  const get = (id: string) => POSITIONS.find((p) => p.id === id)!;
  const btc = get('btc');
  const def: [string, GroupRow[]][] = [
    ['Trading 212', ['vwce', 'sxr8', 'asml', 'aapl'].map((id) => ({ position: get(id) }))],
    ['OKX', [
      { position: btc, override: { name: 'Bitcoin', sub: '0,0377 BTC · OKX', value: 3461 } },
      { position: get('eth') },
      { position: get('sol') },
    ]],
    ['Trezor Safe 5', [{ position: btc, override: { name: 'Bitcoin', sub: '0,1075 BTC · cold storage', value: 9870 } }]],
    ['ING', [{ position: get('spaar') }, { position: get('betaal') }]],
    ['Handmatig', [{ position: get('goud') }]],
  ];
  return def
    .map(([name, list]) => {
      const rows = list.filter((r) => matchesFilter(r.position, f));
      return { name, total: rows.reduce((a, r) => a + (r.override?.value ?? r.position.value), 0), rows };
    })
    .filter((g) => g.rows.length);
}

/** Bedrag per maand van een plan; wekelijks telt als 52/12 keer per maand. */
export const perMonth = (p: Plan) => (p.freq === 'Wekelijks' ? (p.amount * 52) / 12 : p.amount);

export function monthlyInvesting(plans: Plan[] = PLANS): number {
  return plans.filter((p) => p.active).reduce((a, p) => a + perMonth(p), 0);
}

/** Aantal klassen dat meer dan 5 procentpunt van het doel afwijkt. */
export function rebalanceDeviations(targets = TARGETS, total = TOTAL): number {
  return CATEGORY_NAMES.filter(([cat]) => Math.abs((sumCategory(cat) / total) * 100 - targets[cat]) > 5).length;
}
