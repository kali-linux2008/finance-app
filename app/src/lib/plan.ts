// Rekenwerk voor periodiek inleggen. Puur (geen React), zodat het te testen is.
import { PLANS, POSITIONS, type Position } from '../data/sample';
import type { Plan, PlanLine, PlanState } from './api';
import { fmtTime, fmtWeekday, num } from './format';

/** "37,50" / "37.5" / "€ 1.000" → 37.5; ongeldig → NaN. */
export function parseEuro(raw: string): number {
  let s = raw.replace(/[€\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return s === '' ? NaN : Number(s);
}

/** 37.5 → "37,50"; 250 → "250". */
export const amountText = (v: number) => (Number.isInteger(v) ? String(v) : num(v, 2, 2));

export const planTotal = (lines: PlanLine[]) => Math.round(lines.reduce((a, l) => a + (Number.isFinite(l.amount) ? l.amount : 0), 0) * 100) / 100;

/** Klopt het plan? Geeft een foutmelding of '' terug. */
export function planError(lines: PlanLine[], monthMax: number): string {
  if (lines.some((l) => !Number.isFinite(l.amount) || l.amount < 1)) return 'Elk bedrag moet minimaal € 1 zijn';
  const total = planTotal(lines);
  if (total > monthMax + 0.005) return `Hoger dan je maandmaximum van € ${amountText(monthMax)}`;
  return '';
}

/** "ma 26 okt · 15:45" */
export function whenText(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return `${fmtWeekday(d)} · ${fmtTime(d)}`;
}

export const tradeableForPlan = (positions: Position[], live: boolean) =>
  positions.filter((p) => (live ? p.id.startsWith('t212-') && p.cat === 'eq' : p.trade === 'Trading 212'));

/** Voorbeelddata: de plannen uit het prototype, als één plan. */
export function samplePlan(): PlanState {
  const lines = PLANS.filter((p) => p.active).map((p) => {
    const pos = POSITIONS.find((x) => x.tk === p.tk);
    return { posId: pos?.id ?? p.tk, tk: p.tk, name: pos?.name ?? p.tk, amount: p.amount };
  });
  const plan: Plan = { active: true, day: 15, lines };
  return { plan, total: planTotal(lines), enabled: true, monthMax: 1000, nextRun: new Date(2026, 9, 15, 15, 45).getTime() / 1000, runs: [] };
}
