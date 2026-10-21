import { eur, fmtDayMonth, fmtMonthYear, fmtTime, fmtWeekday, num, pct, qty, share, signedEur, splitCents } from '../format';

describe('bedragen in nl-NL-stijl', () => {
  it('zet duizendtallen en decimalen goed', () => {
    expect(num(64830.42, 2)).toBe('64.830,42');
    expect(num(1234567)).toBe('1.234.567');
    expect(eur(64830.42, true)).toBe('€\u00A064.830,42');
    expect(eur(18220)).toBe('€\u00A018.220');
  });
  it('gebruikt het echte minteken', () => {
    expect(eur(-262400)).toBe('−€\u00A0262.400');
    expect(signedEur(-190)).toBe('−€\u00A0190');
    expect(signedEur(412.18, true)).toBe('+€\u00A0412,18');
    expect(pct(-4.6, 1)).toBe('−4,6%');
    expect(pct(0.71)).toBe('+0,71%');
  });
  it('kort hoeveelheden in tot max. 4 decimalen', () => {
    expect(qty(0.1452)).toBe('0,1452');
    expect(qty(142.3)).toBe('142,3');
    expect(qty(7)).toBe('7');
  });
  it('rekent aandelen uit', () => {
    expect(share((31640 / 64830.42) * 100)).toBe('48,8%');
  });
  it('splitst de centen voor de hero', () => {
    expect(splitCents(64830.42)).toEqual(['€\u00A064.830', ',42']);
  });
});

describe('datums', () => {
  const d = new Date(2026, 9, 18, 16, 30);
  it('formatteert zoals het prototype', () => {
    expect(fmtTime(d)).toBe('16:30');
    expect(fmtWeekday(d)).toBe('zo 18 okt');
    expect(fmtDayMonth(d)).toBe('18 okt');
    expect(fmtMonthYear(d)).toBe('okt 2026');
  });
});
