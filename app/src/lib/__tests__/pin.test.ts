import { isTooSimple, lockoutEnds, lockoutRemaining, parsePinRecord, pinRecord, pressKey } from '../pin';

describe('pincode invoeren', () => {
  it('voegt cijfers toe tot 5 en wist het laatste', () => {
    let p = '';
    for (const k of '123456') p = pressKey(p, k);
    expect(p).toBe('12345');
    expect(pressKey(p, 'backspace')).toBe('1234');
    expect(pressKey('', 'backspace')).toBe('');
    expect(pressKey('12', 'fingerprint')).toBe('12');
  });
});

describe('wachttijd na foute pogingen', () => {
  it('geen wachttijd onder de 5 fouten', () => {
    expect(lockoutEnds(4, 1000)).toBe(0);
    expect(lockoutRemaining(4, 1000, 1000)).toBe(0);
  });
  it('30 s na 5 fouten, dan dubbel, max. 15 min', () => {
    expect(lockoutRemaining(5, 0, 0)).toBe(30_000);
    expect(lockoutRemaining(5, 0, 29_000)).toBe(1_000);
    expect(lockoutRemaining(5, 0, 31_000)).toBe(0);
    expect(lockoutRemaining(10, 0, 0)).toBe(60_000);
    expect(lockoutRemaining(50, 0, 0)).toBe(15 * 60_000);
  });
  it('na de wachttijd mag je weer 4 keer proberen voordat je opnieuw wacht', () => {
    expect(lockoutEnds(6, 0)).toBe(0);
    expect(lockoutEnds(9, 0)).toBe(0);
  });
});

describe('pincode kiezen', () => {
  it('weigert te simpele codes', () => {
    expect(isTooSimple('11111')).toBe(true);
    expect(isTooSimple('12345')).toBe(true);
    expect(isTooSimple('54321')).toBe(true);
    expect(isTooSimple('90817')).toBe(false);
  });
  it('bewaart zout en hash samen', () => {
    expect(parsePinRecord(pinRecord('ab', 'cd'))).toEqual({ salt: 'ab', hash: 'cd' });
    expect(parsePinRecord('kapot')).toBeNull();
  });
});
