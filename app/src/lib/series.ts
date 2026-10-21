// Voorbeeld-koersreeksen en grafiekgeometrie, één-op-één overgenomen uit het prototype
// zodat de grafieken er precies hetzelfde uitzien. Later vervangen door echte historie.
import { fmtDayMonth, fmtMonthYear, fmtTime, fmtWeekday } from './format';

export type Period = '1D' | '1W' | '1M' | '1J' | 'Alles';
export const PERIODS: Period[] = ['1D', '1W', '1M', '1J', 'Alles'];

/** Park–Miller-randomgenerator: met dezelfde seed altijd dezelfde reeks. */
export function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Willekeurige wandeling van a naar b in n punten ("Brownian bridge"). */
export function bridge(seed: number, n: number, a: number, b: number, vol: number): number[] {
  const r = rng(seed);
  const w = [0];
  for (let i = 1; i < n; i++) w.push(w[i - 1] + (r() - 0.5) * 2 * vol);
  const last = w[n - 1];
  return w.map((x, i) => {
    const t = i / (n - 1);
    return a + (b - a) * t + (x - last * t) * a;
  });
}

/** Moment van de voorbeelddata: za 18 oktober 2026, 16:30. */
export const END = new Date(2026, 9, 18, 16, 30).getTime();

type PeriodConfig = {
  n: number; step: number; label: (d: Date) => string; start: number;
  vol: number; sp: number; btc: number; word: string; seed: number;
};

export const PER: Record<Period, PeriodConfig> = {
  '1D': { n: 49, step: 6e5, label: fmtTime, start: 64418, vol: 0.0011, sp: 0.003, btc: -0.006, word: 'vandaag', seed: 3 },
  '1W': { n: 29, step: 216e5, label: fmtWeekday, start: 63650, vol: 0.003, sp: 0.011, btc: 0.032, word: 'deze week', seed: 5 },
  '1M': { n: 31, step: 864e5, label: fmtDayMonth, start: 62210, vol: 0.006, sp: 0.024, btc: -0.041, word: 'deze maand', seed: 9 },
  '1J': { n: 53, step: 6048e5, label: fmtDayMonth, start: 47900, vol: 0.012, sp: 0.148, btc: 0.38, word: 'afgelopen jaar', seed: 21 },
  Alles: { n: 70, step: 263e7, label: fmtMonthYear, start: 18000, vol: 0.035, sp: 0.92, btc: 2.1, word: 'sinds jan 2021', seed: 11 },
};

export type Series = { pf: number[]; sp: number[]; bt: number[]; labels: string[] };
const cache: Partial<Record<Period, Series>> = {};

/** Portefeuille, S&P 500 en Bitcoin voor een periode (portefeuille eindigt op € 64.830). */
export function portfolioSeries(p: Period): Series {
  const hit = cache[p];
  if (hit) return hit;
  const c = PER[p];
  const labels: string[] = [];
  for (let i = 0; i < c.n; i++) labels.push(c.label(new Date(END - (c.n - 1 - i) * c.step)));
  return (cache[p] = {
    pf: bridge(c.seed, c.n, c.start, 64830, c.vol),
    sp: bridge(c.seed + 40, c.n, c.start, c.start * (1 + c.sp), c.vol * 0.8),
    bt: bridge(c.seed + 90, c.n, c.start, c.start * (1 + c.btc), c.vol * 2.4),
    labels,
  });
}

export const CHART_W = 364;
export const CHART_H = 120;

export type ChartLine = { arr: number[]; show: boolean };
export type ChartGeom = {
  paths: string[]; area: string; index: number | null;
  /** Positie van de scrub-punt en het eindpunt, in procenten van breedte/hoogte. */
  sx: number; sy: number; ey: number;
  axis: string[];
};

/**
 * Rekent SVG-paden uit voor een vlak van w×h pixels (standaard 364×120, zoals het prototype).
 * De schaal volgt alleen de zichtbare lijnen.
 * `frac` is de scrub-positie (0–1) of null.
 */
export function chartGeometry(
  lines: ChartLine[], frac: number | null, labels: string[], w = CHART_W, h = CHART_H,
): ChartGeom {
  const visible = lines.filter((l) => l.show).flatMap((l) => l.arr);
  let mn = Math.min(...visible);
  let mx = Math.max(...visible);
  const pad = (mx - mn) * 0.08 || 1;
  mn -= pad;
  mx += pad;
  const n = lines[0].arr.length;
  const y = (v: number) => h - ((v - mn) / (mx - mn)) * h;
  const path = (a: number[]) =>
    a.map((v, i) => (i ? 'L' : 'M') + ((i / (n - 1)) * w).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  const paths = lines.map((l) => (l.show ? path(l.arr) : ''));
  const index = frac == null ? null : Math.round(frac * (n - 1));
  const axis = [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1].map((k) => labels[k]);
  return {
    paths,
    area: `${paths[0]} L${w} ${h} L0 ${h} Z`,
    index,
    sx: index == null ? 0 : (index / (n - 1)) * 100,
    sy: index == null ? 0 : (y(lines[0].arr[index]) / h) * 100,
    ey: (y(lines[0].arr[n - 1]) / h) * 100,
    axis,
  };
}

/** Koersreeks voor één belegging (detailscherm). `ret` is het rendement in % over de periode. */
export function positionSeries(id: string, price: number, ret: number, p: Period, crypto: boolean): number[] {
  const k = PERIODS.indexOf(p);
  const seed = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + k * 31;
  const c = PER[p];
  return bridge(seed, c.n, price / (1 + ret / 100), price, c.vol * (crypto ? 2.2 : 1.5));
}

/** Minigrafiek voor de volglijst: 30 punten, met 1/12 marge boven en onder. */
export function sparkPath(tk: string, price: number, chg: number, w = CHART_W, h = CHART_H): string {
  const arr = bridge(tk.charCodeAt(0) * 31 + tk.length * 7, 30, price / (1 + chg / 100), price, 0.012);
  const mn = Math.min(...arr);
  const mx = Math.max(...arr);
  const yy = (v: number) => ((110 - ((v - mn) / (mx - mn || 1)) * 100) / 120) * h;
  return arr.map((v, j) => (j ? 'L' : 'M') + ((j / 29) * w).toFixed(1) + ' ' + yy(v).toFixed(1)).join(' ');
}
