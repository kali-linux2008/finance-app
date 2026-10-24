import { newSince } from '../alerts';

const ev = (id: number) => ({ id, at: 0, title: 't', body: 'b', kind: 'info' as const });

describe('meldingen', () => {
  it('toont alleen nieuwe meldingen, en de eerste keer niets (geen stortvloed oude)', () => {
    expect(newSince([ev(1), ev(2)], null)).toEqual([]);
    expect(newSince([ev(3), ev(4)], 3).map((e) => e.id)).toEqual([4]);
  });
});
