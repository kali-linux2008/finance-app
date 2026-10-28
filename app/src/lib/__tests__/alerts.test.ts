import { newSince } from '../alerts';

const ev = (id: number) => ({ id, at: 0, title: 't', body: 'b', kind: 'info' as const });

describe('meldingen', () => {
  it('toont alleen nieuwe meldingen, en de eerste keer niets (geen stortvloed oude)', () => {
    expect(newSince([ev(1), ev(2)], null)).toEqual([]);
    expect(newSince([ev(3), ev(4)], 3).map((e) => e.id)).toEqual([4]);
  });
});

describe('tik op een melding', () => {
  it('opent het juiste scherm', () => {
    const { screenFor } = jest.requireActual('../alerts') as typeof import('../alerts');
    expect(screenFor({ kind: 'csv', title: 'Rabo-CSV' })).toBe('/bank');
    expect(screenFor({ kind: 'info', title: 'Koersalert · BTC' })).toBe('/volglijst');
    expect(screenFor({ kind: 'ok', title: 'Inleg gelukt' })).toBe('/periodiek');
    expect(screenFor({ kind: 'info', title: 'Nieuwe app-versie' })).toBe('/meldingen');
  });
});
