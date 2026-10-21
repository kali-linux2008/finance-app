// Kerncijfers voor het detailscherm van een positie.
import { TOTAL, type Position } from '../data/sample';
import { EURO, num, pct, qty, share, signedEur } from './format';

export type Stat = { k: string; v: string; color?: 'pos' | 'neg' };

/** Kerncijfers van een positie; altijd een even aantal, zodat het raster vol is. */
export function positionStats(pos: Position, money: (v: number) => string, hide: (s: string) => string, privacy: boolean): Stat[] {
  const st: Stat[] = [];
  if (pos.qty) st.push({ k: 'Aantal', v: `${qty(pos.qty)} ${pos.unit}` });
  st.push({ k: 'Waarde', v: money(pos.value) });
  if (pos.cost && pos.qty) {
    const gain = pos.value - pos.cost;
    st.push({ k: 'Gem. aankoopprijs', v: privacy ? '••••' : EURO + num(pos.cost / pos.qty, 2) });
    st.push({ k: 'Rendement', v: hide(`${signedEur(gain)} · ${pct((gain / pos.cost) * 100, 1)}`), color: gain >= 0 ? 'pos' : 'neg' });
  }
  st.push({ k: 'Aandeel in vermogen', v: share((pos.value / TOTAL) * 100) });
  if (pos.fees) st.push({ k: 'Kosten betaald', v: pos.fees });
  if (pos.cur === 'USD') st.push({ k: 'Valuta', v: 'USD · 0,15% FX-kosten' });
  if (st.length % 2) st.push({ k: 'Bron', v: pos.src });
  return st;
}
