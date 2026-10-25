// Cijfers voor de widgets op je startscherm. Puur rekenwerk, zodat het te testen is.
import { GOALS, type Position } from '../data/sample';
import { EURO, MINUS, num, pct as fmtPct } from '../lib/format';
import { monthsToTarget } from '../lib/goals';

export type WidgetData = {
  total: number;
  /** Verandering vandaag in euro, of null als de bron dat niet weet. */
  delta: number | null;
  at: number;
  /** Koersverloop van vandaag (max. 40 punten). */
  spark: number[];
  movers: { tk: string; pct: number }[];
};

export type WidgetView = {
  total: string;
  deltaLine: string;
  pctText: string;
  up: boolean;
  time: string;
  spark: number[];
  movers: { tk: string; pct: string; up: boolean }[];
  fire: { pct: number; label: string };
};

const HIDDEN = `${EURO}••••`;

/** Elke n-de waarde, zodat de widget niet te veel punten hoeft te tekenen. */
export function downsample(arr: number[], max = 40): number[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => arr[Math.round(i * step)]);
}

/** De drie grootste bewegers van vandaag (alleen posities met een koers). */
export function topMovers(positions: Pick<Position, 'tk' | 'dayChange' | 'price'>[], n = 3): { tk: string; pct: number }[] {
  const seen = new Set<string>();
  return positions
    .filter((p) => p.price && typeof p.dayChange === 'number')
    .sort((a, b) => Math.abs(b.dayChange!) - Math.abs(a.dayChange!))
    .filter((p) => (seen.has(p.tk) ? false : (seen.add(p.tk), true)))
    .slice(0, n)
    .map((p) => ({ tk: p.tk, pct: p.dayChange! }));
}

const two = (n: number) => String(n).padStart(2, '0');

export function view(d: WidgetData, privacy: boolean): WidgetView {
  const start = d.delta == null ? null : d.total - d.delta;
  const pctv = d.delta != null && start ? (d.delta / start) * 100 : 0;
  const up = (d.delta ?? 0) >= 0;
  const money = (v: number) => (privacy ? HIDDEN : EURO + num(v));
  const signed = (v: number) => (privacy ? HIDDEN : `${v >= 0 ? '+' : MINUS}${EURO}${num(Math.abs(v))}`);
  const t = new Date(d.at);
  const months = monthsToTarget(d.total, GOALS.monthly, GOALS.returnPct, GOALS.fire);
  const year = new Date(2026, 9 + months, 1).getFullYear();
  const firePct = Math.min(100, Math.max(0, (d.total / GOALS.fire) * 100));
  return {
    total: money(d.total),
    deltaLine: d.delta == null ? 'vandaag onbekend' : `${signed(d.delta)} · ${fmtPct(pctv)} vandaag`,
    pctText: d.delta == null ? '—' : fmtPct(pctv),
    up,
    time: `${two(t.getHours())}:${two(t.getMinutes())}`,
    spark: d.spark,
    movers: d.movers.map((m) => ({ tk: m.tk, pct: fmtPct(m.pct), up: m.pct >= 0 })),
    fire: {
      pct: firePct,
      label: `${money(d.total)} van ${EURO}${num(GOALS.fire / 1000)}k${months < 720 ? ` · ${year}` : ''}`,
    },
  };
}

/** SVG voor een sparkline (wit, zoals in het ontwerp). */
export function sparkSvg(arr: number[], w: number, h: number, stroke = '#FFFFFF'): string {
  const pts = arr.length > 1 ? arr : [0, 0];
  const mn = Math.min(...pts);
  const mx = Math.max(...pts);
  const y = (v: number) => (h - 2 - ((v - mn) / (mx - mn || 1)) * (h - 4)).toFixed(1);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * w).toFixed(1)} ${y(v)}`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

/** SVG voor de voortgangsring van het FIRE-doel. */
export function ringSvg(pctv: number, size: number): string {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const len = (Math.max(pctv, 0.5) / 100) * c;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="5"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#D9BC82" stroke-width="5" stroke-linecap="round" stroke-dasharray="${len.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}
