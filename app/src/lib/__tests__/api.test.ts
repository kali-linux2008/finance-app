import { normalizeUrl } from '../api';
import { allocation, groupBySource } from '../portfolio';
import type { Position } from '../../data/sample';

describe('serveradres', () => {
  it('maakt van een kaal adres een geldige URL', () => {
    expect(normalizeUrl(' 192.168.1.20:8000/ ')).toBe('http://192.168.1.20:8000');
    expect(normalizeUrl('https://meridian.tail1234.ts.net')).toBe('https://meridian.tail1234.ts.net');
  });
});

describe('echte data van de server', () => {
  const live: Position[] = [
    { id: 't212-VWCEd_EQ', tk: 'VWCE', name: 'Vanguard FTSE All-World', cls: 'ETF', cat: 'eq', src: 'Trading 212', value: 1000, tile: 1, cost: 900 },
    { id: 'btc', tk: 'BTC', name: 'Bitcoin', cls: 'Crypto', cat: 'cr', src: 'Trezor Safe 5 · OKX', value: 500, tile: 2,
      wallets: [
        { name: 'Trezor Safe 5', qty: '0,0040 BTC', value: 400, icon: 'lock', note: 'Cold storage' },
        { name: 'OKX', qty: '0,0010 BTC', value: 100, icon: 'currency_exchange', note: 'Exchange' },
      ] },
    { id: 'bank-0', tk: 'RABO', name: 'Rabobank Betaalrekening', cls: 'Cash', cat: 'cash', src: 'Rabobank', value: 300, tile: 4, manual: true },
    { id: 'bank-1', tk: 'RABO', name: 'Rabobank Spaarrekening', cls: 'Cash', cat: 'cash', src: 'Rabobank', value: 2000, tile: 3, manual: true },
  ];

  it('verdeelt over klassen met spaar- en betaalgeld apart', () => {
    const a = allocation(live);
    expect(a).toMatchObject({ eq: 1000, cr: 500, savings: 2000, payment: 300, gold: 0 });
    expect(a.crSources).toEqual(['Trezor Safe 5', 'OKX']);
    expect(a.eqSources).toEqual(['Trading 212']);
  });

  it('splitst BTC per bewaarplek in de weergave per bron', () => {
    const g = groupBySource(live, 'Alles');
    expect(g.map((x) => [x.name, x.total])).toEqual([['Trading 212', 1000], ['Trezor Safe 5', 400], ['OKX', 100], ['Rabobank', 2300]]);
  });
});
