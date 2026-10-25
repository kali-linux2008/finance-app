import { alertProgress, alertSub, clampPct, keyFor, pctLabel, price, sortByChange, sparkPath, summary, target } from '../watch';

describe('koersalerts', () => {
  it('maakt de juiste key', () => {
    expect(keyFor({ id: 'btc', tk: 'BTC', cat: 'cr' })).toBe('okx:BTC');
    expect(keyFor({ id: 't212-RHMd_EQ', tk: 'RHM', cat: 'eq' })).toBe('t212-RHMd_EQ');
  });

  it('rekent de doelkoers uit', () => {
    expect(target(100, 'boven', 5)).toBeCloseTo(105);
    expect(target(100, 'onder', 10)).toBeCloseTo(90);
    expect(clampPct(0)).toBe(0.5);
    expect(clampPct(70)).toBe(50);
    expect(clampPct(5.24)).toBe(5);
    expect(pctLabel('onder', 2.5)).toBe('−2,5% t.o.v. de huidige koers');
  });

  it('toont koersen met genoeg cijfers', () => {
    expect(price(1650)).toBe('€ 1.650');
    expect(price(620.5, 'USD')).toBe('$ 620,50');
    expect(price(2.18345)).toBe('€ 2,1835');
    expect(price(0.00001234)).toBe('€ 0,00001234');
  });

  it('laat zien hoe ver de alert nog is', () => {
    const p = alertProgress({ dir: 'boven', price: 1600, cur: 'EUR' }, 1500);
    expect(p.label).toBe('boven € 1.600 · nog 6,7%');
    expect(p.width).toBeCloseTo(40);
    expect(alertProgress({ dir: 'onder', price: 50, cur: 'EUR' }, 100).width).toBe(10);
    const dm = () => '2 okt';
    expect(alertSub({ repeat: false, created: 0 }, dm)).toBe('Eenmalig · ingesteld 2 okt');
    expect(alertSub({ repeat: true, created: 0, armed: false }, dm)).toBe('Elke keer · wacht tot de koers terug is · ingesteld 2 okt');
  });
});

describe('volglijst', () => {
  it('vat de dag samen en sorteert', () => {
    expect(summary([{ chg: 2 }, { chg: -1 }, { chg: null }, { chg: 0 }])).toEqual({ avg: 1 / 3, ups: 2, downs: 1 });
    expect(summary([])).toEqual({ avg: 0, ups: 0, downs: 0 });
    expect(sortByChange([{ chg: null }, { chg: -1 }, { chg: 3 }]).map((i) => i.chg)).toEqual([3, -1, null]);
  });

  it('tekent een sparkline', () => {
    expect(sparkPath([1])).toBe('');
    expect(sparkPath([1, 2], 100, 100, 0)).toBe('M0.0 100.0 L100.0 0.0');
    expect(sparkPath([5, 5], 100, 100, 0)).toBe('M0.0 100.0 L100.0 100.0');
  });
});
