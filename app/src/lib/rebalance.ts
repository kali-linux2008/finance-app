// Herbalanceren: je doel per klasse naast wat je nu hebt. Puur (geen React), zodat het te testen is.
// De server rekent de echte orders uit; dit bestand doet het scherm en de voorbeelddata.
import type { Category, Position } from '../data/sample';
import { CATEGORY_NAMES, sumCategory } from './portfolio';

export type Targets = Record<Category, number>;
export const CLASS_COLORS: Record<Category, string> = { eq: '#6C80E0', cr: '#C9A15A', cash: '#7E9C8A', gold: '#A08A62' };
export const STEP = 5;
/** Binnen 2 procentpunt van je doel: niets doen (zoals in het ontwerp). */
export const MARGIN = 2;

export type ClassRow = { cls: Category; name: string; value: number; pct: number; target: number; diff: number; within: boolean };

export function current(list: Position[]): Targets {
  return { eq: sumCategory(list, 'eq'), cr: sumCategory(list, 'cr'), cash: sumCategory(list, 'cash'), gold: sumCategory(list, 'gold') };
}

export const targetSum = (t: Targets) => t.eq + t.cr + t.cash + t.gold;

/** Doel met 5% erbij of eraf, tussen 0 en 100. */
export function bump(t: Targets, cls: Category, delta: number): Targets {
  return { ...t, [cls]: Math.max(0, Math.min(100, t[cls] + delta)) };
}

export function rows(now: Targets, t: Targets): ClassRow[] {
  const total = targetSum(now);
  return CATEGORY_NAMES.map(([cls, name]) => {
    const pct = total ? (now[cls] / total) * 100 : 0;
    return { cls, name, value: now[cls], pct, target: t[cls], diff: (total * t[cls]) / 100 - now[cls], within: Math.abs(pct - t[cls]) < MARGIN };
  });
}

/** Wat er in totaal moet verschuiven: de som van wat te weinig is. */
export const shift = (list: ClassRow[]) => list.reduce((a, r) => a + Math.max(r.diff, 0), 0);

/** Werkwoord bij een klasse: "bijkopen", "verkopen", "aanvullen" of "overboeken". */
export function verb(r: ClassRow): string {
  if (r.within) return '';
  if (r.cls === 'cash') return r.diff > 0 ? 'aanvullen' : 'overboeken';
  return r.diff > 0 ? 'bijkopen' : 'verkopen';
}

/** Hoeveel extra inleg je nodig hebt om zonder verkopen op je doel te komen. */
export function extraNeeded(list: ClassRow[]): number {
  const total = list.reduce((a, r) => a + r.value, 0);
  return Math.max(0, ...list.filter((r) => r.diff < 0 && r.target > 0).map((r) => r.value / (r.target / 100) - total));
}

/** Nieuw geld verdelen: eerst wat het verst achterloopt, de rest volgens je doel (zelfde als de server). */
export function buyOnly(list: ClassRow[], amount: number): { cls: Category; name: string; amount: number }[] {
  if (amount <= 0) return [];
  const short = list.map((r) => Math.max(r.diff, 0));
  const need = short.reduce((a, b) => a + b, 0);
  const part = Math.min(amount, need);
  const split = list.map((r, i) => (need > 0 ? (part * short[i]) / need : 0));
  const rest = amount - split.reduce((a, b) => a + b, 0);
  if (rest > 0.005) list.forEach((r, i) => (split[i] += (rest * r.target) / 100));
  return list.map((r, i) => ({ cls: r.cls, name: r.name, amount: Math.round(split[i] * 100) / 100 })).filter((x) => x.amount >= 0.5);
}

/** Bogen voor de ring: buiten = doel, binnen = nu. Per klasse [lengte, beginpunt] op de omtrek. */
export function dial(list: ClassRow[]) {
  const outer = 2 * Math.PI * 49;
  const inner = 2 * Math.PI * 39;
  let o = 0;
  let n = 0;
  return list.map((r) => {
    const lt = (r.target / 100) * outer;
    const ln = (r.pct / 100) * inner;
    const arc = { cls: r.cls, outer: [Math.max(lt - 3, 0.01), outer, -o], inner: [Math.max(ln - 3, 0.01), inner, -n] };
    o += lt;
    n += ln;
    return arc;
  });
}

// Stappen voor "Kopen & verkopen": van de server (echte orders) of uit de voorbeelddata.
export type Step = { id: string; kind: 'order' | 'todo'; side?: 'kopen' | 'verkopen'; cls: Category; title: string; sub: string; amount: number; posId?: string; tk?: string; name?: string; broker?: string };
export type ServerOrder = { posId: string; tk: string; name: string; side: 'kopen' | 'verkopen'; amount: number; broker: string; brokerName: string };
export type ServerManual = { cls: Category; amount: number; text: string };

export function stepsFromServer(p: { orders: ServerOrder[]; manual: ServerManual[] }, positions: Position[], money: (v: number) => string): Step[] {
  const cat = (posId: string) => positions.find((x) => x.id === posId)?.cat ?? 'eq';
  const orders: Step[] = p.orders.map((o, i) => ({
    id: `o${i}-${o.posId}`, kind: 'order', side: o.side, cls: cat(o.posId), amount: o.amount, posId: o.posId, tk: o.tk, name: o.name, broker: o.broker,
    title: `${o.side === 'kopen' ? 'Koop' : 'Verkoop'} ${money(o.amount)} ${o.tk}`,
    sub: `${o.brokerName} · markt`,
  }));
  const manual: Step[] = p.manual.map((m, i) => ({
    id: `m${i}-${m.cls}`, kind: 'todo', cls: m.cls, amount: m.amount, title: m.text,
    sub: m.cls === 'cash' ? 'Zelf doen · via je bank-app' : m.cls === 'gold' ? 'Zelf doen · daarna de waarde bijwerken' : 'Zelf doen',
  }));
  return [...orders.filter((s) => s.side === 'verkopen'), ...manual, ...orders.filter((s) => s.side === 'kopen')];
}

/** Voorbeeld: per klasse één stap, zodat je ziet hoe het werkt zonder server. */
export function sampleSteps(list: ClassRow[], money: (v: number) => string): Step[] {
  const sell: Step[] = [];
  const todo: Step[] = [];
  const buy: Step[] = [];
  const pick = { eq: ['VWCE', 'Trading 212'], cr: ['BTC', 'OKX'] } as const;
  for (const r of list) {
    if (r.within || Math.abs(r.diff) < 10) continue;
    const v = Math.abs(r.diff);
    if (r.cls === 'eq' || r.cls === 'cr') {
      const [tk, via] = pick[r.cls];
      const side = r.diff > 0 ? 'kopen' : 'verkopen';
      (side === 'kopen' ? buy : sell).push({ id: `s-${r.cls}`, kind: 'order', side, cls: r.cls, amount: v, tk, title: `${side === 'kopen' ? 'Koop' : 'Verkoop'} ${money(v)} ${tk}`, sub: `${via} · markt` });
    } else if (r.cls === 'cash') {
      todo.push({ id: 's-cash', kind: 'todo', cls: 'cash', amount: v, title: r.diff > 0 ? `Zet ${money(v)} op je spaarrekening` : `Boek ${money(v)} over naar Trading 212`, sub: 'Zelf doen · via je bank-app' });
    } else {
      todo.push({ id: 's-gold', kind: 'todo', cls: 'gold', amount: v, title: `Goud ${r.diff > 0 ? 'erbij' : 'eraf'}: ${money(v)}`, sub: 'Zelf doen · daarna de waarde bijwerken' });
    }
  }
  return [...sell, ...todo, ...buy];
}
