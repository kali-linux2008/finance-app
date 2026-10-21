// Regels rond de pincode. Puur, zodat het te testen is; opslag zit in state/lock.tsx.

export const PIN_LENGTH = 5;
/** Na zoveel foute pogingen moet je even wachten. */
export const ATTEMPTS_PER_ROUND = 5;
const BASE_WAIT_MS = 30_000;
const MAX_WAIT_MS = 15 * 60_000;

/** Voegt een cijfer toe (max. PIN_LENGTH) of haalt het laatste weg. */
export function pressKey(pin: string, key: string): string {
  if (key === 'backspace') return pin.slice(0, -1);
  if (/^\d$/.test(key) && pin.length < PIN_LENGTH) return pin + key;
  return pin;
}

/**
 * Wachttijd na foute pogingen: elke 5 fouten 30 s, daarna steeds dubbel zo lang (max. 15 min).
 * Geeft het tijdstip (ms) terug waarop je weer mag proberen, of 0 als er geen wachttijd is.
 */
export function lockoutEnds(failures: number, lastFailureAt: number): number {
  if (failures < ATTEMPTS_PER_ROUND || failures % ATTEMPTS_PER_ROUND !== 0) return 0;
  const round = failures / ATTEMPTS_PER_ROUND;
  return lastFailureAt + Math.min(BASE_WAIT_MS * 2 ** (round - 1), MAX_WAIT_MS);
}

/** Resterende wachttijd in ms (0 = je mag weer proberen). */
export function lockoutRemaining(failures: number, lastFailureAt: number, now: number): number {
  return Math.max(0, lockoutEnds(failures, lastFailureAt) - now);
}

/** Te simpele codes zoals 11111 of 12345 weigeren we bij het instellen. */
export function isTooSimple(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  const up = '0123456789';
  const down = '9876543210';
  return up.includes(pin) || down.includes(pin);
}

/** Tekst die je in de opslag bewaart: zout en hash, nooit de pincode zelf. */
export const pinRecord = (salt: string, hash: string) => `${salt}:${hash}`;
export function parsePinRecord(rec: string): { salt: string; hash: string } | null {
  const [salt, hash] = rec.split(':');
  return salt && hash ? { salt, hash } : null;
}

/** Na zo lang op de achtergrond vraagt de app opnieuw om je pincode. */
export const RELOCK_AFTER_MS = 60_000;
