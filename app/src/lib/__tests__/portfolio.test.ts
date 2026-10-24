import { POSITIONS, TOTAL } from '../../data/sample';
import { monthsToTarget, reachLabel } from '../goals';
import { groupByCategory, groupBySource, investedAndCost, monthlyInvesting, rebalanceDeviations, sumCategory } from '../portfolio';
import { positionStats } from '../position';

describe('portefeuille', () => {
  it('telt categorieën op tot het totaal', () => {
    expect(sumCategory(POSITIONS, 'eq')).toBe(31640);
    expect(sumCategory(POSITIONS, 'cr')).toBe(15990);
    const all = (['eq', 'cr', 'cash', 'gold'] as const).reduce((a, c) => a + sumCategory(POSITIONS, c), 0);
    expect(all).toBe(Math.round(TOTAL));
  });
  it('groepeert per categorie met filter', () => {
    expect(groupByCategory(POSITIONS, 'Alles').map((g) => g.name)).toEqual(["Aandelen & ETF's", 'Crypto', 'Cash', 'Goud']);
    const etf = groupByCategory(POSITIONS, 'ETF');
    expect(etf).toHaveLength(1);
    expect(etf[0].rows.map((r) => r.position.tk)).toEqual(['VWCE', 'SXR8']);
  });
  it('splitst Bitcoin per bron in OKX en Trezor', () => {
    const groups = groupBySource(POSITIONS, 'Crypto');
    expect(groups.map((g) => [g.name, g.total])).toEqual([['Trezor Safe 5', 9870], ['OKX', 3461 + 2034 + 625]]);
    expect(groups[0].rows[0].override?.sub).toBe('0,1075 BTC · cold storage');
  });
  it('rekent ongerealiseerd resultaat', () => {
    const { invested, cost } = investedAndCost(POSITIONS);
    expect(invested - cost).toBe(POSITIONS.filter((p) => p.cost).reduce((a, p) => a + p.value - (p.cost ?? 0), 0));
  });
  it('telt alleen actieve plannen mee', () => {
    expect(monthlyInvesting()).toBe(390);
  });
  it('ziet één afwijking van meer dan 5 procentpunt', () => {
    expect(rebalanceDeviations(POSITIONS, TOTAL)).toBe(1);
    expect(rebalanceDeviations([], 0)).toBe(0);
  });
});

describe('FIRE-projectie', () => {
  it('bereikt € 500k later bij minder inleg', () => {
    const fast = monthsToTarget(TOTAL, 650, 7, 500000);
    const slow = monthsToTarget(TOTAL, 100, 7, 500000);
    expect(slow).toBeGreaterThan(fast);
    expect(reachLabel(fast)).toMatch(/^[a-z]{3} 20\d\d$/);
    expect(reachLabel(720)).toBe('Niet binnen 60 jaar');
  });
});

describe('positie-statistieken', () => {
  const money = (v: number) => `€ ${v}`;
  const show = (s: string) => s;
  it('heeft altijd een even aantal vakken', () => {
    for (const p of POSITIONS) expect(positionStats(p, TOTAL, money, show, false).length % 2).toBe(0);
  });
  it('verbergt de aankoopprijs in privacymodus', () => {
    const vwce = POSITIONS.find((p) => p.id === 'vwce')!;
    const st = positionStats(vwce, TOTAL, money, () => '••••', true);
    expect(st.find((s) => s.k === 'Gem. aankoopprijs')?.v).toBe('••••');
    expect(st.find((s) => s.k === 'Rendement')?.color).toBe('pos');
  });
});
