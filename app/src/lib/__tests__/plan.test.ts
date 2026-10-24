import { amountText, parseEuro, planError, planTotal, samplePlan } from '../plan';

describe('periodiek inleggen', () => {
  it('leest bedragen zoals een Nederlander ze typt', () => {
    expect(parseEuro('37,50')).toBe(37.5);
    expect(parseEuro('31.25')).toBe(31.25);
    expect(parseEuro('€ 1.000')).toBe(1000);
    expect(parseEuro('')).toBeNaN();
    expect(amountText(37.5)).toBe('37,50');
    expect(amountText(250)).toBe('250');
  });

  it('telt op en controleert het maandmaximum', () => {
    const lines = [250, 37.5, 31.25, 31.25, 25].map((amount, i) => ({ posId: String(i), amount }));
    expect(planTotal(lines)).toBe(375);
    expect(planError(lines, 400)).toBe('');
    expect(planError(lines, 300)).toBe('Hoger dan je maandmaximum van € 300');
    expect(planError([{ posId: 'a', amount: 0.5 }], 400)).toBe('Elk bedrag moet minimaal € 1 zijn');
  });

  it('voorbeeldplan uit het prototype', () => {
    expect(samplePlan().total).toBe(390);
  });
});
