// Rekenwerk voor koersalerts en de volglijst (los van de schermen, zodat het te testen is).
import type { Position } from '../data/sample';
import type { PriceAlert, WatchItem } from './api';
import { currencyPrefix, MINUS, num } from './format';

export type Direction = 'boven' | 'onder';
export const QUICK = [2, 5, 10, 20];
export const STEP = 0.5;

/** Key van een positie: crypto via OKX (`okx:BTC`), aandelen met hun positie-id. */
export function keyFor(p: Pick<Position, 'id' | 'tk' | 'cat'>): string {
  return p.cat === 'cr' ? `okx:${p.tk}` : p.id;
}

/** Koers met genoeg cijfers: € 1.650,00 / € 2,1834 / $ 0,00001234 */
export function price(v: number, cur = 'EUR'): string {
  const decimals = v >= 1000 ? 0 : v >= 10 ? 2 : v >= 0.01 ? 4 : 8;
  return currencyPrefix(cur) + num(v, Math.min(decimals, 2), decimals);
}

export const clampPct = (p: number) => Math.min(50, Math.max(STEP, Math.round(p / STEP) * STEP));

export function target(now: number, dir: Direction, pctv: number): number {
  return now * (1 + (dir === 'boven' ? 1 : -1) * pctv / 100);
}

/** "+5% t.o.v. de huidige koers" */
export function pctLabel(dir: Direction, pctv: number): string {
  return `${dir === 'boven' ? '+' : MINUS}${num(pctv, 0, 1)}% t.o.v. de huidige koers`;
}

/** Hoe ver is de koers nog van de alert, in %. */
export function distance(a: Pick<PriceAlert, 'price'>, now: number): number {
  return (Math.abs(a.price - now) / now) * 100;
}

/** "boven € 1.600 · nog 6,7%" en de breedte van het gouden balkje (dichterbij = voller). */
export function alertProgress(a: Pick<PriceAlert, 'dir' | 'price' | 'cur'>, now: number): { label: string; width: number } {
  const d = distance(a, now);
  return { label: `${a.dir} ${price(a.price, a.cur)} · nog ${num(d, 1, 1)}%`, width: Math.max(10, 100 - d * 9) };
}

/** "Eenmalig · ingesteld 2 okt" */
export function alertSub(a: Pick<PriceAlert, 'repeat' | 'created' | 'armed'>, dayMonth: (d: Date) => string): string {
  const kind = a.repeat ? (a.armed === false ? 'Elke keer · wacht tot de koers terug is' : 'Elke keer') : 'Eenmalig';
  return `${kind} · ingesteld ${dayMonth(new Date(a.created * 1000))}`;
}

/** Gemiddelde dagverandering en aantal stijgers/dalers. */
export function summary(items: Pick<WatchItem, 'chg'>[]): { avg: number; ups: number; downs: number } {
  const known = items.map((i) => i.chg).filter((c): c is number => typeof c === 'number');
  const avg = known.length ? known.reduce((s, c) => s + c, 0) / known.length : 0;
  const ups = known.filter((c) => c >= 0).length;
  return { avg, ups, downs: known.length - ups };
}

/** Volglijst gesorteerd op dagverandering (onbekend achteraan). */
export function sortByChange<T extends Pick<WatchItem, 'chg'>>(items: T[]): T[] {
  return items.slice().sort((a, b) => (b.chg ?? -Infinity) - (a.chg ?? -Infinity));
}

/** SVG-pad voor een sparkline in een viewBox van w×h. */
export function sparkPath(arr: number[], w = 364, h = 120, pad = 10): string {
  if (arr.length < 2) return '';
  const mn = Math.min(...arr);
  const mx = Math.max(...arr);
  const y = (v: number) => h - pad - ((v - mn) / (mx - mn || 1)) * (h - 2 * pad);
  return arr.map((v, i) => `${i ? 'L' : 'M'}${((i / (arr.length - 1)) * w).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
}
