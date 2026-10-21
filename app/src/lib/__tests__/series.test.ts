import { bridge, chartGeometry, PER, PERIODS, portfolioSeries, rng } from '../series';

describe('voorbeeldreeksen', () => {
  it('rng is herhaalbaar', () => {
    const a = rng(7);
    const b = rng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('bridge begint en eindigt op de opgegeven waarden', () => {
    const arr = bridge(11, 70, 18000, 64830, 0.035);
    expect(arr).toHaveLength(70);
    expect(arr[0]).toBeCloseTo(18000);
    expect(arr[69]).toBeCloseTo(64830);
  });
  it('elke periode heeft net zoveel labels als punten', () => {
    for (const p of PERIODS) {
      const s = portfolioSeries(p);
      expect(s.pf).toHaveLength(PER[p].n);
      expect(s.labels).toHaveLength(PER[p].n);
      expect(s.labels[s.labels.length - 1]).toBeTruthy();
    }
    expect(portfolioSeries('1D').labels.at(-1)).toBe('16:30');
  });
});

describe('grafiekgeometrie', () => {
  const lines = [{ arr: [0, 50, 100], show: true }, { arr: [1000, 1000, 1000], show: false }];
  it('schaalt alleen op zichtbare lijnen', () => {
    const g = chartGeometry(lines, null, ['a', 'b', 'c'], 200, 100);
    expect(g.paths[1]).toBe('');
    expect(g.paths[0].startsWith('M0.0 ')).toBe(true);
    expect(g.index).toBeNull();
    expect(g.ey).toBeLessThan(10);
  });
  it('rondt de scrub-positie af op het dichtstbijzijnde punt', () => {
    const g = chartGeometry(lines, 0.6, ['a', 'b', 'c'], 200, 100);
    expect(g.index).toBe(1);
    expect(g.sx).toBe(50);
    expect(g.axis).toEqual(['a', 'b', 'b', 'c']);
  });
});
