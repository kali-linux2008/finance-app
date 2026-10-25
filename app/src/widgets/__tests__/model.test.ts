import { downsample, ringSvg, sparkSvg, topMovers, view } from '../model';

const data = { total: 64830, delta: 412, at: new Date(2026, 9, 25, 9, 30).getTime(), spark: [1, 2, 3], movers: [{ tk: 'NOVO', pct: -1.12 }] };

describe('widgets', () => {
  it('toont totaal, dagverandering en tijd', () => {
    const v = view(data, false);
    expect(v.total).toBe('€ 64.830');
    expect(v.deltaLine).toBe('+€ 412 · +0,64% vandaag');
    expect(v.pctText).toBe('+0,64%');
    expect(v.time).toBe('09:30');
    expect(v.movers).toEqual([{ tk: 'NOVO', pct: '−1,12%', up: false }]);
    expect(v.fire.pct).toBeCloseTo(12.97, 1);
    expect(v.fire.label).toMatch(/^€ 64\.830 van € 500k · 20\d\d$/);
  });

  it('verbergt bedragen in privacymodus, procenten blijven', () => {
    const v = view(data, true);
    expect(v.total).toBe('€ ••••');
    expect(v.deltaLine).toBe('€ •••• · +0,64% vandaag');
    expect(v.fire.label.startsWith('€ •••• van')).toBe(true);
  });

  it('kan zonder dagverandering', () => {
    expect(view({ ...data, delta: null }, false).pctText).toBe('—');
  });

  it('kiest de grootste bewegers', () => {
    const pos = [
      { tk: 'VWCE', price: 1, dayChange: 0.4 }, { tk: 'BTC', price: 1, dayChange: 1.84 },
      { tk: 'BTC', price: 1, dayChange: 1.84 }, { tk: 'ING', dayChange: 9 }, { tk: 'RHM', price: 1, dayChange: -2.3 },
      { tk: 'LMT', price: 1 },
    ];
    expect(topMovers(pos)).toEqual([{ tk: 'RHM', pct: -2.3 }, { tk: 'BTC', pct: 1.84 }, { tk: 'VWCE', pct: 0.4 }]);
  });

  it('dunt lange reeksen uit en tekent SVG', () => {
    const arr = Array.from({ length: 288 }, (_, i) => i);
    const d = downsample(arr, 40);
    expect(d).toHaveLength(40);
    expect(d[0]).toBe(0);
    expect(d[39]).toBe(287);
    expect(sparkSvg([1, 2], 100, 20)).toContain('M0.0 18.0 L100.0 2.0');
    expect(ringSvg(50, 72)).toContain('stroke-dasharray');
  });
});
