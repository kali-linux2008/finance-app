import { POSITIONS, TARGETS } from '../../data/sample';
import { eur } from '../format';
import { bump, buyOnly, current, dial, extraNeeded, rows, sampleSteps, shift, stepsFromServer, targetSum, verb } from '../rebalance';

const now = { eq: 6000, cr: 3000, cash: 1000, gold: 0 };
const target = { eq: 60, cr: 20, cash: 15, gold: 5 };

describe('herbalanceren', () => {
  it('rekent per klasse het verschil met het doel uit', () => {
    const r = rows(now, target);
    expect(r.map((x) => Math.round(x.diff))).toEqual([0, -1000, 500, 500]);
    expect(r[0].within).toBe(true);
    expect(verb(r[1])).toBe('verkopen');
    expect(verb(r[2])).toBe('aanvullen');
    expect(verb(r[3])).toBe('bijkopen');
    expect(shift(r)).toBe(1000);
  });

  it('doelen gaan in stappen van 5 en blijven tussen 0 en 100', () => {
    expect(bump(target, 'gold', -5).gold).toBe(0);
    expect(bump(target, 'gold', -5 * 3).gold).toBe(0);
    expect(bump(target, 'eq', 50).eq).toBe(100);
    expect(targetSum(target)).toBe(100);
  });

  it('alleen bijkopen: eerst wat achterloopt, net als de server', () => {
    const r = rows(now, target);
    expect(buyOnly(r, 500)).toEqual([{ cls: 'cash', name: 'Cash', amount: 250 }, { cls: 'gold', name: 'Goud', amount: 250 }]);
    const all = buyOnly(r, 2000);
    expect(all.reduce((a, x) => a + x.amount, 0)).toBeCloseTo(2000);
    expect(extraNeeded(r)).toBe(5000); // crypto 3000 = 20% bij een totaal van 15.000
    expect(buyOnly(r, 0)).toEqual([]);
  });

  it('ring: bogen sluiten op elkaar aan', () => {
    const d = dial(rows(now, target));
    expect(d).toHaveLength(4);
    expect(d[1].outer[2]).toBeCloseTo(-(0.6 * 2 * Math.PI * 49));
  });

  it('stappen: eerst verkopen, dan zelf doen, dan kopen', () => {
    const steps = stepsFromServer({
      orders: [
        { posId: 'vwce', tk: 'VWCE', name: 'Vanguard', side: 'kopen', amount: 500, broker: 't212', brokerName: 'Trading 212' },
        { posId: 'btc', tk: 'BTC', name: 'Bitcoin', side: 'verkopen', amount: 300, broker: 'okx', brokerName: 'OKX' },
      ],
      manual: [{ cls: 'cash', amount: 200, text: 'Geld erbij: € 200' }],
    }, POSITIONS, eur);
    expect(steps.map((s) => s.title)).toEqual([`Verkoop ${eur(300)} BTC`, 'Geld erbij: € 200', `Koop ${eur(500)} VWCE`]);
    expect(steps[0].cls).toBe('cr');
    const sample = sampleSteps(rows(current(POSITIONS), TARGETS), eur);
    expect(sample.length).toBeGreaterThan(0);
  });
});
