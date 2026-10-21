// Getallen en datums in nl-NL-stijl, zonder afhankelijk te zijn van Intl op het toestel.
// Minteken is altijd U+2212 (−), zoals in het ontwerp.

export const MINUS = '−';
/** Euroteken met vaste spatie, zodat € en bedrag nooit over twee regels breken. */
export const EURO = '€\u00A0';

function group(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Getal met duizendtallen (.) en decimalen (,). Overbodige nullen voorbij minFrac vallen weg. */
export function num(v: number, minFrac = 0, maxFrac = minFrac): string {
  const fixed = Math.abs(v).toFixed(maxFrac);
  let [int, frac = ''] = fixed.split('.');
  while (frac.length > minFrac && frac.endsWith('0')) frac = frac.slice(0, -1);
  const sign = v < 0 && Number(fixed) !== 0 ? MINUS : '';
  return sign + group(int) + (frac ? ',' + frac : '');
}

/** € 64.831 of € 64.830,42 */
export function eur(v: number, decimals = false): string {
  return (v < 0 ? MINUS : '') + EURO + num(Math.abs(v), decimals ? 2 : 0);
}

/** +€ 412,18 / −€ 190 */
export function signedEur(v: number, decimals = false): string {
  return (v >= 0 ? '+' : MINUS) + EURO + num(Math.abs(v), decimals ? 2 : 0);
}

/** +0,64% / −4,6% */
export function pct(v: number, decimals = 2): string {
  return (v >= 0 ? '+' : MINUS) + Math.abs(v).toFixed(decimals).replace('.', ',') + '%';
}

/** 48,8% (zonder teken, één decimaal) */
export function share(v: number): string {
  return v.toFixed(1).replace('.', ',') + '%';
}

/** Hoeveelheid met max. 4 decimalen: 0,1452 / 142,3 */
export function qty(v: number): string {
  return num(v, 0, 4);
}

export function currencyPrefix(cur: string): string {
  return cur === 'USD' ? '$\u00A0' : cur === 'DKK' ? 'DKK\u00A0' : EURO;
}

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const DAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const pad = (n: number) => String(n).padStart(2, '0');

/** 16:30 */
export const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** zo 18 okt */
export const fmtWeekday = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
/** 18 okt */
export const fmtDayMonth = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
/** okt 2026 */
export const fmtMonthYear = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

/** Splitst een bedrag voor de hero: ['€ 64.830', ',42'] */
export function splitCents(v: number): [string, string] {
  const [whole, cents] = num(v, 2).split(',');
  return [EURO + whole, ',' + cents];
}
