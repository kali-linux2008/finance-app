import { POSITIONS } from '../../data/sample';
import { estimate, pressAmount, requestId, sampleCandles, sampleQuote, stepLimit, tradeVia, type Quote } from '../trade';

const btc = POSITIONS.find((p) => p.id === 'btc')!;
const vwce = POSITIONS.find((p) => p.id === 'vwce')!;
const aapl = POSITIONS.find((p) => p.id === 'aapl')!;

const live = (q: Partial<Quote> = {}): Quote => ({
  ...sampleQuote(vwce), sample: undefined, dayMax: 250, usedToday: 0, cash: 500, sellMax: 1000, ...q,
});

describe('keypad', () => {
  it('werkt als het prototype: komma, max. 2 decimalen, max. 7 cijfers', () => {
    const type = (keys: string[], start = '') => keys.reduce(pressAmount, start);
    expect(type(['1', '2', ',', '5', '0', '9'])).toBe('12,50');
    expect(type([','])).toBe('0,');
    expect(type(['5'], '0')).toBe('5');
    expect(type(['1', '2', '3', '4', '5', '6', '7', '8'])).toBe('1234567');
    expect(type(['⌫'], '200')).toBe('20');
  });
});

describe('estimate', () => {
  it('rekent aantal, kosten en totaal uit (OKX 0,10%)', () => {
    const e = estimate(sampleQuote(btc), 'kopen', 200, 'markt', 0);
    expect(e.qty).toBeCloseTo(200 / (13331 / 0.1452), 8);
    expect(e.fee).toBeCloseTo(0.2);
    expect(e.total).toBeCloseTo(200.2);
    expect(e.error).toBe('');
  });

  it('valutakosten bij een Amerikaans aandeel', () => {
    const e = estimate(sampleQuote(aapl), 'verkopen', 100, 'markt', 0);
    expect(e.fee).toBeCloseTo(0.15);
    expect(e.total).toBeCloseTo(99.85);
  });

  it('BTC verkopen: alleen het OKX-deel', () => {
    expect(estimate(sampleQuote(btc), 'verkopen', 4000, 'markt', 0).error).toBe('Max € 3.461,00 op OKX · Trezor is alleen-lezen');
  });

  it('limiet verandert koers en aantal', () => {
    const e = estimate(sampleQuote(vwce), 'kopen', 100, 'limiet', -2);
    expect(e.limitPrice).toBeCloseTo(128.04 * 0.98);
    expect(e.qty).toBeCloseTo(100 / ((18220 / 142.3) * 0.98));
  });

  it('meldt minimum, vrij saldo, geen bezit en dagmaximum', () => {
    expect(estimate(live(), 'kopen', 0, 'markt', 0).error).toBe('Voer een bedrag in');
    expect(estimate(live(), 'kopen', 0.5, 'markt', 0).error).toBe('Minimaal € 1');
    expect(estimate(live({ cash: 50 }), 'kopen', 60, 'markt', 0).error).toBe('Vrij saldo € 50,00');
    expect(estimate(live({ sellMax: 0 }), 'verkopen', 10, 'markt', 0).error).toBe('Je hebt geen VWCE op Trading 212');
    expect(estimate(live({ usedToday: 200 }), 'kopen', 100, 'markt', 0).error).toBe('Dagmaximum: nog € 50,00 vandaag');
    expect(estimate(live(), 'kopen', 100, 'markt', 0).error).toBe('');
    expect(estimate(live({ demo: false, limitAllowed: false }), 'kopen', 10, 'limiet', -1).error).toBe('Met echt geld kan Trading 212 alleen marktorders');
  });
});

describe('overig', () => {
  it('limiet in stappen van 0,5% en hooguit 20%', () => {
    expect(stepLimit(0, 1)).toBe(0.5);
    expect(stepLimit(-0.5, 1)).toBe(0);
    expect(stepLimit(20, 1)).toBe(20);
  });

  it('welke posities je kunt verhandelen', () => {
    const t212 = { ...vwce, id: 't212-VWCEd_EQ', trade: undefined };
    expect(tradeVia(t212, true)).toBe('Trading 212');
    expect(tradeVia({ ...btc, trade: undefined }, true)).toBe('OKX');
    expect(tradeVia(POSITIONS.find((p) => p.cat === 'cash')!, true)).toBeNull();
    expect(tradeVia(vwce, false)).toBe('Trading 212');
  });

  it('40 candles, request-ids verschillen', () => {
    expect(sampleCandles(btc)).toHaveLength(40);
    expect(requestId(1, 0.1)).not.toBe(requestId(1, 0.2));
  });
});
