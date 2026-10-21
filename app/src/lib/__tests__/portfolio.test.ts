import { POSITIONS, TOTAL } from '../../data/sample';
import { monthsToTarget, reachLabel } from '../goals';
import { groupByCategory, groupBySource, investedAndCost, monthlyInvesting, rebalanceDeviations, sumCategory } from '../portfolio';
import { positionStats } from '../position';

describe('portefeuille', () => {
  it('telt categorieën op tot het totaal', () => {
    expect(sumCategory('eq')).toBe(31640);
    expect(sumCategory('cr')).toBe(15990);
    const all = (['eq', 'cr', 'cash', 'gold'] as const).reduce((a, c) => a + sumCategory(c), 0);
    expect(all).toBe(Math.round(TOTAL));
  });
  it('groepeert per categorie met filter', () => {
    expect(groupByCategory('Alles').map((g) => g.name)).toEqual(["Aandelen & ETF's", 'Crypto', 'Cash', 'Goud']);
    const etf = groupByCategory('ETF');
    expect(etf).toHaveLength(1);
    expect(etf[0].rows.map((r) => r.position.tk)).toEqual(['VWCE', 'SXR8']);
  });
  it('splitst Bitcoin per bron in OKX en Trezor', () => {
    const groups = groupBySource('Crypto');
    expect(groups.map((g) => [g.name, g.total])).toEqual([['OKX', 3461 + 2034 + 625], ['Trezor Safe 5', 9870]]);
  });
  it('rekent ongerealiseerd resultaat', () => {
    const { invested, cost } = investedAndCost();
    expect(invested - cost).toBe(POSITIONS.filter((p) => p.cost).reduce((a, p) => a + p.value - (p.cost ?? 0), 0));
  });
  it('telt alleen actieve plannen mee', () => {
    expect(monthlyInvesting()).toBe(390);
  });
  it('ziet één afwijking van meer dan 5 procentpunt', () => {
    expect(rebalanceDeviations()).toBe(1);
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
    for (const p of POSITIONS) expect(positionStats(p, money, show, false).length % 2).toBe(0);
  });
  it('verbergt de aankoopprijs in privacymodus', () => {
    const vwce = POSITIONS.find((p) => p.id === 'vwce')!;
    const st = positionStats(vwce, money, () => '••••', true);
    expect(st.find((s) => s.k === 'Gem. aankoopprijs')?.v).toBe('••••');
    expect(st.find((s) => s.k === 'Rendement')?.color).toBe('pos');
  });
});
