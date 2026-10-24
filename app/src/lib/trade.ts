// Rekenwerk voor het handelsscherm. Puur (geen React), zodat het te testen is.
import type { Position } from '../data/sample';
import { bridge, rng } from './series';

export type Side = 'kopen' | 'verkopen';
export type OrderType = 'markt' | 'limiet';

/** Wat het handelsscherm over een belegging weet: van de server (oefenaccount) of uit de voorbeelddata. */
export type Quote = {
  posId: string;
  broker: 't212' | 'okx';
  brokerName: string;
  tk: string;
  name: string;
  unit: string;
  cur: string;
  price: number;
  eurPerUnit: number;
  fee: number;
  fx: number;
  exec: string;
  dayMax: number | null;
  usedToday: number;
  minAmount: number;
  connected: boolean;
  demo: boolean;
  sellMax: number;
  sellQty: number;
  /** Vrij saldo in euro; null = onbekend. */
  cash: number | null;
  error: string | null;
  /** Alleen bij voorbeelddata: er wordt niets verstuurd. */
  sample?: boolean;
};

export const LIMIT_STEP = 0.5;
export const MAX_LIMIT_PCT = 20;
export const MAX_DIGITS = 7;

/** Broker voor een positie, of null als je hem niet via de app kunt verhandelen. */
export function tradeVia(p: Position, live: boolean): 'Trading 212' | 'OKX' | null {
  if (!live) return p.trade ?? null;
  if (p.id.startsWith('t212-') && p.cat === 'eq' && p.price) return 'Trading 212';
  if (p.cat === 'cr' && p.price) return 'OKX';
  return null;
}

/** Keypad: bedrag als tekst met komma, max. 2 decimalen en 7 cijfers (zoals het prototype). */
export function pressAmount(x: string, key: string): string {
  if (key === '⌫') return x.slice(0, -1);
  if (key === ',') return x.includes(',') ? x : (x || '0') + ',';
  if (x === '0') x = '';
  if (x.includes(',') && x.split(',')[1].length >= 2) return x;
  if (x.replace(',', '').length >= MAX_DIGITS) return x;
  return x + key;
}

export const parseAmount = (x: string) => parseFloat(x.replace(',', '.')) || 0;

export function stepLimit(pct: number, dir: 1 | -1): number {
  const next = Math.round((pct + dir * LIMIT_STEP) * 10) / 10;
  return Math.max(-MAX_LIMIT_PCT, Math.min(MAX_LIMIT_PCT, next));
}

export type Estimate = {
  qty: number;
  fee: number;
  /** Kopen: wat je betaalt. Verkopen: wat je ontvangt. */
  total: number;
  limitPrice: number;
  max: number;
  error: string;
};

export function estimate(q: Quote, side: Side, amount: number, type: OrderType, limitPct: number): Estimate {
  const factor = type === 'limiet' ? 1 + limitPct / 100 : 1;
  const qty = amount / (q.eurPerUnit * factor);
  const fee = amount * (q.fee + q.fx);
  const isBuy = side === 'kopen';
  const left = q.dayMax == null ? Infinity : Math.max(0, q.dayMax - q.usedToday);
  const max = Math.min(isBuy ? (q.cash ?? Infinity) : q.sellMax, left);

  let error = '';
  if (amount <= 0) error = 'Voer een bedrag in';
  else if (amount < q.minAmount) error = `Minimaal € ${q.minAmount}`.replace('.', ',');
  else if (!isBuy && amount > q.sellMax + 0.005) {
    error = q.sellMax <= 0 ? `Je hebt geen ${q.tk} op ${q.brokerName}` : `Max ${euro(q.sellMax)}` + (q.broker === 'okx' ? ' op OKX · Trezor is alleen-lezen' : '');
  } else if (isBuy && q.cash != null && amount + fee > q.cash + 0.005) error = `Vrij saldo ${euro(q.cash)}`;
  else if (amount > left + 0.005) error = `Dagmaximum: nog ${euro(left)} vandaag`;

  return { qty, fee, total: isBuy ? amount + fee : amount - fee, limitPrice: q.price * factor, max, error };
}

function euro(v: number): string {
  return '€ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Voorbeelddata: dezelfde gegevens als het prototype. Er gaat nooit iets naar een broker. */
export function sampleQuote(p: Position): Quote {
  const okx = p.trade === 'OKX';
  return {
    posId: p.id, broker: okx ? 'okx' : 't212', brokerName: p.trade ?? 'Trading 212', tk: p.tk, name: p.name,
    unit: p.unit ?? 'st', cur: p.cur ?? 'EUR', price: p.price ?? 0, eurPerUnit: p.value / (p.qty || 1),
    fee: okx ? 0.001 : 0, fx: p.cur === 'USD' ? 0.0015 : 0,
    exec: okx ? 'Direct · 24/7' : 'Markt gesloten · ma 19 okt 09:00',
    dayMax: null, usedToday: 0, minAmount: 1, connected: true, demo: true,
    sellMax: p.sellMax ?? p.value, sellQty: p.qty ?? 0, cash: null, error: null, sample: true,
  };
}

export type Candle = { o: number; h: number; l: number; c: number; v: number };

/** 40 candles van 15 minuten voor de voorbeelddata (zelfde formule als het prototype). */
export function sampleCandles(p: Position): Candle[] {
  const price = p.price ?? 0;
  const cs = bridge(p.tk.length * 97 + 7, 41, price * (1 - (p.returns ? p.returns[0] : 0) / 100), price, p.cat === 'cr' ? 0.006 : 0.003);
  const r = rng(p.tk.charCodeAt(0) * 13 + 5);
  return Array.from({ length: 40 }, (_, i) => {
    const o = cs[i], c = cs[i + 1];
    return { o, c, h: Math.max(o, c) * (1 + r() * 0.0025), l: Math.min(o, c) * (1 - r() * 0.0025), v: 0.25 + r() * 0.75 };
  });
}

/** Uniek per bevestiging; de server verstuurt een order met dezelfde id nooit twee keer. */
export function requestId(now = Date.now(), rand = Math.random()): string {
  return `m${now.toString(36)}${Math.floor(rand * 36 ** 6).toString(36)}`;
}
