// Bedragen die verdwijnen in privacymodus: "€ ••••". Procenten blijven zichtbaar.
import { useApp } from '../state/app';
import { EURO, eur, signedEur } from '../lib/format';

export function useMoney() {
  const { privacy } = useApp();
  return {
    privacy,
    /** € 18.220 (of € 18.220,00 met decimals) */
    money: (v: number, decimals = false) => (privacy ? `${EURO}••••` : eur(v, decimals)),
    /** +€ 412,18 */
    signed: (v: number, decimals = false) => (privacy ? '••••' : signedEur(v, decimals)),
    /** Kale tekst die ook verborgen moet worden. */
    hide: (s: string) => (privacy ? '••••' : s),
  };
}
