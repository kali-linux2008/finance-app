// FIRE-projectie: elke maand rendement erbij plus de maandinleg, tot het doel is bereikt.
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** Aantal maanden tot `target` (max. 60 jaar), vanaf oktober 2026. */
export function monthsToTarget(start: number, monthly: number, yearlyPct: number, target: number): number {
  let v = start;
  let m = 0;
  while (v < target && m < 720) {
    v = v * (1 + yearlyPct / 1200) + monthly;
    m++;
  }
  return m;
}

/** "mrt 2049": de maand waarin het doel wordt bereikt (oktober 2026 + m maanden). */
export function reachLabel(months: number): string {
  if (months >= 720) return 'Niet binnen 60 jaar';
  const d = new Date(2026, 9 + months, 1);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
