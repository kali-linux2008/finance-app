// Ontwerpwaarden uit docs/tokens.json en de CSS-variabelen van het v4-prototype.
// Goud = waarde (totalen, doelen), blauw (accent) = acties.

export type Palette = {
  bg: string; surface: string; surface2: string; surfaceGrad: string;
  ink: string; muted: string; faint: string; line: string;
  accent: string; onAccent: string; accentSoft: string;
  gold: string; onGold: string; goldLine: string;
  pos: string; neg: string; scrim: string;
  heroMuted: string;
  heroBg: string; heroFrame: string; heroGloss: string;
  btnBg: string; btnShadow: string; goldRing: string;
  nav: string; navIcon: string; navOn: string; navOnInk: string;
  /** Kleurvakken per klasse: achtergrond, tekst, gedempte tekst. */
  t1: string; t1i: string; t1m: string;
  t2: string; t2i: string; t2m: string;
  t3: string; t3i: string; t3m: string;
  t4: string; t5: string;
  /** Tint van stijgers/dalers in de volglijst (r,g,b). */
  posRgb: string; negRgb: string;
};

export const dark: Palette = {
  bg: '#15140F', surface: '#1E1C17', surface2: '#2A2822', surfaceGrad: 'linear-gradient(180deg, #22201A, #1C1A15)',
  ink: '#F2EEE4', muted: '#A39D90', faint: '#6F6A60', line: 'rgba(255,250,240,0.09)',
  accent: '#8EA2F0', onAccent: '#0F1530', accentSoft: '#2A3360',
  gold: '#D9BC82', onGold: '#241D0E', goldLine: 'rgba(217,188,130,0.35)',
  pos: '#6BC48F', neg: '#E8826E', scrim: 'rgba(0,0,0,0.55)',
  heroMuted: '#C4CCEF',
  heroBg: 'radial-gradient(130% 90% at 100% 0%, #4361D6 0%, #2840A8 42%, #141F5A 100%)',
  heroFrame: 'linear-gradient(135deg, rgba(232,207,154,0.75), rgba(217,188,130,0.08) 38%, rgba(217,188,130,0.06) 62%, rgba(232,207,154,0.55))',
  heroGloss: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0) 32%)',
  btnBg: 'linear-gradient(180deg, #A3B4F6, #7F95EA)',
  btnShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), 0 0 0 1px rgba(217,188,130,0.35), 0 12px 24px -12px rgba(142,162,240,0.7)',
  goldRing: 'inset 0 0 0 1px rgba(217,188,130,0.3)',
  nav: '#F2EEE4', navIcon: '#6F6A60', navOn: '#15140F', navOnInk: '#F2EEE4',
  t1: '#2A3B8F', t1i: '#FFFFFF', t1m: '#C4CCEF',
  t2: '#4A3F25', t2i: '#F2E6C8', t2m: '#CDBB8E',
  t3: '#2C3A31', t3i: '#E3EEE6', t3m: '#A9C2B1',
  t4: '#2A2822', t5: '#3A3224',
  posRgb: '107,196,143', negRgb: '232,130,110',
};

export const light: Palette = {
  bg: '#F5F0E6', surface: '#FDFAF3', surface2: '#ECE5D6', surfaceGrad: 'linear-gradient(180deg, #FFFDF8, #F7F1E4)',
  ink: '#1B1912', muted: '#6B665B', faint: '#A39D90', line: 'rgba(90,66,24,0.11)',
  accent: '#3550C9', onAccent: '#FFFFFF', accentSoft: '#E1E6F8',
  gold: '#8A6420', onGold: '#FFF8E6', goldLine: 'rgba(138,100,32,0.42)',
  pos: '#2F7A4F', neg: '#B3412E', scrim: 'rgba(23,24,28,0.4)',
  heroMuted: '#DDE3FA',
  heroBg: 'radial-gradient(130% 90% at 100% 0%, #4F6AE0 0%, #2B43B5 42%, #16226A 100%)',
  heroFrame: 'linear-gradient(135deg, rgba(201,163,95,0.95), rgba(201,163,95,0.18) 38%, rgba(201,163,95,0.12) 62%, rgba(201,163,95,0.8))',
  heroGloss: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0) 32%)',
  btnBg: 'linear-gradient(180deg, #4A66DE, #2A41B0)',
  btnShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 0 0 1px rgba(138,100,32,0.3), 0 12px 24px -12px rgba(53,80,201,0.6)',
  goldRing: 'inset 0 0 0 1px rgba(138,100,32,0.36)',
  nav: '#1B1912', navIcon: '#A39D90', navOn: '#FFFFFF', navOnInk: '#17181C',
  t1: '#1F2A5C', t1i: '#FFFFFF', t1m: '#C4CCEF',
  t2: '#E8D9B4', t2i: '#2B2414', t2m: '#5A4A26',
  t3: '#D6DED6', t3i: '#1E2A22', t3m: '#3E5146',
  t4: '#E6E1D5', t5: '#EDE2CA',
  posRgb: '107,196,143', negRgb: '232,130,110',
};

/** Vaste kleuren op de blauwe hero (gelijk in beide thema's). */
export const hero = {
  amount: '#F6E7C4',
  cents: '#C9B27E',
  label: '#E2CB98',
  rule: '#D9BC82',
  chipOn: '#D9BC82',
  chipOnInk: '#241D0E',
  btcLine: '#F2D48F',
  innerFrame: 'rgba(217,188,130,0.16)',
  shadow: '0 28px 56px -28px rgba(30,50,170,0.85), inset 0 1px 0 rgba(255,255,255,0.14)',
};

export const font = {
  serif: 'SourceSerif4_400Regular',
  serifMedium: 'SourceSerif4_500Medium',
  sans: 'Manrope_400Regular',
  sansMedium: 'Manrope_500Medium',
  sansSemi: 'Manrope_600SemiBold',
  sansBold: 'Manrope_700Bold',
};

export const space = { screenText: 24, cardInset: 16, sectionTop: 30, sectionBottom: 12, cardGap: 12, cardPadding: 20 };
export const radius = { hero: 28, card: 20, tile: 18, chip: 10, pill: 999, button: 26, sheet: 28 };

export const motion = {
  /** Scherm schuift 28px in en vervaagt in, 400ms. */
  screenIn: 400,
  rowStagger: 35,
  rowDuration: 450,
  maxRows: 12,
  countUp: 1500,
  chartDraw: 1300,
  toast: 2400,
};
